import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

// The deal money rules, run against the project's real migrations on a throwaway Postgres.
//   amount due = price - trade-in - loan + processing fee;  balance = amount due - paid;  sold at zero.

let db: Db;
let actor: string;
let david: string;
let counter = 0;

const confirm = async (payload: Record<string, unknown>) => {
  const draftId = crypto.randomUUID();
  await db.query("insert into public.receipt_drafts (id, photo_path, status, created_by) values ($1, $2, 'ready', $3)", [draftId, `drafts/${draftId}.jpg`, actor]);
  const r = await db.query<{ r: Record<string, unknown> }>("select public.confirm_receipt($1, $2, $3::jsonb) as r", [actor, draftId, JSON.stringify(payload)]);
  return r.rows[0].r;
};
const base = (plate: string, over: Record<string, unknown> = {}) => ({
  receipt_no: `T-${plate}-${++counter}`, plate_no: plate, amount: "100000", agreed_price: "500000",
  buyer_name: "Test Buyer", marked_reservation: true, ...over,
});
const plateOf = () => `TST${String(++counter).padStart(4, "0")}`;
const deal = async (plate: string) => (await db.query<Record<string, string | null>>("select * from public.deals where plate_no = $1 order by created_at desc limit 1", [plate])).rows[0];
const fails = async (promise: Promise<unknown>, code: string) => { await expect(promise).rejects.toThrow(code); };
const num = (v: unknown) => Number(v);

beforeAll(async () => {
  db = await createDb();
  actor = (await db.query<{ id: string }>("insert into auth.users (email) values ('a@example.test') returning id")).rows[0].id;
  david = (await db.query<{ id: string }>("insert into public.salespeople (name) values ('David') returning id")).rows[0].id;
}, 60_000);

describe("cash (the default)", () => {
  it("works as before: due equals the price", async () => {
    const p = plateOf();
    await confirm(base(p));
    const d = await deal(p);
    expect([d.transaction_type, num(d.amount_due), num(d.total_paid), num(d.balance), d.status]).toEqual(["cash", 500000, 100000, 400000, "open"]);
  });

  it("ignores financing or trade-in amounts sent with a cash deal", async () => {
    const p = plateOf();
    await confirm(base(p, { transaction_type: "cash", loan_amount: "100000", trade_in_value: "50000", processing_fee: "5000" }));
    expect(num((await deal(p)).amount_due)).toBe(500000);
  });
});

describe("financing", () => {
  const financing = (p: string, over: Record<string, unknown> = {}) =>
    base(p, { transaction_type: "financing", agreed_price: "720000", loan_amount: "130000", processing_fee: "10000", financier: "GDFI", ...over });

  it("receipt 2540: 20,000 paid earlier + 580,000 now covers the whole buyer side, the loan pays the rest", async () => {
    const p = plateOf();
    await fails(confirm(financing(p, { amount: "580000", paid_before: "20000", marked_reservation: false })), "salesperson_required");
    const r = await confirm(financing(p, { amount: "580000", paid_before: "20000", marked_reservation: false, salespeople: [{ salesperson_id: david, commission_percent: "3" }] }));
    expect(r).toMatchObject({ payment_type: "full", deal_status: "completed" });
    const d = await deal(p);
    expect([num(d.amount_due), num(d.opening_paid), num(d.total_paid), num(d.balance), d.financier]).toEqual([600000, 20000, 600000, 0, "GDFI"]);
  });

  it("a down payment alone leaves the rest of the buyer's side open", async () => {
    const p = plateOf();
    await confirm(financing(p, { amount: "100000" }));
    const d = await deal(p);
    expect([num(d.amount_due), num(d.balance), d.status]).toEqual([600000, 500000, "open"]);
  });

  it("the buyer cannot pay more than their side", async () => {
    await fails(confirm(financing(plateOf(), { amount: "650000" })), "overpayment");
  });

  it.each([
    ["no loan amount", { loan_amount: "0" }],
    ["a loan as big as the price", { loan_amount: "720000" }],
    ["an unknown type", { transaction_type: "layaway" }],
  ])("refuses %s", async (_name, over) => {
    await fails(confirm(financing(plateOf(), over)), "invalid_terms");
  });
});

describe("trade-in", () => {
  const tradeIn = (p: string, over: Record<string, unknown> = {}) =>
    base(p, { transaction_type: "trade_in", trade_in_value: "200000", trade_in_details: "2015 Toyota Vios, silver", ...over });

  it("the value of the traded car is credited and the rest is cash", async () => {
    const p = plateOf();
    await confirm(tradeIn(p));
    const d = await deal(p);
    expect([num(d.amount_due), num(d.balance), d.trade_in_details]).toEqual([300000, 200000, "2015 Toyota Vios, silver"]);
  });

  it("the traded car is worth less than the price: the buyer adds cash, in as many payments as needed, until Sold", async () => {
    const p = plateOf();
    // Price 500,000; the old car is taken at 200,000, so 300,000 in cash is still to come.
    await confirm(tradeIn(p, { amount: "100000" }));
    expect(num((await deal(p)).balance)).toBe(200000);
    await confirm(base(p, { amount: "150000", marked_reservation: false }));
    expect(num((await deal(p)).balance)).toBe(50000);
    const last = await confirm(base(p, { amount: "50000", marked_reservation: false, salespeople: [{ salesperson_id: david, commission_percent: "3" }] }));
    expect(last).toMatchObject({ payment_type: "full", deal_status: "completed" });
    const d = await deal(p);
    expect([num(d.total_paid), num(d.balance), d.status]).toEqual([300000, 0, "completed"]); // 300,000 in cash + 200,000 trade-in = 500,000
    // And the buyer can never pay more cash than what is left after the trade-in.
    await fails(confirm(tradeIn(plateOf(), { amount: "350000" })), "overpayment");
  });

  it("refuses a trade-in with no value or one worth the whole car", async () => {
    await fails(confirm(tradeIn(plateOf(), { trade_in_value: "0" })), "invalid_terms");
    await fails(confirm(tradeIn(plateOf(), { trade_in_value: "500000" })), "invalid_terms");
  });
});

