import { describe, expect, it } from "vitest";
import { buildBuyDashboard, parseBuyingSummary, parseHolds, parsePurchases, sourceGroup } from "@/lib/dashboard/buy";
import { buildSellDashboard, currentSales, kindOf, parseEntries, parseSold, pendingWithAlerts, scoreboard, waitingFor } from "@/lib/dashboard/sell";

const row = (len: number, cells: Record<number, string>) => Array.from({ length: len }, (_, i) => cells[i] ?? "");

// ---------- the buying sheet (made-up rows, same layout as the real tabs) ----------
const monthTab = [
  row(25, { 0: "Nov 2026", 8: "BRAND", 9: "TYPE", 10: "PLATE NUMBER", 11: "COLOR", 14: "MILEAGE", 16: "RESERVATION", 17: "REAL BUYING", 18: "BUYING AGENT", 19: "Source", 20: "APPRAISER", 21: "Buying Team", 22: "BANK", 23: "Payoff? What bank", 24: "How much HOLD amount" }),
  row(25, { 1: "AS OF", 2: "11/5/2026", 6: "1", 7: "2021", 8: "FORD", 9: "TERRITORY", 10: "AAA1111", 14: "44,518 KMS", 15: "11/03/2026", 17: "400K", 18: "30K", 19: "AGENT: BYD BGC - CHONIA", 20: "ARMAN", 21: "KAREN", 22: "MAD BANK TO BDO PURCHASES" }),
  row(25, { 6: "2", 7: "2024", 8: "MITSUBISHI", 9: "STRADA", 10: "BBB2222", 15: "11/05/2026", 17: "₱1,250,000", 19: "FB MARKETPLACE", 20: "ARMAN", 21: "Justine/Karen", 22: "BDO", 23: "BPI", 24: "10k" }),
  row(25, { 6: "3" }), // an empty numbered row
  row(25, { 1: "POINT PERSON", 2: "ENTRIES", 3: "BOUGHT" }),
];
const holdTab = [
  row(16, { 1: "HOLD AMOUNT- PURCHASES DATE", 2: "UNIT", 3: "PLATE NUMBER", 4: "POINT PERSON", 5: "HOLD AMOUNT (IN)", 6: "LACKING DOCS", 7: "ENCUMBRANCE / PAID OFF", 8: "OUT", 9: "AGREED PRICE", 10: "PAY OFF AMOUNT", 11: "BALANCE TO CLIENT", 14: "REMARKS" }),
  row(16, { 0: "X", 1: "2/9/2026", 2: "2018 HONDA CITY", 3: "NBM7701", 4: "CAMILA", 5: "50,000", 9: "₱302,000.00", 11: "₱0.00" }),
  row(16, { 0: "/", 1: "09/29/2026", 2: "2023 MITSUBISHI XPANDER", 3: "DAR4015", 4: "KHAYLINE/CAMILA", 5: "100,000", 6: "ORCR, RCM", 7: "PSBANK", 9: "₱600,000.00", 10: "₱256,098.34", 11: "₱243,901.66", 14: "waiting for the bank" }),
  row(16, { 1: "09/30/2026", 2: "BORROW: 23 MITSUBISHI XP", 3: "DAR4015", 5: "100,000" }),
  row(16, { 0: "/", 1: "10/01/2026", 2: "2022 FORD TERRITORY", 3: "NES5587", 4: "KAREN", 5: "10,000", 7: "BPI", 9: "₱420,000.00", 10: "₱59,596.04", 11: "₱350,403.96" }),
];
const summaryTab = [
  row(14, { 0: "SUMMARY", 1: "JAN", 2: "FEB", 11: "NOVEMBER" }),
  row(14, { 0: "BOUGHT", 1: "39", 2: "40", 11: "2" }),
  row(14, { 0: "VIEWS / ENTRIES", 1: "102", 2: "93", 11: "11" }),
  row(14, { 0: "BATTING AVERAGE", 1: "38.24%", 2: "43.01%", 11: "18.18%" }),
];

