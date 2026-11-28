import { describe, expect, it } from "vitest";
import { buildPayments, type Line, type Pay } from "@/lib/payments/summary";

const L = (o: Partial<Line> & { date: string; account: string }): Line => ({ debit: null, credit: null, balance: null, type: "FULL PAYMENT", mode: "Cash deposit", plate: "", row: 1, tab: "t", ...o });
const lines: Line[] = [
  L({ date: "2026-10-30", account: "BDO 3321", credit: 100000, balance: 500000, row: 5 }),
  L({ date: "2026-11-03", account: "BDO 3321", debit: 13700, type: "SALES RETURN", mode: "Debit memo", balance: 486300, row: 3 }),
  L({ date: "2026-11-03", account: "BDO 3321", credit: 20000, type: "RESERVATION", mode: "Credit memo", balance: 506300, row: 4 }),
  L({ date: "2026-11-05", account: "Security Bank 5411", credit: 588000, balance: 617806.95, row: 3 }),
  L({ date: "2026-11-05", account: "Security Bank 5411", debit: 588000, type: "SPLIT", mode: "Fund transfer", balance: 29806.95, row: 4 }),
  L({ date: "2026-11-06", account: "BDO 3321", credit: 5000, type: "UNLABELLED", balance: 511300, row: 9 }),
];
const pay = (o: Partial<Pay>): Pay => ({ stage: "reservation", bank: "BDO", amount: 20000, arNo: "1078", date: "2026-11-02", buyer: "A", plate: "AAA1111", tab: "s", row: 3, ...o });

describe("the Payments tab", () => {
  const s = buildPayments(lines, [pay({}), pay({ stage: "full", amount: 70000, arNo: "" }), pay({ stage: "full", bank: "SECURITY BANK", amount: 560000, arNo: "2543", plate: "BBB2222" }), pay({ stage: "financing", bank: "BDO", amount: 430000, arNo: "" }), pay({ date: "2026-10-14", amount: 99 })]);
  it("shows the latest month with money, and knows the months", () => {
    expect([s.month, s.months]).toEqual(["2026-11", ["2026-10", "2026-11"]]);
    expect(s.totals).toEqual({ in: 613000, out: 601700, net: 11300, lines: 5 });
  });
  it("another month can be asked for", () => {
    const o = buildPayments(lines, [], "2026-10");
    expect([o.month, o.totals.in, o.totals.lines]).toEqual(["2026-10", 100000, 1]);
    expect(buildPayments(lines, [], "1999-01").month).toBe("2026-11"); // a month with no lines falls back to the latest
  });
  it("money in and out and the last balance of each account", () => {
    expect(s.accounts).toEqual([
      { account: "BDO 3321", in: 25000, out: 13700, balance: 511300, lines: 3 },
      { account: "Security Bank 5411", in: 588000, out: 588000, balance: 29806.95, lines: 2 },
    ]);
  });
  it("money in by account for every month, for the stacked bars", () => {
    expect(s.perMonth).toEqual([
      { month: "2026-10", byAccount: { "BDO 3321": 100000, "Security Bank 5411": 0 }, total: 100000 },
      { month: "2026-11", byAccount: { "BDO 3321": 25000, "Security Bank 5411": 588000 }, total: 613000 },
    ]);
  });
  it("splits the month by type and by mode, biggest money-in first", () => {
    expect(s.byType.map((x) => [x.key, x.in, x.out])).toEqual([["FULL PAYMENT", 588000, 0], ["RESERVATION", 20000, 0], ["UNLABELLED", 5000, 0], ["SPLIT", 0, 588000], ["SALES RETURN", 0, 13700]]);
    expect(s.byMode.map((x) => x.key)).toEqual(["Cash deposit", "Credit memo", "Debit memo", "Fund transfer"]);
  });
  it("the month day by day with the running net", () => {
    expect(s.daily.map((d) => [d.date, d.in, d.out, d.net])).toEqual([["2026-11-03", 20000, 13700, 6300], ["2026-11-05", 588000, 588000, 6300], ["2026-11-06", 5000, 0, 11300]]);
  });
  it("the sale payments of the month by stage and bank", () => {
    expect(s.sales.map((x) => [x.stage, x.total, x.count])).toEqual([["reservation", 20000, 1], ["full", 630000, 2], ["financing", 430000, 1]]);
    expect(s.sales[1].byBank).toEqual({ BDO: 70000, "SECURITY BANK": 560000 });
    expect(s.salesBanks).toEqual(["BDO", "SECURITY BANK"]);
  });
  it("counts what needs a look", () => {
    expect([s.unlabelled, s.paymentsWithoutAr]).toEqual([1, 1]);
  });
  it("is empty without lines", () => {
    const e = buildPayments([], []);
    expect([e.month, e.months, e.totals.lines, e.daily, e.accounts]).toEqual([null, [], 0, [], []]);
  });
});

import { dueTabs, wantedTabs } from "@/lib/payments/plan";

describe("which tabs of the sheet are copied, and when", () => {
  const names = ["DI MONITORING 2026", "IN LIEU OF DOCS", "SALES MONITORING NOVEMBER 2026", "SBTC DEPOSIT MONITORING - 5411 (NOV2026)", "BDO DEPOSIT MONITORING - 3321 (NOV2026)", "BDO DEPOSIT MONITORING - 3321 (MAR2026)", "SALES REPORT FEB", "Metrobank"];
  const wanted = wantedTabs(names);
  it("takes only the deposit tabs and the monthly sales tabs", () => {
    expect(wanted.map((w) => [w.kind, w.month])).toEqual([["sales", "2026-11"], ["bank", "2026-11"], ["bank", "2026-11"], ["bank", "2026-03"]]);
  });
  const now = Date.parse("2026-11-28T08:00:00Z"), today = "2026-11-28";
  const at = (minutesAgo: number) => ({ synced_at: new Date(now - minutesAgo * 60_000).toISOString() });
  it("a tab never copied comes first, the newest month first", () => {
    const due = dueTabs(wanted, new Map([[wanted[0].tab, at(1)]]), today, now);
    expect(due.map((d) => d.month)).toEqual(["2026-11", "2026-11", "2026-03"]);
    expect(due.every((d) => d.tab !== wanted[0].tab)).toBe(true); // copied a minute ago
  });
  it("after the first copy only the current month is copied again, once a day", () => {
    const state = new Map(wanted.map((w) => [w.tab, at(10)]));
    expect(dueTabs(wanted, state, today, now)).toEqual([]);
    expect(dueTabs(wanted, new Map(wanted.map((w) => [w.tab, at(60 * 5)])), today, now)).toEqual([]);
    expect(dueTabs(wanted, new Map(wanted.map((w) => [w.tab, at(60 * 25)])), today, now).map((d) => d.month)).toEqual(["2026-11", "2026-11", "2026-11"]); // March stays as it was
  });
  it("a manual refresh copies every tab", () => {
    const state = new Map(wanted.map((w) => [w.tab, at(1)]));
    expect(dueTabs(wanted, state, today, now, true).length).toBe(4);
  });
});
