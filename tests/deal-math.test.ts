import { describe, expect, it } from "vitest";
import { balanceInfo, buildLedger, buildSources, totals } from "@/lib/deal/math";
import type { MathInput } from "@/lib/deal/types";
import { buildNotifications, centsOf, dealStatusKey, notificationsFor } from "@/lib/deal/status";
import { DEFAULT_SETTINGS, parseSettings } from "@/lib/deal/settings";

// An independent calculator written straight from the rules, in whole centavos.
const C = (x: number) => Math.round(x * 100);
interface Case { price: number; fin?: boolean; dp?: number; fee?: number; trade?: number; lieu?: number; earlier?: number; cash?: number; payout?: number }
function indep(c: Case) {
  const P = C(c.price), T = C(c.trade ?? 0);
  const share = c.fin ? Math.min(C(c.dp ?? 0), P) : P, loan = c.fin ? P - share : 0, fee = c.fin ? C(c.fee ?? 0) : 0, due = share - T + fee - C(c.lieu ?? 0);
  const paid = C(c.earlier ?? 0) + C(c.cash ?? 0), payout = due < 0 ? C(c.payout ?? 0) : 0;
  return { P, T, Z: C(c.lieu ?? 0), loan, fee, due, paid, payout, balance: due - paid + payout };
}
const input = (c: Case): MathInput => ({
  price: C(c.price), sale: c.fin ? "financing" : "cash", dp: C(c.dp ?? 0), fee: C(c.fee ?? 0), tradeIn: C(c.trade ?? 0),
  earlier: C(c.earlier ?? 0), today: C(c.cash ?? 0), payout: C(c.payout ?? 0), lieu: C(c.lieu ?? 0), monthly: 0, years: 0,
});
const info = { units: 1, institution: "BDO", tradeInText: "Old car", payRows: [], payoutProofs: 0, lieuUntilText: "" };

const named: [string, Case][] = [
  ["cash, nothing paid", { price: 500000 }],
  ["cash, part paid", { price: 500000, cash: 100000 }],
  ["cash, earlier + today", { price: 720000, earlier: 20000, cash: 40000 }],
  ["cash, paid in full", { price: 300000, cash: 300000 }],
  ["cash, centavos", { price: 1000.5, cash: 0.25 }],
  ["cash + trade-in below price", { price: 720000, trade: 310000, cash: 100000 }],
  ["cash + trade-in equals price", { price: 400000, trade: 400000 }],
  ["cash + trade-in worth more, nothing paid out", { price: 500000, trade: 580000 }],
  ["cash + trade-in worth more, part paid out", { price: 500000, trade: 580000, payout: 30000 }],
  ["cash + trade-in worth more, fully paid out", { price: 500000, trade: 580000, payout: 80000 }],
  ["payout ignored when the buyer owes", { price: 500000, payout: 10000 }],
  ["cash + in lieu of documents comes off the balance", { price: 500000, lieu: 100000, cash: 50000 }],
  ["cash + in lieu equal to everything owed: nothing to pay", { price: 300000, lieu: 300000 }],
  ["financing + fee + in lieu + earlier + today", { price: 720000, fin: true, dp: 150000, fee: 39900, lieu: 25000, earlier: 20000, cash: 100000 }],
  ["cash + trade-in + in lieu", { price: 720000, trade: 310000, lieu: 60000, cash: 100000 }],
  ["financing, no fee", { price: 720000, fin: true, dp: 150000, fee: 0, cash: 50000 }],
  ["financing, 7% fee, part paid", { price: 720000, fin: true, dp: 150000, fee: 39900, cash: 50000 }],
  ["financing, earnest 20k, then the down payment and the fee: all come off one balance", { price: 720000, fin: true, dp: 150000, fee: 39900, earlier: 20000, cash: 169900 }],
  ["financing, earnest + down payment but the fee not yet paid", { price: 720000, fin: true, dp: 150000, fee: 39900, earlier: 20000, cash: 130000 }],
  ["financing, down payment and fee paid in full", { price: 720000, fin: true, dp: 150000, fee: 39900, cash: 189900 }],
  ["financing, only the fee is left", { price: 720000, fin: true, dp: 150000, fee: 39900, cash: 150000 }],
  ["financing, a custom fee in pesos", { price: 900000, fin: true, dp: 200000, fee: 25000, earlier: 5000, cash: 100000 }],
  ["financing, trade-in equals the down payment, the fee is still owed", { price: 720000, fin: true, dp: 130000, fee: 36400, trade: 130000 }],
  ["financing, a fee on a cash sale is ignored", { price: 500000, fee: 20000, cash: 100000 }],
  ["financing + trade-in + fee", { price: 720000, fin: true, dp: 150000, fee: 39900, trade: 60000, earlier: 10000, cash: 40000 }],
  ["financing, trade-in equals the down payment", { price: 720000, fin: true, dp: 130000, trade: 130000 }],
  ["financing, down payment fully paid", { price: 720000, fin: true, dp: 150000, cash: 150000 }],
  ["financing, odd centavos", { price: 333333.33, fin: true, dp: 100001.01, cash: 1000.99 }],
];

