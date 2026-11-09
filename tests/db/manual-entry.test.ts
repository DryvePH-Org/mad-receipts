import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

// Version 2 of the database (manual entry + approvals), on the project's real migrations.
//   amount due = (down payment, or the price for cash) - trade-in + processing fee (financing only)
//   balance    = amount due - received + payout          (the loan is never in it)
//   always:      price + fee = trade-in + loan + received - payout + balance

let db: Db;
let sales: string, admin: string, approver: string;
let n = 0;

const user = async (email: string, role: string) => {
  const id = (await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email])).rows[0].id;
  await db.query("update public.profiles set role = $2 where id = $1", [id, role]);
  return id;
};
const proof = (actor: string) => [{ path: `${actor}/${crypto.randomUUID()}.jpg`, filename: "p.jpg", mime: "image/jpeg", size: 1000 }];
const cash = (actor: string, amount: string, proofs = true) => ({ method: "cash", amount, attachments: proofs ? proof(actor) : [] });
const plate = () => `TST ${String(++n).padStart(4, "0")}`;

const payload = (actor: string, over: Record<string, unknown> = {}) => ({
  receipt_no: `R-${++n}`, receipt_date: "2026-11-04", kind: "partial",
  buyer: { name: "Test Buyer", address: "Pasig", contact: "09171234567" },
  units: [{ make_type: "2023 Toyota Vios", plate: plate(), motor: "M1", chassis: "C1", color: "Silver" }],
  price: "720000", sale_type: "cash", due: { mode: "date", date: "2026-12-15" },
  payments: [cash(actor, "100000")], ...over,
});
const submit = async (actor: string, p: Record<string, unknown>, requireProofs = true) =>
  (await db.query<{ r: Record<string, string> }>("select public.submit_receipt($1, $2::jsonb, $3) as r", [actor, JSON.stringify(p), requireProofs])).rows[0].r;
const fails = async (promise: Promise<unknown>, code: string) => { await expect(promise).rejects.toThrow(code); };
const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const num = (v: unknown) => Number(v);

beforeAll(async () => {
  db = await createDb();
  sales = await user("sales@example.test", "sales");
  admin = await user("admin@example.test", "admin");
  approver = await user("approver@example.test", "approver");
}, 60_000);

