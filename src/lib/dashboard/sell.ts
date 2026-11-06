import { DEFAULT_SETTINGS, goalFor, type AppSettings } from "@/lib/deal/settings";
import { sameName } from "@/lib/docs/names";
import { clean, parseMoney, parsePrice, parseSheetDate, people, plateKey, yearOfTab } from "./parse";

// The SELL side: the monthly Sold ledger and Entries (leads) tabs of the sales sheet.

/** One row of a car in the sheet (a car can have a RESERVATION row and, later, a FULLY PAID row). */
export interface HistoryEntry { tab: string; row: number; status: string; reservationDate: string; releaseDate: string | null; link: string | null }

export interface Sale {
  tab: string;
  /** newer tabs have a higher order (the Jan-Sept ledger is -1); with the row number it says which row of a car is the latest */
  order: number;
  row: number;
  salesman: string[];
  marketing: string[];
  unit: string;
  transmission: string;
  plate: string;
  listingPrice: number | null;
  targetPrice: number | null;
  /** the sheet's own RANGE label (ASP / BT) */
  range: string;
  agreedPrice: number | null;
  reservation: number | null;
  /** as typed ("October 14"): the year is not always right for old rows, so it is shown, not computed with */
  reservationDate: string;
  reservationIso: string | null;
  partial: number | null;
  partialDate: string;
  full: number | null;
  fullDate: string;
  financingFirm: string;
  financingAmount: number | null;
  tradeInUnit: string;
  tradeInAmount: number | null;
  balance: number | null;
  releaseDate: string | null;
  source: string;
  status: string;
  buyer: string;
  contact: string;
  /** the cleaning date, when one is written, as YYYY-MM-DD */
  deadline: string | null;
  note: string;
  /** Cash, Financing, Trade-in or both */
  kind: string;
  /** opens the sheet on this row */
  link: string | null;
  /** every row of this car and buyer in the sheet, oldest first */
  history: HistoryEntry[];
}

const COL = { salesman: 1, marketing: 2, year: 3, make: 4, model: 5, tr: 6, plate: 7, listing: 8, agreed: 10, reservation: 12, resDate: 13, partial: 14, full: 16, firm: 18, firmAmt: 19, tradeUnit: 20, tradeAmt: 21, balance: 22, release: 23, source1: 24, source2: 25, status: 26, buyer: 27, extra: 29 };

/** What the transaction is: paid in cash, financed (by whom), with a trade-in, or both. */
export function kindOf(firm: string, tradeUnit: string, tradeAmount: number | null): string {
  const financed = clean(firm) ? `Financing (${clean(firm)})` : "Cash";
  return clean(tradeUnit) || (tradeAmount ?? 0) > 0 ? `${financed} + trade-in` : financed;
}

/** One tab of the Sold ledger. The columns are in the same places every month, though the header words change. */
export function parseSold(rows: string[][], tab: string, order = 0, linkOf?: (row: number) => string | null): Sale[] {
  const hi = rows.slice(0, 5).findIndex((r) => /plate/i.test(r[COL.plate] ?? ""));
  const start = hi >= 0 ? hi + 1 : 1;
  const year = yearOfTab(tab, new Date().getFullYear());
  const out: Sale[] = [];
  for (const [offset, row] of rows.slice(start).entries()) {
    const c = (i: number) => clean(row[i]);
    const plate = plateKey(c(COL.plate));
    if (plate.length < 5 || !/\d/.test(plate)) continue;
    const extra = c(COL.extra);
    const firm = c(COL.firm), tradeUnit = c(COL.tradeUnit), tradeAmt = parseMoney(c(COL.tradeAmt));
    out.push({
      tab, order, row: start + offset, salesman: people(c(COL.salesman)), marketing: people(c(COL.marketing)), unit: [c(COL.year), c(COL.make), c(COL.model)].filter(Boolean).join(" "), transmission: c(COL.tr), plate,
      listingPrice: parsePrice(c(COL.listing)), targetPrice: parsePrice(c(9)), range: c(11), agreedPrice: parsePrice(c(COL.agreed)), reservation: parseMoney(c(COL.reservation)), reservationDate: c(COL.resDate), reservationIso: parseSheetDate(c(COL.resDate), year),
      partial: parseMoney(c(COL.partial)), partialDate: c(15), full: parseMoney(c(COL.full)), fullDate: c(17), financingFirm: firm, financingAmount: parseMoney(c(COL.firmAmt)), tradeInUnit: tradeUnit, tradeInAmount: tradeAmt,
      balance: parseMoney(c(COL.balance)), releaseDate: parseSheetDate(c(COL.release), year),
      source: [c(COL.source1), c(COL.source2)].filter(Boolean).join(" · "), status: c(COL.status).toUpperCase(), buyer: c(COL.buyer), contact: c(28),
      deadline: parseSheetDate(extra, year), note: parseSheetDate(extra, year) ? "" : extra, kind: kindOf(firm, tradeUnit, tradeAmt),
      link: linkOf?.(start + offset + 1) ?? null, history: [],
    });
  }
  return out;
}