describe("the money rules", () => {
  it.each(named)("%s", (_name, c) => {
    const t = totals(input(c)), e = indep(c);
    expect([t.price, t.tv, t.loan, t.fee, t.due, t.paid, t.payout, t.balance]).toEqual([e.P, e.T, e.loan, e.fee, e.due, e.paid, e.payout, e.balance]);
    expect(e.P + e.fee).toBe(e.T + e.loan + e.Z + e.paid - e.payout + e.balance);
    const ledger = buildLedger(t, info), sources = buildSources(t, info);
    expect(ledger.proves).toBe(true);
    expect(sources.proves).toBe(true);
  });

  it("300 random deals match the independent calculation and always add up", () => {
    let seed = 20261105;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const pesos = (lo: number, hi: number) => Math.round((lo + rnd() * (hi - lo)) * 100) / 100;
    for (let i = 0; i < 300; i++) {
      const fin = rnd() < 0.5, price = pesos(150000, 2500000);
      const c: Case = { price, fin, dp: fin ? pesos(price * 0.1, price * 0.9) : 0, fee: rnd() < 0.2 ? 0 : pesos(0, 120000), cash: pesos(0, 300000), earlier: rnd() < 0.5 ? pesos(0, 80000) : 0 };
      if (rnd() < 0.4) c.trade = pesos(10000, fin ? c.dp! : price * 1.1);
      if (rnd() < 0.3) c.payout = pesos(0, 100000);
      const t = totals(input(c)), e = indep(c), ledger = buildLedger(t, info);
      expect([t.due, t.loan, t.fee, t.balance]).toEqual([e.due, e.loan, e.fee, e.balance]);
      expect(ledger.proves, JSON.stringify(c)).toBe(true);
      expect(buildSources(t, info).proves).toBe(true);
    }
  });

  it("the processing fee is part of what the buyer owes, on top of the down payment", () => {
    const a = totals(input({ price: 720000, fin: true, dp: 150000, fee: 0 })), b = totals(input({ price: 720000, fin: true, dp: 150000, fee: 39900 }));
    expect([a.due, b.due, b.fee, b.loan]).toEqual([15000000, 18990000, 3990000, 57000000]); // the loan does not change
  });

  it("earnest 20k, a 120k down payment installment and the fee are all deducted from the same balance", () => {
    // price 720,000, down payment 150,000, fee 7% of the 570,000 loan = 39,900: the buyer owes 189,900
    const t = totals(input({ price: 720000, fin: true, dp: 150000, fee: 39900, earlier: 20000, cash: 120000 }));
    expect([t.due, t.paid, t.balance]).toEqual([18990000, 14000000, 4990000]); // 49,900 still to pay (the rest of the down payment and the fee)
    const later = totals(input({ price: 720000, fin: true, dp: 150000, fee: 39900, earlier: 140000, cash: 49900 }));
    expect(later.balance).toBe(0);
  });

  it("the fee is shown in the working-out and in the sources", () => {
    const t = totals(input({ price: 720000, fin: true, dp: 150000, fee: 39900, cash: 50000 }));
    const ledger = buildLedger(t, info), sources = buildSources(t, info);
    expect(ledger.rows.find((r) => r.label === "Processing fee")).toMatchObject({ kind: "plus", amount: 3990000, detail: "7% of the loan" });
    expect(ledger.rows.find((r) => r.kind === "sub")?.amount).toBe(18990000);
    expect(sources.rows.map((r) => r.label)).toContain("Processing fee");
    expect([sources.total, sources.totalLabel]).toEqual([75990000, "Agreed price + processing fee"]);
  });

  it("says who is owed what", () => {
    expect(balanceInfo({ due: 100, balance: 50 })).toMatchObject({ label: "Balance", tone: "owe", amount: 50 });
    expect(balanceInfo({ due: 100, balance: 0 })).toMatchObject({ tone: "ok" });
    expect(balanceInfo({ due: 100, balance: -5 })).toMatchObject({ label: "Overpaid by", tone: "bad", amount: 5 });
    expect(balanceInfo({ due: -80, balance: -30 })).toMatchObject({ label: "We still owe the buyer", tone: "we", amount: 30 });
  });
});