describe("submitting a receipt", () => {
  it("cash: the buyer owes the price, the receipt waits for approval", async () => {
    const r = await submit(sales, payload(sales));
    expect(num(r.balance_after)).toBe(620000);
    const rec = await one<{ status: string; amount: string }>("select status, amount from public.receipts where id = $1", [r.receipt_id]);
    expect([rec.status, num(rec.amount)]).toEqual(["pending", 100000]);
    const d = await one("select * from public.deals where id = $1", [r.deal_id]);
    expect([num(d.amount_due), num(d.loan_amount), d.loan_status, d.status]).toEqual([720000, 0, "none", "open"]);
  });

  it("financing: the buyer owes the down payment and the processing fee; the loan is the lender's", async () => {
    const r = await submit(sales, payload(sales, { sale_type: "financing", institution: "BDO", down_payment: "150000", processing_fee: "39900", monthly: "14250", years: "5", payments: [cash(sales, "50000")] }));
    const d = await one("select * from public.deals where id = $1", [r.deal_id]);
    expect([num(d.amount_due), num(d.loan_amount), num(d.processing_fee), d.loan_status]).toEqual([189900, 570000, 39900, "waiting"]);
    expect(num(r.balance_after)).toBe(139900); // 150,000 + 39,900 - 50,000
  });

  it("financing, earnest then down payment then fee: all come off one balance, and the totals add up", async () => {
    // price 720,000, down payment 150,000, fee 39,900 (7% of the 570,000 loan): the buyer owes 189,900
    const first = await submit(sales, payload(sales, { sale_type: "financing", institution: "BDO", down_payment: "150000", processing_fee: "39900", earlier: "20000", kind: "partial", payments: [cash(sales, "120000")] }));
    const d = await one("select amount_due, opening_paid from public.deals where id = $1", [first.deal_id]);
    expect([num(d.amount_due), num(d.opening_paid), num(first.balance_after)]).toEqual([189900, 20000, 49900]);
    const second = await submit(sales, { deal_id: first.deal_id, receipt_no: `R-${++n}`, receipt_date: "2026-11-05", kind: "full", payments: [cash(sales, "49900")] });
    expect(num(second.balance_after)).toBe(0);
    await fails(submit(sales, { deal_id: first.deal_id, receipt_no: `R-${++n}`, receipt_date: "2026-11-06", kind: "partial", payments: [cash(sales, "1")] }), "overpayment");
    const s2 = await one("select balance, amount_due from public.deal_summaries where id = $1", [first.deal_id]);
    expect([num(s2.amount_due), num(s2.balance)]).toEqual([189900, 189900 - 20000]); // only the earlier 20,000 counts: pending receipts wait for approval
  });

  it("financing with a trade-in: the trade-in is part of the down payment", async () => {
    const r = await submit(sales, payload(sales, { sale_type: "financing", institution: "BDO", down_payment: "150000", trade_in: { value: "60000", unit: "Old Vios" }, payments: [cash(sales, "50000")] }));
    const d = await one("select amount_due, trade_in_value from public.deals where id = $1", [r.deal_id]);
    expect([num(d.amount_due), num(d.trade_in_value), num(r.balance_after)]).toEqual([90000, 60000, 40000]); // no fee given, so none
  });

  it("cash with a trade-in worth more: we pay the buyer; the payout settles it", async () => {
    const base = payload(sales, { price: "500000", trade_in: { value: "580000", unit: "Big car" }, payments: [] });
    await fails(submit(sales, { ...base, payout: { amount: "80000", attachments: [] } }), "payout_proof_required");
    expect(num((await submit(sales, payload(sales, { price: "500000", trade_in: { value: "580000" }, payments: [] }))).balance_after)).toBe(-80000); // nothing paid out yet: we still owe 80,000
    const r = await submit(sales, { ...base, payout: { amount: "80000", attachments: proof(sales) } });
    expect([num(r.balance_after)]).toEqual([0]);
    const part = payload(sales, { price: "500000", trade_in: { value: "580000" }, payments: [], payout: { amount: "30000", attachments: proof(sales) } });
    expect(num((await submit(sales, part)).balance_after)).toBe(-50000);
    await fails(submit(sales, payload(sales, { price: "500000", trade_in: { value: "580000" }, payments: [], payout: { amount: "90000", attachments: proof(sales) } })), "payout_too_high");
    await fails(submit(sales, payload(sales, { payout: { amount: "1000", attachments: proof(sales) } })), "payout_not_allowed");
  });

  it("continuing a deal counts every earlier receipt, pending or approved", async () => {
    const first = await submit(sales, payload(sales));
    const second = await submit(sales, { receipt_no: `R-${++n}`, deal_id: first.deal_id, kind: "partial", payments: [cash(sales, "50000")] });
    expect(num(second.balance_after)).toBe(570000);
    await fails(submit(sales, { receipt_no: `R-${++n}`, deal_id: first.deal_id, kind: "partial", payments: [cash(sales, "600000")] }), "overpayment");
  });

  it("blocks the mistakes", async () => {
    await fails(submit(sales, payload(sales, { payments: [cash(sales, "100000", false)] })), "proof_required");
    await expect(submit(sales, payload(sales, { payments: [cash(sales, "100000", false)] }), false)).resolves.toBeTruthy();
    await fails(submit(sales, payload(sales, { payments: [cash(sales, "720001")] })), "overpayment");
    await fails(submit(sales, payload(sales, { payments: [] })), "payment_required");
    await fails(submit(sales, payload(sales, { sale_type: "financing", institution: "BDO", down_payment: "800000" })), "down_payment_too_high");
    await fails(submit(sales, payload(sales, { sale_type: "financing", institution: "BDO" })), "down_payment_required");
    await fails(submit(sales, payload(sales, { sale_type: "financing", down_payment: "100000" })), "institution_required");
    await fails(submit(sales, payload(sales, { sale_type: "financing", institution: "BDO", down_payment: "100000", trade_in: { value: "120000" } })), "trade_in_exceeds_down_payment");
    await fails(submit(sales, payload(sales, { kind: "huge" })), "kind_invalid");
    await fails(submit(sales, payload(sales, { price: "0" })), "price_required");
    await fails(submit(sales, payload(sales, { payments: [{ method: "wallet", label: "", amount: "1000", attachments: proof(sales) }] })), "payment_name_required");
    await fails(submit(sales, payload(sales, { payments: [{ method: "cash", amount: "1000", attachments: [{ path: `${admin}/x.jpg`, filename: "x" }] }] })), "bad_attachment");
  });

  it("a plate can be in one live deal only, and a receipt number is used once", async () => {
    const p = payload(sales);
    await submit(sales, p);
    await fails(submit(sales, payload(sales, { units: p.units })), "plate_in_use");
    await fails(submit(sales, payload(sales, { receipt_no: p.receipt_no })), "receipt_no_taken");
    const spaced = (p.units as { plate: string }[])[0].plate.toLowerCase().replace(" ", "-");
    await fails(submit(sales, payload(sales, { units: [{ make_type: "x", plate: spaced }] })), "plate_in_use");
  });

  it("several units in one deal", async () => {
    const r = await submit(sales, payload(sales, { price: "1500000", units: [{ make_type: "A", plate: plate() }, { make_type: "B", plate: plate() }] }));
    expect(num((await one<{ n: string }>("select count(*) as n from public.deal_units where deal_id = $1", [r.deal_id])).n)).toBe(2);
  });
});