export interface Entry { date: string | null; status: string; client: string; unit: string; plate: string; source: string; salesman: string[] }

/** One tab of Entries (the leads). */
export function parseEntries(rows: string[][], tab: string): Entry[] {
  const year = yearOfTab(tab, new Date().getFullYear());
  const out: Entry[] = [];
  for (const row of rows.slice(1)) {
    const c = (i: number) => clean(row[i]);
    const date = parseSheetDate(c(1), year);
    if (!date) continue;
    out.push({ date, status: c(2).toUpperCase(), client: c(3), unit: c(5), plate: plateKey(c(6)), source: [c(7), c(8)].filter(Boolean).join(" · "), salesman: people(c(11)) });
  }
  return out;
}

const isCancelled = (s: Sale) => s.status === "CANCELLED" || s.status === "CANCELED";
/** Released = the unit has gone out: a release date, or fully paid. */
export const isReleased = (s: Sale) => !isCancelled(s) && !!s.releaseDate;
/** Pending = sold or reserved but not yet released, and not cancelled. */
export const isPending = (s: Sale) => !isCancelled(s) && !s.releaseDate;

/** A reserve: the buyer only put down a reservation and has not paid in full yet. Anything further along is a pending sale. */
export const isReserve = (s: Sale) => /reserv/i.test(s.status) && !s.full;

