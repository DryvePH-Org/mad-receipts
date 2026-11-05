import { clean, findColumn, parseMoney, parsePrice, parseSheetDate, people, plateKey, yearOfTab } from "./parse";

// The BUY side: the monthly purchase tabs, the HOLD tab and the buying summary of the buying sheet.

export interface Purchase {
  tab: string;
  /** YYYY-MM-DD of the purchase, null when the row has no date */
  date: string | null;
  unit: string;
  plate: string;
  price: number | null;
  priceText: string;
  agentFee: number | null;
  source: string;
  appraiser: string;
  /** who bought it: "KAREN", or two people for "Justine/Karen" */
  team: string[];
  bank: string;
  payoff: string;
  hold: number | null;
}

const isPlate = (v: string) => v.length >= 5 && /\d/.test(v) && /[A-Z]/.test(v);

/**
 * The purchases of one monthly tab. The tab has a small table on the left (counts by source) and the purchased units on the right,
 * under headers like BRAND / TYPE / PLATE NUMBER / REAL BUYING. Older months use other headers (Unit, Price), so columns are found by name.
 */
export function parsePurchases(rows: string[][], tab: string): Purchase[] {
  const hi = rows.slice(0, 6).findIndex((r) => r.some((c) => /plate/i.test(c)));
  if (hi < 0) return [];
  const h = rows[hi].map(clean);
  const col = {
    plate: findColumn(h, /plate/i), brand: findColumn(h, "brand"), type: findColumn(h, "type"), unit: findColumn(h, "unit"), mileage: findColumn(h, "mileage"),
    price: findColumn(h, "real buying", "price"), fee: findColumn(h, "buying agent"), source: findColumn(h, "source"), appraiser: findColumn(h, "appraiser"),
    team: findColumn(h, "buying team"), bank: findColumn(h, "bank"), payoff: findColumn(h, /payoff/i), hold: findColumn(h, /hold amount/i),
  };
  if (col.plate < 0) return [];
  const year = yearOfTab(tab, new Date().getFullYear());
  const first = (col.brand >= 0 ? col.brand : col.unit) - 2; // the date sits just before the unit, after the row number
  const last = (col.mileage >= 0 ? col.mileage : col.plate) + 2;
  const out: Purchase[] = [];
  for (const row of rows.slice(hi + 1)) {
    const cell = (i: number) => (i >= 0 ? clean(row[i]) : "");
    const plate = plateKey(cell(col.plate));
    if (!isPlate(plate)) continue;
    let date: string | null = null;
    for (let i = Math.max(0, first); i <= last && !date; i++) date = parseSheetDate(row[i], year);
    const yearCell = col.brand > 0 ? cell(col.brand - 1) : "";
    const unit = col.unit >= 0 && col.brand < 0 ? cell(col.unit) : [/^\d{4}$/.test(yearCell) ? yearCell : "", cell(col.brand), cell(col.type)].filter(Boolean).join(" ");
    out.push({
      tab, date, unit, plate, price: parsePrice(cell(col.price)), priceText: cell(col.price), agentFee: parseMoney(cell(col.fee)), source: cell(col.source),
      appraiser: cell(col.appraiser).toUpperCase(), team: people(cell(col.team)), bank: cell(col.bank), payoff: cell(col.payoff), hold: parseMoney(cell(col.hold)),
    });
  }
  return out;
}

export interface Hold {
  since: string | null;
  unit: string;
  plate: string;
  purchaser: string[];
  holdAmount: number | null;
  lacking: string;
  bank: string;
  /** the date it went out, when one is written */
  out: string | null;
  agreedPrice: number | null;
  payoff: number | null;
  balanceToClient: number | null;
  remarks: string;
  /** "X" in the first column means settled */
  settled: boolean;
}

/** The HOLD tab: money held on a unit while papers, a bank payoff or a balance are settled. Rows marked X are settled. */
export function parseHolds(rows: string[][]): Hold[] {
  const hi = rows.slice(0, 4).findIndex((r) => r.some((c) => /plate/i.test(c)));
  if (hi < 0) return [];
  const h = rows[hi].map(clean);
  const col = {
    date: findColumn(h, /purchases date|^date/i), unit: findColumn(h, "unit"), plate: findColumn(h, /plate/i), who: findColumn(h, "point person"), hold: findColumn(h, "hold amount (in)"),
    lacking: findColumn(h, "lacking docs"), bank: findColumn(h, /encumbrance/i), out: findColumn(h, "out"), price: findColumn(h, "agreed price"), payoff: findColumn(h, "pay off amount"),
    balance: findColumn(h, "balance to client"), remarks: findColumn(h, "remarks"),
  };
  const year = new Date().getFullYear();
  const out: Hold[] = [];
  for (const row of rows.slice(hi + 1)) {
    const cell = (i: number) => (i >= 0 ? clean(row[i]) : "");
    const plate = plateKey(cell(col.plate));
    if (!isPlate(plate) || /^borrow/i.test(cell(col.unit))) continue;
    out.push({
      since: parseSheetDate(cell(col.date), year), unit: cell(col.unit), plate, purchaser: people(cell(col.who)), holdAmount: parseMoney(cell(col.hold)), lacking: cell(col.lacking),
      bank: cell(col.bank), out: parseSheetDate(cell(col.out), year), agreedPrice: parseMoney(cell(col.price)), payoff: parseMoney(cell(col.payoff)),
      balanceToClient: parseMoney(cell(col.balance)), remarks: cell(col.remarks), settled: clean(row[0]).toUpperCase() === "X",
    });
  }
  return out;
}