describe("in lieu of documents", () => {
  it("comes off what the buyer owes, like a payment, and counts in every later balance", async () => {
    const first = await submit(sales, payload(sales, { price: "720000", lieu: { amount: "100000", until: "2026-12-20" }, payments: [cash(sales, "50000")] }));
    const deal = await one<{ amount_due: string; lieu_amount: string }>("select amount_due, lieu_amount from public.deals where id = $1", [first.deal_id]);
    expect([num(deal.amount_due), num(deal.lieu_amount), num(first.balance_after)]).toEqual([620000, 100000, 570000]); // 720,000 − 100,000 in lieu − 50,000 paid
    const second = await submit(sales, { receipt_no: `R-${++n}`, deal_id: first.deal_id, kind: "partial", payments: [cash(sales, "100000")] });
    expect(num(second.balance_after)).toBe(470000); // the in-lieu amount is still off the balance
    await fails(submit(sales, { receipt_no: `R-${++n}`, deal_id: first.deal_id, kind: "partial", payments: [cash(sales, "500000")] }), "overpayment"); // only 470,000 is left
  });
  it("cannot be more than the buyer owes", async () => {
    await fails(submit(sales, payload(sales, { price: "300000", lieu: { amount: "300000.01", until: "2026-12-20" } })), "lieu_too_high");
    await fails(submit(sales, payload(sales, { price: "300000", lieu: { amount: "-1", until: "2026-12-20" } })), "lieu_invalid");
    await fails(submit(sales, payload(sales, { price: "500000", trade_in: { value: "580000" }, lieu: { amount: "1000", until: "2026-12-20" }, payments: [] })), "lieu_too_high"); // we pay the buyer: nothing to hold documents for
  });
  it("can cover everything owed, so nothing is left to pay in cash", async () => {
    const r = await submit(sales, payload(sales, { price: "300000", lieu: { amount: "300000", until: "2026-12-20" }, payments: [] }));
    expect(num(r.balance_after)).toBe(0);
  });
});