describe("terms on an existing deal", () => {
  it("a cash reservation can become financing on the next receipt", async () => {
    const p = plateOf();
    await confirm(base(p, { amount: "20000", agreed_price: "720000" }));
    await confirm(base(p, { amount: "100000", agreed_price: "720000", transaction_type: "financing", loan_amount: "130000", processing_fee: "10000", financier: "GDFI" }));
    const d = await deal(p);
    expect([d.transaction_type, num(d.amount_due), num(d.total_paid), num(d.balance)]).toEqual(["financing", 600000, 120000, 480000]);
    const audit = await db.query<{ after: { terms_changed: boolean }; before: { deal: { transaction_type: string } } }>("select before, after from public.audit_logs where action = 'receipt.confirm' order by created_at desc limit 1");
    expect(audit.rows[0].after.terms_changed).toBe(true);
    expect(audit.rows[0].before.deal.transaction_type).toBe("cash");
  });

  it("new terms that put the due amount below what is already paid are refused", async () => {
    const p = plateOf();
    await confirm(base(p, { amount: "300000" }));
    await fails(confirm(base(p, { amount: "10000", transaction_type: "trade_in", trade_in_value: "400000" })), "overpayment");
  });

  it("paid_before only counts on a new deal", async () => {
    const p = plateOf();
    await confirm(base(p));
    await confirm(base(p, { paid_before: "90000" }));
    const d = await deal(p);
    expect([num(d.opening_paid), num(d.total_paid)]).toEqual([0, 200000]);
  });
});

describe("void and edit keep the money straight", () => {
  it("voiding goes back to what was paid before, including the opening amount", async () => {
    const p = plateOf();
    await confirm(base(p, { agreed_price: "720000", transaction_type: "financing", loan_amount: "130000", processing_fee: "10000", amount: "100000", paid_before: "20000" }));
    await confirm(base(p, { amount: "480000", marked_reservation: false, salespeople: [{ salesperson_id: david, commission_percent: "2" }] }));
    expect(num((await deal(p)).balance)).toBe(0);
    const latest = (await db.query<{ id: string }>("select r.id from public.receipts r join public.deals d on d.id = r.deal_id where d.plate_no = $1 order by r.created_at desc, r.id desc limit 1", [p])).rows[0].id;
    await db.query("select public.void_receipt($1, $2, 'wrong amount')", [actor, latest]);
    const d = await deal(p);
    expect([num(d.total_paid), num(d.balance), d.status]).toEqual([120000, 480000, "open"]);
  });

  it("an admin can change the terms of an open deal", async () => {
    const p = plateOf();
    await confirm(base(p, { agreed_price: "720000", amount: "50000" }));
    const id = (await deal(p)).id;
    await db.query("select public.update_deal_details($1, $2, $3::jsonb, null)", [actor, id, JSON.stringify({ transaction_type: "financing", loan_amount: "130000", processing_fee: "10000", financier: "BPI" })]);
    const d = await deal(p);
    expect([d.transaction_type, num(d.amount_due), num(d.balance), d.financier]).toEqual(["financing", 600000, 550000, "BPI"]);
  });

  it("terms cannot be edited on a sold deal, or in a way that would silently complete it", async () => {
    const p = plateOf();
    await confirm(base(p, { amount: "500000", marked_reservation: false, salespeople: [{ salesperson_id: david, commission_percent: "3" }] }));
    const sold = (await deal(p)).id;
    await fails(db.query("select public.update_deal_details($1, $2, $3::jsonb, null)", [actor, sold, JSON.stringify({ transaction_type: "cash" })]), "deal_not_open");

    const q = plateOf();
    await confirm(base(q, { amount: "300000" }));
    const open = (await deal(q)).id;
    await fails(db.query("select public.update_deal_details($1, $2, $3::jsonb, null)", [actor, open, JSON.stringify({ transaction_type: "trade_in", trade_in_value: "200000" })]), "terms_would_complete");
  });
});

describe("the database itself", () => {
  it("rejects terms that do not match the type, even if written directly", async () => {
    const p = plateOf();
    await confirm(base(p));
    const id = (await deal(p)).id;
    await expect(db.query("update public.deals set loan_amount = 1000 where id = $1", [id])).rejects.toThrow();
  });

  it("the deals list view shows the new columns", async () => {
    const p = plateOf();
    await confirm(base(p, { transaction_type: "trade_in", trade_in_value: "100000" }));
    const r = await db.query<{ amount_due: string; transaction_type: string }>("select amount_due, transaction_type from public.deal_summaries where plate_no = $1", [p]);
    expect([num(r.rows[0].amount_due), r.rows[0].transaction_type]).toEqual([400000, "trade_in"]);
  });
});