export type Alert = "overdue" | "due-today" | "soon" | "none";
/** How long a reservation may stay open when the sheet gives no date: DASHBOARD_PENDING_DAYS, default 14. */
export const PENDING_DAYS = Number(process.env.DASHBOARD_PENDING_DAYS) || 14;
export interface Pending extends Sale { alert: Alert; daysLate: number; due: string | null; dueSource: "cleaning date" | "reservation + days" | null; daysOpen: number | null }

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function pendingWithAlerts(sales: Sale[], today: string, windowDays = PENDING_DAYS): Pending[] {
  const rank = { overdue: 0, "due-today": 1, soon: 2, none: 3 } as const;
  return sales.filter(isPending).map((s) => {
    // A reservation cannot be in the future: a "December 8" in a January tab is last year's.
    let reserved = s.reservationIso;
    if (reserved && reserved > today) reserved = `${Number(reserved.slice(0, 4)) - 1}${reserved.slice(4)}`;
    const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const due = s.deadline ?? (reserved ? addDays(reserved, windowDays) : null);
    const late = due ? daysBetween(due, today) : 0;
    const alert: Alert = !due ? "none" : late > 0 ? "overdue" : late === 0 ? "due-today" : late >= -3 ? "soon" : "none";
    return { ...s, due, dueSource: s.deadline ? "cleaning date" as const : due ? "reservation + days" as const : null, alert, daysLate: Math.max(0, late), daysOpen: reserved ? daysBetween(reserved, today) : null };
  }).sort((a, b) => rank[a.alert] - rank[b.alert] || (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}

export interface SellScore { name: string; entriesToday: number; reservedToday: number; releasedToday: number; entriesMonth: number; reservedMonth: number; releasedMonth: number; conversion: number | null }

/** Credit is shared when a sale has several salespeople ("DAVID, ARON" gives each half). */
export function scoreboard(entries: Entry[], sales: Sale[], today: string): SellScore[] {
  const month = today.slice(0, 7);
  const rows = new Map<string, SellScore>();
  const row = (name: string) => { let r = rows.get(name); if (!r) { r = { name, entriesToday: 0, reservedToday: 0, releasedToday: 0, entriesMonth: 0, reservedMonth: 0, releasedMonth: 0, conversion: null }; rows.set(name, r); } return r; };
  const share = (names: string[], add: (r: SellScore, w: number) => void) => { const who = names.length ? names : ["UNASSIGNED"]; for (const n of who) add(row(n), 1 / who.length); };
  for (const e of entries) {
    if (!e.date || !e.date.startsWith(month)) continue;
    share(e.salesman, (r, w) => { r.entriesMonth += w; if (e.date === today) r.entriesToday += w; });
  }
  for (const s of sales) {
    if (isCancelled(s)) continue;
    if (s.reservationIso?.startsWith(month)) share(s.salesman, (r, w) => { r.reservedMonth += w; if (s.reservationIso === today) r.reservedToday += w; });
    if (s.releaseDate?.startsWith(month)) share(s.salesman, (r, w) => { r.releasedMonth += w; if (s.releaseDate === today) r.releasedToday += w; });
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  return [...rows.values()].map((r) => ({
    ...r, entriesToday: round(r.entriesToday), reservedToday: round(r.reservedToday), releasedToday: round(r.releasedToday), entriesMonth: round(r.entriesMonth), reservedMonth: round(r.reservedMonth), releasedMonth: round(r.releasedMonth),
    conversion: r.entriesMonth > 0 ? Math.round((r.releasedMonth / r.entriesMonth) * 1000) / 10 : null,
  })).sort((a, b) => b.releasedMonth - a.releasedMonth || b.reservedMonth - a.reservedMonth || b.entriesMonth - a.entriesMonth);
}


/**
 * The sheet works like a ledger: when a reserved car is paid and released, staff add a NEW row (in the month of the release, and the
 * consolidated Jan-Sept tab gets one too) and leave the old RESERVATION row where it was. So a car's real state is the furthest it got:
 *   released or cancelled  >  paid, waiting for release  >  reserved
 * Rows of one car are grouped by plate and buyer (a car sold twice is two sales). A reservation is also dead when the car was later
 * released to a DIFFERENT buyer. Only one row per sale is returned.
 */
export function currentSales(sales: Sale[], today = new Date().toISOString().slice(0, 10)): Sale[] {
  const stage = (s: Sale) => (isCancelled(s) || s.releaseDate ? 3 : s.status === "FULLY PAID" ? 2 : 1);
  const furthest = (list: Sale[]) => list.reduce((best, s) => (stage(s) > stage(best) || (stage(s) === stage(best) && (s.order > best.order || (s.order === best.order && s.row > best.row))) ? s : best));
  // a reservation cannot be in the future: a "December 8" in a January tab is last year's
  const reservedOn = (s: Sale) => (s.reservationIso && s.reservationIso > today ? `${Number(s.reservationIso.slice(0, 4)) - 1}${s.reservationIso.slice(4)}` : s.reservationIso);
  const byPlate = new Map<string, Sale[]>();
  for (const s of sales) byPlate.set(s.plate, [...(byPlate.get(s.plate) ?? []), s]);
  const current: Sale[] = [];
  for (const list of byPlate.values()) {
    const clusters: Sale[][] = [];
    for (const s of [...list].sort((a, b) => a.order - b.order || a.row - b.row)) {
      const home = clusters.find((c) => c.some((x) => !x.buyer || !s.buyer || sameName(x.buyer, s.buyer)));
      if (home) home.push(s); else clusters.push([s]);
    }
    const winners = clusters.map(furthest);
    for (const w of winners) {
      const dead = stage(w) < 3 && winners.some((o) => o !== w && !isCancelled(o) && o.releaseDate && (reservedOn(w) ? o.releaseDate >= reservedOn(w)! : o.order >= w.order));
      if (!dead) current.push(w);
    }
  }
  return current;
}

/** What a pending sale is waiting for, in plain words. */
export function waitingFor(s: Sale): { label: string; owes: number } {
  const owes = s.balance ?? 0;
  if (owes > 0) return { label: "Waiting for the buyer's balance", owes };
  if ((s.financingAmount ?? 0) > 0) return { label: `Waiting for the loan from ${s.financingFirm || "the lender"}`, owes: Math.max(0, owes) };
  return { label: "Paid, waiting for release", owes: Math.max(0, owes) };
}

export interface SellDashboard {
  notes: import("./parse").DataNotes;
  today: string;
  /** the goal of units released each month */
  /** the target of units released this month (set by the Admin) */
  goal: number;
  releasedThisMonth: number;
  releasedToday: Sale[];
  /** every released sale (newest first), for searching and filtering */
  released: Sale[];
  /** every open sale: reserves and pending sales together */
  pending: Pending[];
  reserves: Pending[];
  pendingSales: Pending[];
  overdue: Pending[];
  score: SellScore[];
  history: { month: string; released: number; amount: number; goal: number }[];
  entryStatuses: { status: string; count: number }[];
}

export function buildSellDashboard(input: { today: string; sold: { tab: string; rows: string[][]; order: number; linkOf?: (row: number) => string | null }[]; entries: { tab: string; rows: string[][] }[]; goals?: AppSettings["dashboard"] }): SellDashboard {
  const goals = input.goals ?? DEFAULT_SETTINGS.dashboard;
  const all = input.sold.flatMap(({ tab, rows, order, linkOf }) => parseSold(rows, tab, order, linkOf));
  const sales = currentSales(all, input.today);
  for (const s of sales) s.history = all.filter((o) => o.plate === s.plate && (!o.buyer || !s.buyer || sameName(o.buyer, s.buyer))).sort((a, b) => a.order - b.order || a.row - b.row).map((o) => ({ tab: o.tab, row: o.row, status: o.status, reservationDate: o.reservationDate, releaseDate: o.releaseDate, link: o.link }));
  const entries = input.entries.flatMap(({ tab, rows }) => parseEntries(rows, tab));
  const pending = pendingWithAlerts(sales, input.today, goals.pendingDays);
  const releasedAll = sales.filter(isReleased).sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
  const history = new Map<string, { released: number; amount: number }>();
  for (const s of releasedAll) {
    const m = s.releaseDate!.slice(0, 7), h = history.get(m) ?? { released: 0, amount: 0 };
    h.released++; h.amount += s.agreedPrice ?? 0; history.set(m, h);
  }
  const month = input.today.slice(0, 7);
  const statuses = new Map<string, number>();
  for (const e of entries) if (e.date?.startsWith(month)) statuses.set(e.status || "NO STATUS", (statuses.get(e.status || "NO STATUS") ?? 0) + 1);
  return {
    notes: { failed: [], staleSince: null },
    today: input.today, goal: goalFor(goals, month, "sell"),
    releasedThisMonth: releasedAll.filter((s) => s.releaseDate!.startsWith(month)).length,
    releasedToday: releasedAll.filter((s) => s.releaseDate === input.today),
    released: releasedAll, pending, reserves: pending.filter(isReserve), pendingSales: pending.filter((p) => !isReserve(p)), overdue: pending.filter((p) => p.alert === "overdue"),
    score: scoreboard(entries, sales, input.today),
    history: [...history].map(([m, h]) => ({ month: m, ...h, goal: goalFor(goals, m, "sell") })).sort((a, b) => b.month.localeCompare(a.month)),
    entryStatuses: [...statuses].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
  };
}