describe("the buying sheet", () => {
  it("reads the purchased units, with money as staff type it", () => {
    const p = parsePurchases(monthTab, "NOVEMBER 2026");
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ unit: "2021 FORD TERRITORY", plate: "AAA1111", price: 400000, agentFee: 30000, appraiser: "ARMAN", team: ["KAREN"], date: "2026-11-03", bank: "MAD BANK TO BDO PURCHASES" });
    expect(p[1]).toMatchObject({ plate: "BBB2222", price: 1250000, team: ["JUSTINE", "KAREN"], hold: 10000, payoff: "BPI", date: "2026-11-05" });
  });
  it("reads an older month that has other headers (Unit, Price)", () => {
    const old = [row(17, { 8: "Unit", 9: "Mileage", 10: "Plate Number", 12: "Price", 13: "Source", 14: "APPRAISER", 15: "Buying Team" }), row(17, { 6: "1", 7: "06/01/2026", 8: "2023 Toyota Raize", 10: "NFO2285", 12: "530k", 13: "FB Marketplace", 14: "Arman", 15: "Karen" }), row(17, { 7: "06/02/2026", 8: "2021 MG5", 10: "DAV6880", 12: "230k all in", 15: "Camila" })];
    const p = parsePurchases(old, "JUNE 2026");
    expect(p.map((x) => [x.unit, x.plate, x.price])).toEqual([["2023 Toyota Raize", "NFO2285", 530000], ["2021 MG5", "DAV6880", 230000]]);
    expect(p[0].date).toBe("2026-06-01");
  });
  it("reads the holds, leaving out settled ones (X) and the borrow line", () => {
    const h = parseHolds(holdTab);
    expect(h.map((x) => [x.plate, x.settled])).toEqual([["NBM7701", true], ["DAR4015", false], ["NES5587", false]]);
    expect(h[1]).toMatchObject({ purchaser: ["KHAYLINE", "CAMILA"], holdAmount: 100000, lacking: "ORCR, RCM", bank: "PSBANK", balanceToClient: 243901.66, payoff: 256098.34 });
  });
  it("reads the monthly summary", () => {
    expect(parseBuyingSummary(summaryTab)).toEqual([{ month: "JAN", bought: 39, entries: 102, batting: "38.24%" }, { month: "FEB", bought: 40, entries: 93, batting: "43.01%" }, { month: "NOVEMBER", bought: 2, entries: 11, batting: "18.18%" }]);
  });
  it("groups sources the way the team talks about them", () => {
    expect(sourceGroup("AGENT: BYD BGC - CHONIA")).toBe("Agents");
    expect(sourceGroup("Fast Cash Auto")).toBe("Fast Cash");
    expect(sourceGroup("FB MARKETPLACE")).toBe("FB Marketplace");
    expect(sourceGroup("")).toBe("No source");
  });
  it("builds today, holds, payables, MAD Bank, the scoreboard and the history", () => {
    const d = buildBuyDashboard({ today: "2026-11-05", month: { tab: "NOVEMBER 2026", rows: monthTab }, monthTabs: [{ tab: "NOVEMBER 2026", rows: monthTab }], holdRows: holdTab, summaryRows: summaryTab });
    expect(d.todayPurchases.map((p) => p.plate)).toEqual(["BBB2222"]);
    expect(d.month).toMatchObject({ count: 2, total: 1650000 });
    expect(d.holds.map((h) => h.plate)).toEqual(["DAR4015", "NES5587"]);
    expect(d.payables.map((p) => [p.plate, p.total])).toEqual([["DAR4015", 500000], ["NES5587", 410000]]);
    expect(d.madBank).toMatchObject({ count: 1, total: 400000 });
    expect(d.scoreboard.find((s) => s.name === "KAREN")).toMatchObject({ bought: 1.5 }); // one alone, one shared with Justine
    expect(d.scoreboard.find((s) => s.name === "JUSTINE")).toMatchObject({ bought: 0.5 });
    expect(d.sources).toEqual(expect.arrayContaining([{ source: "Agents", count: 1 }, { source: "FB Marketplace", count: 1 }]));
    expect(d.history).toEqual([{ month: "NOVEMBER 2026", count: 2, total: 1650000, bought: 2, entries: 11, batting: "18.18%", goal: 60 }]);
  });
  it("copes with a month that has no tab yet and no hold tab", () => {
    const d = buildBuyDashboard({ today: "2026-12-01", month: null, monthTabs: [], holdRows: null, summaryRows: null });
    expect(d).toMatchObject({ month: null, holds: [], payables: [], todayPurchases: [] });
  });
});

