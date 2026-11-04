import { describe, expect, it } from "vitest";
import { groundInTranscript } from "@/lib/extraction/grounding";
import { ExtractedReceipt } from "@/lib/extraction/schema";
import { TermsSuggestion } from "@/lib/extraction/terms-schema";

const ground = (transcript: string, fields: Record<string, unknown> = {}, terms: Record<string, unknown> = {}, salespeople: { name: string; commission_percent: number | null }[] = []) =>
  groundInTranscript(transcript, { fields: ExtractedReceipt.parse(fields), terms: TermsSuggestion.parse(terms), salespeople });

describe("only what was really said goes through", () => {
  it("keeps values that are in the transcript, in any language", () => {
    const g = ground(
      "Receipt number twenty five fifty six, plate N K F four seven seven one, limampung libo ang binayad, buyer is Maria Santos, contact zero nine one seven three two one six zero seven eight",
      { receipt_no: "2556", plate_no: "NKF4771", amount: 50000, buyer_name: "Maria Santos", buyer_contact: "09173216078" },
    );
    expect(g.unsure).toEqual([]);
    expect([g.fields.receipt_no, g.fields.plate_no, g.fields.amount, g.fields.buyer_name, g.fields.buyer_contact]).toEqual(["2556", "NKF4771", 50000, "Maria Santos", "09173216078"]);
  });

  it("throws away a number that was never said", () => {
    const g = ground("fifty thousand earnest money", { amount: 50000, agreed_price: 500000 });
    expect(g.fields.amount).toBe(50000);
    expect(g.fields.agreed_price).toBeNull();
    expect(g.unsure).toEqual(["the agreed price"]);
  });

  it("throws away a plate, a name or a receipt number that is not in the words", () => {
    const g = ground("plate NKF 4771, buyer Maria Santos, receipt 2556", { plate_no: "NKF4991", buyer_name: "Maria Santos Cruz", receipt_no: "2565" });
    expect(g.fields.plate_no).toBeNull();
    expect(g.fields.buyer_name).toBeNull();
    expect(g.fields.receipt_no).toBeNull();
    expect([...g.unsure].sort()).toEqual(["the buyer's name", "the plate number", "the receipt number"]);
  });

  it("understands that a spoken color word is the same as its English name", () => {
    expect(ground("kulay itim ang sasakyan", { color: "Black" }).fields.color).toBe("Black");
    expect(ground("kulay itim ang sasakyan", { color: "Red" }).fields.color).toBeNull();
  });

  it("dates need the day and the month, or a relative word", () => {
    expect(ground("balance due November 5", { balance_due_date: "2026-11-05" }).fields.balance_due_date).toBe("2026-11-05");
    expect(ground("balance due November 5", { balance_due_date: "2026-11-15" }).fields.balance_due_date).toBeNull();
    expect(ground("bayaran bukas", { balance_due_date: "2026-11-04" }).fields.balance_due_date).toBe("2026-11-04");
  });

  it("the payment type and method need their own words", () => {
    expect(ground("earnest money, cash", { paper_payment_type: "earnest", payment_method: "cash" }).unsure).toEqual([]);
    const g = ground("fifty thousand", { paper_payment_type: "full", payment_method: "check" });
    expect([g.fields.paper_payment_type, g.fields.payment_method]).toEqual([null, null]);
  });

  it("words that only exist on the paper are never taken from a voice note", () => {
    expect(ground("fifty thousand", { amount_words: "Fifty Thousand Only", balance_words: "x" }).fields.amount_words).toBeNull();
  });

  it("deal terms must be in the words too", () => {
    const ok = ground("financing, loan one hundred thirty thousand with GDFI, fee ten thousand, paid twenty thousand before", {}, { transaction_type: "financing", loan_amount: 130000, financier: "GDFI", processing_fee: 10000, paid_before: 20000 });
    expect(ok.unsure).toEqual([]);
    const bad = ground("financing with BPI", {}, { transaction_type: "financing", loan_amount: 130000, financier: "GDFI" });
    expect([bad.terms.transaction_type, bad.terms.loan_amount, bad.terms.financier]).toEqual(["financing", null, null]);
    expect(bad.unsure).toEqual(["the loan amount", "the financing company"]);
    expect(ground("cash payment", {}, { transaction_type: "trade_in" }).terms.transaction_type).toBeNull();
  });

  it("salespeople: an invented name is dropped, an unsaid percent is blank", () => {
    const g = ground("salesman David, three percent. Ella", {}, {}, [
      { name: "David", commission_percent: 3 },
      { name: "Ella", commission_percent: 2 },
      { name: "Mark", commission_percent: 1 },
    ]);
    expect(g.salespeople).toEqual([{ name: "David", commission_percent: 3 }, { name: "Ella", commission_percent: null }]);
    expect(g.unsure).toEqual(["Ella's commission %", "a salesperson's name"]);
  });
});
