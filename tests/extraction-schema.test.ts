import { describe, expect, it } from "vitest";
import { EXTRACTED_FIELDS, ExtractedReceipt, toReceiptFields } from "@/lib/extraction/schema";
import { validateExtraction } from "@/lib/rules/validate";

// The reference sample from the build plan, as the model would return it.
const sample = {
  receipt_no: "2556",
  receipt_date: "2026-11-02",
  buyer_name: "Jose Rizal",
  buyer_address: "16 San Fernando, Kapitolyo, Pasig City",
  amount_words: "Fifty Thousand Only",
  amount: 50000,
  paper_payment_type: "earnest",
  make_type: "2021 Honda Civic",
  plate_no: "NKF4771",
  motor_no: null,
  chassis_no: null,
  color: "Black",
  agreed_price: 500000,
  less_payment: 50000,
  balance: 450000,
  payment_method: "cash",
  balance_words: "Four Hundred Fifty Thousand",
  balance_due_date: "2026-11-05",
};

describe("ExtractedReceipt", () => {
  it("parses the reference sample; missing keys become null", () => {
    const data = ExtractedReceipt.parse(sample);
    expect(data).toMatchObject(sample);
    expect(data.buyer_contact).toBeNull();
    expect(data.balance_amount).toBeNull();
    expect(Object.keys(data).sort()).toEqual([...EXTRACTED_FIELDS].sort());
  });

  it("validates cleanly after converting to centavos", () => {
    const fields = toReceiptFields(ExtractedReceipt.parse(sample));
    expect(fields.amount).toBe(5_000_000);
    expect(fields.balance).toBe(45_000_000);
    expect(validateExtraction(fields)).toEqual([]);
  });

  it("turns badly shaped values into null instead of guessing", () => {
    const data = ExtractedReceipt.parse({
      receipt_no: "",
      receipt_date: "Nov 2",
      amount: "fifty thousand",
      agreed_price: -5,
      balance_due_date: "2026-02-30",
      paper_payment_type: "unknown",
      payment_method: "gcash",
      buyer_name: "N/A",
      color: { value: "Black" },
    });
    expect(data).toMatchObject({
      receipt_no: null,
      receipt_date: null,
      amount: null,
      agreed_price: null,
      balance_due_date: null,
      paper_payment_type: null,
      payment_method: null,
      buyer_name: null,
      color: null,
    });
  });

  it("cleans up lenient-but-clear values", () => {
    const data = ExtractedReceipt.parse({
      amount: "50,000.00",
      plate_no: "nkf-4771",
      paper_payment_type: "Earnest Money",
      payment_method: "Cheque",
      receipt_no: 2556,
    });
    expect(data).toMatchObject({
      amount: 50000,
      plate_no: "NKF4771",
      paper_payment_type: "earnest",
      payment_method: "check",
      receipt_no: "2556",
    });
  });

  it("rejects answers that are not an object", () => {
    expect(ExtractedReceipt.safeParse("not json").success).toBe(false);
    expect(ExtractedReceipt.safeParse(null).success).toBe(false);
  });
});