// ---------- the sales sheet ----------
const sold = (c: Record<number, string>) => row(30, { 1: "DAVID", ...c });
const soldHeader = row(30, { 1: "GOAL: 50 SOLD SALES", 2: "MARKETING", 7: "PLATE #", 8: "SELING PRICE", 10: "AGREED PRICE", 12: "RESERVATION AMOUNT", 23: "RELEASE DATE", 26: "STATUS", 29: "CLEANING DATE" });
const soldTab = [
  soldHeader,
  sold({ 2: "FRITZ, RAFFY", 3: "2023", 4: "TOYOTA", 5: "VIOS XLE", 6: "MT", 7: "AAA1111", 8: "₱458,000", 10: "₱460,000", 12: "Php20,000", 13: "October 14", 18: "GDFI", 19: "Php415,000", 22: "Php25,000", 24: "Facebook", 25: "FB Page", 26: "RESERVATION", 27: "ANA CRUZ" }),
  sold({ 1: "ELLA", 3: "2020", 4: "MITSUBISHI", 5: "XPANDER", 7: "BBB2222", 10: "₱640,000", 12: "₱20,000", 13: "October 24", 16: "₱620,000", 17: "November 5", 22: "₱0", 23: "November 5", 24: "Marketplace", 26: "FULLY PAID", 27: "BEN REYES" }),
  sold({ 1: "DAVID, ARON", 3: "2019", 4: "NISSAN", 5: "TERRA", 7: "CCC3333", 10: "₱710,000", 12: "₱20,000", 13: "October 20", 20: "2012 Vios", 21: "₱90,000", 22: "₱200,000", 26: "RESERVATION", 27: "CARLA DIAZ", 29: "November 4" }),
  sold({ 7: "DDD4444", 10: "₱300,000", 12: "₱10,000", 13: "August 1", 26: "CANCELLED", 27: "DAN LIM" }),
  sold({ 7: "EEE5555", 10: "₱500,000", 12: "₱20,000", 13: "December 8", 22: "₱480,000", 26: "RESERVATION", 27: "EVA SY" }),
  row(30, {}),
];
const entryTab = [
  row(14, { 1: "DATE ENTERED", 2: "STATUS", 7: "SOURCE 1", 11: "SALESMAN" }),
  row(14, { 0: "1", 1: "November 5", 2: "FOLLOW UP", 3: "A", 7: "FACEBOOK", 11: "DAVID" }),
  row(14, { 0: "2", 1: "November 5", 2: "DEAL CLOSED", 7: "WEBSITE", 11: "ELLA" }),
  row(14, { 0: "3", 1: "November 2", 2: "TRASH", 11: "DAVID" }),
  row(14, { 0: "4" }),
];

