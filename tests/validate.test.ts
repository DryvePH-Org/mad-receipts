import { describe, expect, it } from "vitest";
import { computePayment } from "@/lib/rules/payment";
import { normalizePlate, validateExtraction, type ReceiptFields } from "@/lib/rules/validate";

const pesos = (n: number) => n * 100;

// The reference sample from the build plan, in centavos.
const sample: ReceiptFields = {
  receipt_no: "2556",
  receipt_date: "2026-11-02",
  buyer_name: "Jose Rizal",
  buyer_address: "16 San Fernando, Kapitolyo, Pasig City",
  buyer_contact: null,
  amount_words: "Fifty Thousand Only",
  amount: pesos(50_000),
  paper_payment_type: "earnest",
  make_type: "2021 Honda Civic",
  plate_no: "NKF4771",
  motor_no: null,
  chassis_no: null,
  color: "Black",
  agreed_price: pesos(500_000),
  less_payment: pesos(50_000),
  balance: pesos(450_000),
  payment_method: "cash",
  check_no: null,
  bank_branch: null,
  balance_words: "Four Hundred Fifty Thousand",
  balance_amount: null,
  balance_due_date: "2026-11-05",
};

const firstPayment = (fields: ReceiptFields, markedReservation = true) =>
  computePayment({
    agreedPrice: fields.agreed_price!,
    totalPaidBefore: 0,
    amount: fields.amount!,
    isFirstReceipt: true,
    markedReservation,
  });

const fieldsOf = (issues: ReturnType<typeof validateExtraction>) =>
  issues.map((i) => `${i.level}:${i.field}`);

describe("validateExtraction", () => {
  it("passes the reference sample cleanly", () => {
    expect(validateExtraction(sample, { payment: firstPayment(sample) })).toEqual([]);
  });

  it("does not flag blank motor and chassis numbers", () => {
    const issues = validateExtraction({ ...sample, motor_no: null, chassis_no: "" });
    expect(issues.filter((i) => i.field === "motor_no" || i.field === "chassis_no")).toEqual([]);
  });

  it("errors on missing receipt number, plate and amount", () => {
    const issues = validateExtraction({ ...sample, receipt_no: " ", plate_no: "--", amount: null });
    expect(fieldsOf(issues)).toEqual(
      expect.arrayContaining(["error:receipt_no", "error:plate_no", "error:amount"]),
    );
  });

  it("errors on zero or negative amount", () => {
    expect(fieldsOf(validateExtraction({ ...sample, amount: 0 }))).toContain("error:amount");
    expect(fieldsOf(validateExtraction({ ...sample, amount: -500 }))).toContain("error:amount");
  });

  it("warns when price − payment ≠ balance", () => {
    const issues = validateExtraction({ ...sample, balance: pesos(400_000) });
    expect(issues).toContainEqual(expect.objectContaining({ field: "balance", level: "warning" }));
  });

  it("warns when amount words don't match the amount", () => {
    const issues = validateExtraction({ ...sample, amount_words: "Five Thousand Only" });
    expect(fieldsOf(issues)).toContain("warning:amount_words");
  });

  it("tolerates messy but correct amount words", () => {
    const issues = validateExtraction({ ...sample, amount_words: "fifty-thousnd pesos only" });
    expect(fieldsOf(issues)).not.toContain("warning:amount_words");
  });

  it("warns when balance words don't match the balance", () => {
    expect(fieldsOf(validateExtraction({ ...sample, balance_words: "Four Hundred Thousand" }))).toContain(
      "warning:balance_words",
    );
    // balance_amount, when written, is the number the words are checked against.
    expect(
      fieldsOf(validateExtraction({ ...sample, balance_amount: pesos(400_000) })),
    ).toContain("warning:balance_words");
  });

  it("warns when the paper type differs from the computed type", () => {
    // Paper says earnest but staff did not mark it as a reservation → partial.
    const issues = validateExtraction(sample, { payment: firstPayment(sample, false) });
    expect(issues).toContainEqual(
      expect.objectContaining({ field: "paper_payment_type", level: "warning" }),
    );
  });

  it("errors on overpayment", () => {
    const fields = { ...sample, amount: pesos(600_000) };
    const issues = validateExtraction(fields, { payment: firstPayment(fields) });
    expect(issues).toContainEqual({
      field: "amount",
      level: "error",
      message: "This payment is more than the remaining balance.",
    });
  });

  it("warns on a missing due date only while a balance remains", () => {
    expect(fieldsOf(validateExtraction({ ...sample, balance_due_date: null }))).toContain(
      "warning:balance_due_date",
    );

    const full = { ...sample, amount: pesos(500_000), amount_words: "Five Hundred Thousand", less_payment: pesos(500_000), balance: 0, balance_words: null, balance_due_date: null };
    expect(fieldsOf(validateExtraction(full, { payment: firstPayment(full) }))).not.toContain(
      "warning:balance_due_date",
    );
  });
});

describe("normalizePlate", () => {
  it.each([
    ["NKF4771", "NKF4771"],
    ["nkf 4771", "NKF4771"],
    ["NKF-4771", "NKF4771"],
    [" abc-12 3 ", "ABC123"],
    [null, ""],
  ])("%j → %j", (input, expected) => {
    expect(normalizePlate(input)).toBe(expected);
  });
});