describe("deal status", () => {
  const d = (over: Partial<Parameters<typeof dealStatusKey>[0]>) => ({ status: "open", balance: 100, due_date: null, sale_type: "cash", loan_status: "none", ...over });
  const today = "2026-11-04";
  it("follows the balance, the due date and the loan", () => {
    expect(dealStatusKey(d({ due_date: "2026-11-03" }), today)).toBe("overdue");
    expect(dealStatusKey(d({ due_date: "2026-11-04" }), today)).toBe("soon");
    expect(dealStatusKey(d({ due_date: "2026-11-11" }), today)).toBe("soon");
    expect(dealStatusKey(d({ due_date: "2026-11-12" }), today)).toBe("open");
    expect(dealStatusKey(d({}), today)).toBe("open");
    expect(dealStatusKey(d({ balance: 0, sale_type: "financing", loan_status: "waiting" }), today)).toBe("lender");
    expect(dealStatusKey(d({ balance: 0, sale_type: "financing", loan_status: "released" }), today)).toBe("settled");
    expect(dealStatusKey(d({ balance: 0 }), today)).toBe("settled");
    expect(dealStatusKey(d({ status: "cancelled" }), today)).toBe("cancelled");
  });
  it("reads pesos from the database", () => {
    expect(centsOf("1000.50")).toBe(100050);
    expect(centsOf(-80000)).toBe(-8000000);
    expect(centsOf(null)).toBe(0);
  });
});

describe("reminders", () => {
  const today = "2026-11-04", settings = DEFAULT_SETTINGS.reminders;
  const deal = (over: Record<string, unknown>) => ({
    id: "d1", status: "open", balance: 5000000, due_date: null as string | null, sale_type: "cash", loan_status: "none", buyer_name: "Juan", institution: null,
    loan_amount: 0, lieu_amount: 0, lieu_until: null as string | null, loan_since: null as string | null, created_by: "u1", unit_name: "Vios", ...over,
  });
  it("overdue, due soon, lender, collateral and approvals", () => {
    const list = buildNotifications([
      deal({ id: "a", due_date: "2026-10-30" }), deal({ id: "b", due_date: "2026-11-07" }), deal({ id: "c", due_date: "2026-12-20" }),
      deal({ id: "d", balance: 0, sale_type: "financing", loan_status: "waiting", institution: "BDO", loan_since: "2026-10-01", loan_amount: 100000 }),
      deal({ id: "e", due_date: "2026-12-20", lieu_amount: 25000, lieu_until: "2026-11-06" }),
    ], [
      { id: "r1", receipt_no: "2530", deal_id: "b", buyer_name: "Juan", unit_name: "Vios", amount: 1000, status: "pending", submitted_by: "u2", submitted_at: "2026-11-01T00:00:00Z", reject_reason: null },
      { id: "r2", receipt_no: "2531", deal_id: "b", buyer_name: "Juan", unit_name: "Vios", amount: 1000, status: "rejected", submitted_by: "u2", submitted_at: "2026-11-02T00:00:00Z", reject_reason: "Blurry" },
    ], settings, today, Date.parse("2026-11-04T00:00:00Z"));
    expect(list.map((n) => n.key).sort()).toEqual(["ap-r1", "due-b", "li-e", "ln-d", "od-a", "rj-r2"]);
    expect(notificationsFor(list, { id: "u1", role: "sales" }).map((n) => n.key).sort()).toEqual(["due-b", "li-e", "ln-d", "od-a"]);
    expect(notificationsFor(list, { id: "u2", role: "sales" }).map((n) => n.key)).toEqual(["rj-r2"]);
    expect(notificationsFor(list, { id: "x", role: "approver" }).map((n) => n.key).sort()).toEqual(["ap-r1", "od-a", "rj-r2"]);
    expect(notificationsFor(list, { id: "x", role: "admin" })).toHaveLength(6);
  });
  it("respects the settings", () => {
    const off = { ...settings, before7: false, before3: false, dueDay: false };
    expect(buildNotifications([deal({ due_date: "2026-11-06" })], [], off, today)).toHaveLength(0);
  });
});

describe("settings", () => {
  it("fills in anything missing and ignores nonsense", () => {
    const s = parseSettings({ feeStd: "8", wallets: ["GCash", "PayMaya QR"], required: { contact: false }, colors: "bad", years: ["x"] });
    expect(s.feeStd).toBe("8");
    expect(s.wallets).toEqual(["GCash", "PayMaya QR"]);
    expect(s.required).toMatchObject({ contact: false, address: true });
    expect(s.colors.common.length).toBeGreaterThan(5);
    expect(s.years).toEqual(DEFAULT_SETTINGS.years);
    expect(parseSettings(null).feeStd).toBe("7");
  });
});