describe("the sales sheet", () => {
  it("reads the ledger, whatever the header words say", () => {
    const s = parseSold(soldTab, "Nov2026_Sold");
    expect(s.map((x) => x.plate)).toEqual(["AAA1111", "BBB2222", "CCC3333", "DDD4444", "EEE5555"]);
    expect(s[0]).toMatchObject({ unit: "2023 TOYOTA VIOS XLE", salesman: ["DAVID"], marketing: ["FRITZ", "RAFFY"], agreedPrice: 460000, listingPrice: 458000, reservation: 20000, financingFirm: "GDFI", balance: 25000, buyer: "ANA CRUZ", source: "Facebook · FB Page", status: "RESERVATION" });
    expect(s[1]).toMatchObject({ releaseDate: "2026-11-05", full: 620000, kind: "Cash" });
    expect(s[2]).toMatchObject({ salesman: ["DAVID", "ARON"], deadline: "2026-11-04", kind: "Cash + trade-in" });
  });
  it("names the kind of transaction", () => {
    expect(kindOf("GDFI", "", null)).toBe("Financing (GDFI)");
    expect(kindOf("", "", null)).toBe("Cash");
    expect(kindOf("BDO", "2012 Vios", 90000)).toBe("Financing (BDO) + trade-in");
  });
  it("reads the leads", () => {
    const e = parseEntries(entryTab, "Nov2026_Entries");
    expect(e.map((x) => [x.date, x.status, x.salesman[0]])).toEqual([["2026-11-05", "FOLLOW UP", "DAVID"], ["2026-11-05", "DEAL CLOSED", "ELLA"], ["2026-11-02", "TRASH", "DAVID"]]);
  });
  it("pending sales are reserved or fully paid but not released, never cancelled; each gets a deadline and an alert", () => {
    const p = pendingWithAlerts(parseSold(soldTab, "Nov2026_Sold"), "2026-11-05");
    expect(p.map((x) => [x.plate, x.alert, x.dueSource])).toEqual([
      ["EEE5555", "overdue", "reservation + days"], // a "December 8" in 2026 is really last December: long overdue
      ["AAA1111", "overdue", "reservation + days"], // reserved October 14 + 14 days = October 28
      ["CCC3333", "overdue", "cleaning date"], // cleaning date November 4 passed yesterday
    ]);
    expect(p.find((x) => x.plate === "CCC3333")).toMatchObject({ daysLate: 1 });
    expect(p.map((x) => x.plate)).not.toContain("DDD4444"); // cancelled
    expect(p.map((x) => x.plate)).not.toContain("BBB2222"); // released
  });
  it("a deadline today is 'due today' and one in a few days is 'soon'", () => {
    const base = parseSold([soldHeader, sold({ 7: "AAA1111", 26: "RESERVATION", 29: "November 5" }), sold({ 7: "BBB2222", 26: "RESERVATION", 29: "November 7" }), sold({ 7: "CCC3333", 26: "RESERVATION", 29: "November 20" })], "Nov2026_Sold");
    expect(pendingWithAlerts(base, "2026-11-05").map((x) => [x.plate, x.alert])).toEqual([["AAA1111", "due-today"], ["BBB2222", "soon"], ["CCC3333", "none"]]);
  });
  it("the scoreboard counts entries, reservations and releases, sharing credit between salespeople", () => {
    const sc = scoreboard(parseEntries(entryTab, "Nov2026_Entries"), parseSold(soldTab, "Nov2026_Sold"), "2026-11-05");
    const david = sc.find((s) => s.name === "DAVID")!, ella = sc.find((s) => s.name === "ELLA")!;
    expect(david).toMatchObject({ entriesToday: 1, entriesMonth: 2, releasedMonth: 0 });
    expect(ella).toMatchObject({ entriesToday: 1, releasedToday: 1, releasedMonth: 1, conversion: 100 });
  });
  it("builds today, pending, released, history, goal and lead statuses; a sale in two tabs counts once", () => {
    const d = buildSellDashboard({ today: "2026-11-05", sold: [{ tab: "Nov2026_Sold", rows: soldTab, order: 11 }, { tab: "Jan-Sept2026_Sold", rows: soldTab, order: -1 }], entries: [{ tab: "Nov2026_Entries", rows: entryTab }], goals: { buyGoal: 60, sellGoal: 60, pendingDays: 14, months: { "2026-11": { sell: 55 } } } });
    expect(d.releasedToday.map((s) => s.plate)).toEqual(["BBB2222"]);
    expect(d.pending).toHaveLength(3);
    expect(d.reserves.length + d.pendingSales.length).toBe(3); // every open sale is one or the other
    expect(d.overdue).toHaveLength(3);
    expect(d).toMatchObject({ goal: 55, releasedThisMonth: 1 }); // this month has its own target
    expect(d.released.map((s) => s.plate)).toEqual(["BBB2222"]);
    expect(d.history).toEqual([{ month: "2026-11", released: 1, amount: 640000, goal: 55 }]);
    expect(d.entryStatuses).toEqual(expect.arrayContaining([{ status: "FOLLOW UP", count: 1 }, { status: "DEAL CLOSED", count: 1 }]));
  });
});