describe("approving", () => {
  it("only the Approver, never the one who filled it in; approving queues the updates", async () => {
    const r = await submit(sales, payload(sales));
    await fails(db.query("select public.review_receipt($1, $2, true, null)", [admin, r.receipt_id]), "not_approver");
    await fails(db.query("select public.review_receipt($1, $2, true, null)", [sales, r.receipt_id]), "not_approver");
    await db.query("select public.review_receipt($1, $2, true, null)", [approver, r.receipt_id]);
    expect((await one<{ status: string }>("select status from public.receipts where id = $1", [r.receipt_id])).status).toBe("approved");
    const jobs = await db.query<{ target: string }>("select target from public.sync_jobs where receipt_id = $1 and event = 'confirm' order by target", [r.receipt_id]);
    expect(jobs.rows.map((x) => x.target)).toEqual(["drive", "inventory", "sheets", "telegram"]);
    await fails(db.query("select public.review_receipt($1, $2, true, null)", [approver, r.receipt_id]), "not_pending");
  });

  it("an Approver cannot approve their own receipt", async () => {
    const r = await submit(approver, payload(approver));
    await fails(db.query("select public.review_receipt($1, $2, true, null)", [approver, r.receipt_id]), "own_receipt");
  });

  it("rejecting needs a reason", async () => {
    const r = await submit(sales, payload(sales));
    await fails(db.query("select public.review_receipt($1, $2, false, '')", [approver, r.receipt_id]), "reason_required");
    await db.query("select public.review_receipt($1, $2, false, 'The photo is blurry')", [approver, r.receipt_id]);
    const rec = await one<{ status: string; reject_reason: string }>("select status, reject_reason from public.receipts where id = $1", [r.receipt_id]);
    expect([rec.status, rec.reject_reason]).toEqual(["rejected", "The photo is blurry"]);
  });

  it("a deal's balance counts approved receipts only", async () => {
    const a = await submit(sales, payload(sales));
    await submit(sales, { receipt_no: `R-${++n}`, deal_id: a.deal_id, kind: "partial", payments: [cash(sales, "50000")] });
    let s = await one("select balance, approved_paid, pending_paid, pending_count from public.deal_summaries where id = $1", [a.deal_id]);
    expect([num(s.balance), num(s.approved_paid), num(s.pending_paid), num(s.pending_count)]).toEqual([720000, 0, 150000, 2]);
    await db.query("select public.review_receipt($1, $2, true, null)", [approver, a.receipt_id]);
    s = await one("select balance, approved_paid from public.deal_summaries where id = $1", [a.deal_id]);
    expect([num(s.balance), num(s.approved_paid)]).toEqual([620000, 100000]);
  });

  it("two pending receipts cannot both be approved past the amount due", async () => {
    const a = await submit(sales, payload(sales, { price: "100000", payments: [cash(sales, "60000")] }));
    const b = await submit(sales, { receipt_no: `R-${++n}`, deal_id: a.deal_id, kind: "partial", payments: [cash(sales, "40000")] });
    await db.query("update public.receipts set amount = 70000 where id = $1", [b.receipt_id]); // simulates the race
    await db.query("select public.review_receipt($1, $2, true, null)", [approver, a.receipt_id]);
    await fails(db.query("select public.review_receipt($1, $2, true, null)", [approver, b.receipt_id]), "overpayment");
  });
});

describe("admin controls", () => {
  it("void, loan, cancel and settings are for the Admin", async () => {
    const r = await submit(sales, payload(sales, { sale_type: "financing", institution: "BDO", down_payment: "150000", payments: [cash(sales, "150000")] }));
    await db.query("select public.review_receipt($1, $2, true, null)", [approver, r.receipt_id]);
    await fails(db.query("select public.set_loan_status($1, $2, 'released', null)", [sales, r.deal_id]), "not_admin");
    await db.query("select public.set_loan_status($1, $2, 'released', '2026-11-05')", [admin, r.deal_id]);
    expect((await one<{ loan_status: string }>("select loan_status from public.deals where id = $1", [r.deal_id])).loan_status).toBe("released");
    await fails(db.query("select public.void_receipt($1, $2, 'oops')", [sales, r.receipt_id]), "not_admin");
    await fails(db.query("select public.void_receipt($1, $2, '')", [admin, r.receipt_id]), "reason_required");
    await db.query("select public.void_receipt($1, $2, 'Wrong amount')", [admin, r.receipt_id]);
    expect((await one<{ balance: string }>("select balance from public.deal_summaries where id = $1", [r.deal_id])).balance).toBe("150000.00");
    await fails(db.query("select public.update_settings($1, '{}'::jsonb)", [sales]), "not_admin");
    await db.query(`select public.update_settings($1, '{"feeStd":"8"}'::jsonb)`, [admin]);
    expect((await one<{ config: { feeStd: string } }>("select config from public.app_settings")).config.feeStd).toBe("8");
  });

  it("cancelling frees the plate, rejects what was waiting, and limits the refund to what was paid", async () => {
    const p = payload(sales);
    const r = await submit(sales, p);
    await db.query("select public.review_receipt($1, $2, true, null)", [approver, r.receipt_id]);
    const pending = await submit(sales, { receipt_no: `R-${++n}`, deal_id: r.deal_id, kind: "partial", payments: [cash(sales, "10000")] });
    await fails(db.query("select public.cancel_deal($1, $2, 'He changed his mind', 0)", [sales, r.deal_id]), "not_admin");
    await fails(db.query("select public.cancel_deal($1, $2, 'He changed his mind', 999999)", [admin, r.deal_id]), "refund_invalid");
    await db.query("select public.cancel_deal($1, $2, 'He changed his mind', 5000)", [admin, r.deal_id]);
    expect((await one<{ status: string }>("select status from public.receipts where id = $1", [pending.receipt_id])).status).toBe("rejected");
    await expect(submit(sales, payload(sales, { units: p.units }))).resolves.toBeTruthy(); // the plate is free again
    await fails(submit(sales, { receipt_no: `R-${++n}`, deal_id: r.deal_id, kind: "partial", payments: [cash(sales, "1000")] }), "deal_cancelled");
  });
});