export interface MonthSummary { month: string; bought: number | null; entries: number | null; batting: string }

/** "BUYING SUMMARY" tab: bought, entries and batting average per month (the months run across). */
export function parseBuyingSummary(rows: string[][]): MonthSummary[] {
  const head = rows.find((r) => /^summary$/i.test(clean(r[0])));
  if (!head) return [];
  const line = (label: RegExp) => rows.find((r) => label.test(clean(r[0])));
  const bought = line(/^bought$/i), entries = line(/entries/i), batting = line(/batting/i);
  const out: MonthSummary[] = [];
  head.forEach((name, i) => {
    const month = clean(name).toUpperCase();
    if (i === 0 || !/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/.test(month)) return;
    const num = (r?: string[]) => { const n = parseMoney(r?.[i]); return n === null ? null : n; };
    out.push({ month: clean(name), bought: num(bought), entries: num(entries), batting: clean(batting?.[i]) });
  });
  return out;
}

// ---- what the dashboard shows ----

export interface BuyDashboard {
  today: string;
  /** units bought (or reserved for purchase) today */
  todayPurchases: Purchase[];
  /** this month so far */
  month: { tab: string; count: number; total: number; purchases: Purchase[] } | null;
  holds: Hold[];
  payables: { unit: string; plate: string; purchaser: string[]; toClient: number; toBank: number; bank: string; held: number; total: number }[];
  madBank: { total: number; count: number; items: Purchase[] };
  scoreboard: { name: string; bought: number; amount: number }[];
  sources: { source: string; count: number }[];
  history: { month: string; count: number; total: number; bought: number | null; entries: number | null; batting: string }[];
}

/** "AGENT: BYD BGC - X", "FAST CASH AUTO" ... → the group the team reports on. */
export function sourceGroup(text: string): string {
  const t = clean(text).toLowerCase();
  if (!t) return "No source";
  if (t.startsWith("agent") || t.includes("casa")) return "Agents";
  if (t.includes("fast cash")) return "Fast Cash";
  if (t.includes("marketplace") || t.startsWith("fb")) return "FB Marketplace";
  if (t.includes("mobee")) return "Mobee";
  if (t.includes("website") || t.includes("google")) return "Website";
  if (t.includes("walk")) return "Walk in";
  if (t.includes("repeat")) return "Repeat client";
  if (t.includes("bank")) return "Banks";
  if (t.includes("mad")) return "MAD page";
  return clean(text);
}

const monthKey = (iso: string | null) => (iso ? iso.slice(0, 7) : "");

export function buildBuyDashboard(input: { today: string; month: { tab: string; rows: string[][] } | null; monthTabs: { tab: string; rows: string[][] }[]; holdRows: string[][] | null; summaryRows: string[][] | null }): BuyDashboard {
  const purchases = input.month ? parsePurchases(input.month.rows, input.month.tab) : [];
  const total = (list: Purchase[]) => list.reduce((n, p) => n + (p.price ?? 0), 0);
  const holds = (input.holdRows ? parseHolds(input.holdRows) : []).filter((x) => !x.settled && !x.out);

  const payables = holds
    .filter((x) => (x.balanceToClient ?? 0) > 0 || (x.payoff ?? 0) > 0)
    .map((x) => ({ unit: x.unit, plate: x.plate, purchaser: x.purchaser, toClient: x.balanceToClient ?? 0, toBank: x.payoff ?? 0, bank: x.bank, held: x.holdAmount ?? 0, total: (x.balanceToClient ?? 0) + (x.payoff ?? 0) }))
    .sort((a, b) => b.total - a.total);

  const madItems = purchases.filter((p) => /mad\s*bank/i.test(`${p.bank} ${p.payoff}`));
  const credit = new Map<string, { bought: number; amount: number }>();
  for (const p of purchases) {
    const who = p.team.length ? p.team : ["UNASSIGNED"];
    for (const name of who) {
      const c = credit.get(name) ?? { bought: 0, amount: 0 };
      c.bought += 1 / who.length; c.amount += (p.price ?? 0) / who.length; credit.set(name, c);
    }
  }
  const sources = new Map<string, number>();
  for (const p of purchases) sources.set(sourceGroup(p.source), (sources.get(sourceGroup(p.source)) ?? 0) + 1);

  const summary = input.summaryRows ? parseBuyingSummary(input.summaryRows) : [];
  const byMonth = new Map<string, MonthSummary>(summary.map((s) => [s.month.slice(0, 3).toUpperCase(), s]));
  const history = input.monthTabs.map(({ tab, rows }) => {
    const list = parsePurchases(rows, tab);
    const s = byMonth.get(tab.trim().slice(0, 3).toUpperCase());
    return { month: tab, count: list.length, total: total(list), bought: s?.bought ?? null, entries: s?.entries ?? null, batting: s?.batting ?? "" };
  });

  return {
    today: input.today,
    todayPurchases: purchases.filter((p) => p.date === input.today),
    month: input.month ? { tab: input.month.tab, count: purchases.length, total: total(purchases), purchases } : null,
    holds, payables,
    madBank: { total: total(madItems), count: madItems.length, items: madItems },
    scoreboard: [...credit].map(([name, c]) => ({ name, bought: Math.round(c.bought * 10) / 10, amount: c.amount })).sort((a, b) => b.bought - a.bought || b.amount - a.amount),
    sources: [...sources].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    history,
  };
}

export { monthKey };