// The sheet is a ledger: a paid car gets a NEW row in the month it is released and the old RESERVATION row stays behind.
describe("a car's real state is its newest row", () => {
  const sale = (plate: string, status: string, buyer: string, extra: Record<number, string> = {}) => sold({ 7: plate, 10: "₱500,000", 12: "₱20,000", 13: "September 20", 26: status, 27: buyer, ...extra });
  const tab = (rows: string[][]) => [soldHeader, ...rows];
  const run = (tabs: { tab: string; order: number; rows: string[][] }[]) => buildSellDashboard({ today: "2026-11-05", sold: tabs.map((t) => ({ ...t, rows: tab(t.rows) })), entries: [] });

  it("a reservation in September that was released in October is released, not pending or overdue", () => {
    const d = run([
      { tab: "Sept2026_Sold", order: 9, rows: [sale("AAA1111", "RESERVATION", "ANA CRUZ")] },
      { tab: "Oct2026_Sold", order: 10, rows: [sale("AAA1111", "FULLY PAID", "ANA CRUZ", { 22: "₱0", 23: "October 5" })] },
    ]);
    expect(d.pending).toEqual([]);
    expect(d.overdue).toEqual([]);
    expect(d.released.map((s) => [s.plate, s.releaseDate])).toEqual([["AAA1111", "2026-10-05"]]);
  });
  it("a reservation that was cancelled later is neither pending nor released", () => {
    const d = run([{ tab: "Aug2026_Sold", order: 8, rows: [sale("BBB2222", "RESERVATION", "BEN REYES")] }, { tab: "Sept2026_Sold", order: 9, rows: [sale("BBB2222", "CANCELLED", "BEN REYES")] }]);
    expect(d.pending).toEqual([]);
    expect(d.released).toEqual([]);
  });
  it("the same reservation carried over to the next month counts once, as the newer row", () => {
    const d = run([{ tab: "Oct2026_Sold", order: 10, rows: [sale("CCC3333", "RESERVATION", "CARLA DIAZ")] }, { tab: "Nov2026_Sold", order: 11, rows: [sale("CCC3333", "RESERVATION", "CARLA DIAZ")] }, { tab: "Jan-Sept2026_Sold", order: -1, rows: [sale("CCC3333", "RESERVATION", "CARLA DIAZ")] }]);
    expect(d.pending.map((p) => [p.plate, p.tab])).toEqual([["CCC3333", "Nov2026_Sold"]]);
  });
  it("the consolidated Jan-Sept tab can hold the later release of an August reservation", () => {
    const d = run([
      { tab: "Aug2026_Sold", order: 8, rows: [sale("IIII9999".slice(0, 7), "RESERVATION", "ISA PAZ", { 13: "August 28" })] },
      { tab: "Jan-Sept2026_Sold", order: -1, rows: [sale("IIII999", "RESERVATION", "ISA PAZ", { 13: "August 28" }), sale("IIII999", "FULLY PAID", "ISA PAZ", { 13: "August 28", 22: "₱0", 23: "September 2" })] },
    ]);
    expect(d.pending).toEqual([]);
    expect(d.released.map((s) => [s.plate, s.releaseDate])).toEqual([["IIII999", "2026-09-02"]]);
  });
  it("a reservation is dead when the car was later released to a different buyer", () => {
    const d = run([
      { tab: "Aug2026_Sold", order: 8, rows: [sale("JJJ1010", "RESERVATION", "JEN MAGNO", { 13: "August 12" })] },
      { tab: "Sept2026_Sold", order: 9, rows: [sale("JJJ1010", "FULLY PAID", "SHEENA DAYAO", { 13: "September 1", 22: "₱0", 23: "September 20" })] },
    ]);
    expect(d.pending).toEqual([]);
    expect(d.released.map((s) => s.buyer)).toEqual(["SHEENA DAYAO"]);
  });
  it("a reservation made AFTER an earlier buyer's release is not dead (the car came back and was resold)", () => {
    const d = run([
      { tab: "June2026_Sold", order: 6, rows: [sale("KKK1111", "FULLY PAID", "KIM LEE", { 13: "May 20", 22: "₱0", 23: "June 3" })] },
      { tab: "Oct2026_Sold", order: 10, rows: [sale("KKK1111", "RESERVATION", "LEO SIA", { 13: "October 3" })] },
    ]);
    expect(d.pending.map((p) => p.buyer)).toEqual(["LEO SIA"]);
  });
  it("the same car sold to two different buyers is two sales; the first stays released", () => {
    const all = [
      ...parseSold(tab([sale("DDD4444", "FULLY PAID", "DAN LIM", { 23: "June 3" })]), "June2026_Sold", 6),
      ...parseSold(tab([sale("DDD4444", "RESERVATION", "EVA SY")]), "Oct2026_Sold", 10),
    ];
    expect(currentSales(all).map((s) => [s.buyer, s.status])).toEqual([["DAN LIM", "FULLY PAID"], ["EVA SY", "RESERVATION"]]);
  });
  it("a name spelled a little differently in the newer row is still the same buyer", () => {
    const all = [...parseSold(tab([sale("EEE5555", "RESERVATION", "MARIA LEONILA LIM")]), "Sept2026_Sold", 9), ...parseSold(tab([sale("EEE5555", "FULLY PAID", "LIM, MARIA LEONILA", { 23: "October 9" })]), "Oct2026_Sold", 10)];
    expect(currentSales(all)).toHaveLength(1);
    expect(currentSales(all)[0].status).toBe("FULLY PAID");
  });
  it("a reservation nobody closed stays pending, and says what it is waiting for", () => {
    const d = run([{ tab: "Nov2026_Sold", order: 11, rows: [sale("FFF6666", "RESERVATION", "FAYE GO", { 22: "₱25,000", 18: "GDFI", 19: "₱455,000" }), sale("GGG7777", "RESERVATION", "GIL TAN", { 22: "₱0", 18: "BDO", 19: "₱480,000" }), sale("HHH8888", "RESERVATION", "HAL UY", { 22: "₱0" })] }]);
    expect(d.pending.map((p) => waitingFor(p).label)).toEqual(expect.arrayContaining(["Waiting for the buyer's balance", "Waiting for the loan from BDO", "Paid, waiting for release"]));
    expect(waitingFor(d.pending.find((p) => p.plate === "FFF6666")!).owes).toBe(25000);
  });
});