describe("access", () => {
  it("signed-in users read, nobody writes directly, and the functions are the server's only", async () => {
    const as = async (id: string, sql: string): Promise<{ rows: Record<string, unknown>[] }> => {
      await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
      try { return (await db.query(sql)) as { rows: Record<string, unknown>[] }; } finally { await db.exec("reset role;"); }
    };
    await expect(as(sales, "select count(*) from public.deal_summaries")).resolves.toBeTruthy();
    await expect(as(sales, "select count(*) from public.app_settings")).resolves.toBeTruthy();
    await expect(as(sales, "delete from public.receipts")).rejects.toThrow();
    await expect(as(sales, "insert into public.app_settings (id, config) values (1, '{}')")).rejects.toThrow();
    await expect(as(sales, `select public.update_settings('${sales}', '{}'::jsonb)`)).rejects.toThrow();
    expect(num((await as(sales, "select count(*) as n from public.audit_logs")).rows[0].n)).toBe(0); // sales cannot read the log
    expect(num((await as(approver, "select count(*) as n from public.audit_logs")).rows[0].n)).toBeGreaterThan(0);
  });
});

// The server computes the same numbers as an independent calculator written from the rules.
describe("the money, 300 random deals", () => {
  it("balance_after, amount_due and the loan match an independent calculation", async () => {
    let seed = 20261105;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const pesos = (lo: number, hi: number) => Math.round((lo + rnd() * (hi - lo)) * 100);
    const money = (c: number) => (c / 100).toFixed(2);
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const fin = rnd() < 0.5, P = pesos(150000, 2500000);
      const dp = fin ? pesos((P / 100) * 0.1, (P / 100) * 0.9) : 0;
      const share = fin ? Math.min(dp, P) : P;
      const T = rnd() < 0.4 ? pesos(10000, Math.max(10001, (share / 100) * (fin ? 1 : 1.1))) : 0;
      if (fin && T > share) continue;
      const fee = fin && rnd() < 0.8 ? pesos(0, 120000) : 0;
      const due0 = share - T + fee;
      const Z = due0 > 0 && rnd() < 0.3 ? pesos(0, due0 / 100) : 0; // in lieu of documents: never more than the buyer owes
      const due = due0 - Z;
      const pays = [pesos(0, 200000), ...(rnd() < 0.5 ? [pesos(0, 60000)] : [])].filter((c) => c > 0);
      const paid = pays.reduce((a, b) => a + b, 0);
      const payout = due < 0 && rnd() < 0.7 ? Math.min(pesos(0, Math.max(1, -due / 100)), -due) : 0;
      const balance = due - paid + payout;
      const body = payload(sales, {
        price: money(P), sale_type: fin ? "financing" : "cash", institution: fin ? "BDO" : undefined, down_payment: fin ? money(dp) : undefined,
        processing_fee: fin ? money(fee) : undefined, trade_in: T ? { value: money(T) } : null,
        payments: pays.map((c) => ({ method: "wallet", label: "GCash", amount: money(c), attachments: proof(sales) })),
        payout: payout > 0 ? { amount: money(payout), attachments: proof(sales) } : null,
        lieu: Z > 0 ? { amount: money(Z), until: "2026-12-20" } : null,
      });
      if ((due >= 0 && balance < 0) || (due < 0 && balance > 0) || (paid === 0 && payout === 0 && due > 0)) {
        let rejected = false;
        try { await submit(sales, body); } catch { rejected = true; }
        expect(rejected, JSON.stringify({ P, fin, dp, T, due, pays, payout, balance })).toBe(true);
        continue;
      }
      const r = await submit(sales, body);
      const d = await one<{ amount_due: string; loan_amount: string }>("select amount_due, loan_amount from public.deals where id = $1", [r.deal_id]);
      expect([Math.round(num(d.amount_due) * 100), Math.round(num(d.loan_amount) * 100), Math.round(num(r.balance_after) * 100)]).toEqual([due, P - share, balance]);
      checked++;
    }
    expect(checked).toBeGreaterThan(150);
  }, 120_000);
});
