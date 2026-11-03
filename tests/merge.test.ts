import { describe, expect, it } from "vitest";
import { ExtractedReceipt } from "@/lib/extraction/schema";
import { mergeVoice, sameValue, toFormValues, type FormValues } from "@/lib/extraction/merge";

const blank = toFormValues(null);
const form = (overrides: Partial<FormValues>): FormValues => ({ ...blank, ...overrides });
const voice = (fields: Record<string, unknown>) => ExtractedReceipt.parse(fields);

describe("toFormValues", () => {
  it("turns extracted values into form text", () => {
    expect(toFormValues(voice({ amount: 50000, agreed_price: 1500.5, plate_no: "nkf-4771", color: null }))).toMatchObject({
      amount: "50000",
      agreed_price: "1500.50",
      plate_no: "NKF4771",
      color: "",
    });
    expect(toFormValues(null).amount).toBe("");
  });
});

describe("sameValue", () => {
  it.each([
    ["plate_no", "NKF 4771", "nkf-4771"],
    ["receipt_no", "2556", " 2556 "],
    ["amount", "50,000", "50000"],
    ["amount", "₱50,000.00", "50000"],
    ["amount_words", "Fifty Thousand Only", "fifty-thousand pesos"],
    ["buyer_name", "JOSE RIZAL", "Jose  Rizal"],
    ["buyer_contact", "0917 321 6078", "09173216078"],
    ["receipt_date", "2026-11-02", "2026-11-02"],
    ["payment_method", "cash", "cash"],
  ] as const)("%s: %j equals %j", (field, a, b) => expect(sameValue(field, a, b)).toBe(true));

  it.each([
    ["plate_no", "NKF4991", "NKF4771"],
    ["amount", "50000", "5000"],
    ["amount_words", "Fifty Thousand", "Five Thousand"],
    ["buyer_name", "Jose Rizal", "Jose Rizzal"],
    ["receipt_date", "2024-11-02", "2026-11-02"],
    ["payment_method", "cash", "check"],
    ["buyer_contact", "09173216098", "09173216078"],
  ] as const)("%s: %j differs from %j", (field, a, b) => expect(sameValue(field, a, b)).toBe(false));
});

describe("mergeVoice", () => {
  it("fills blank fields from the voice and marks them as heard", () => {
    const merge = mergeVoice(form({ receipt_no: "2556" }), { receipt_no: "photo" }, voice({ plate_no: "NKF4771", amount: 50000 }));
    expect(merge.values).toEqual({ plate_no: "NKF4771", amount: "50000" });
    expect(merge.sources).toEqual({ plate_no: "voice", amount: "voice" });
    expect(merge.conflicts).toEqual([]);
  });

  it("notes where photo and voice agree, ignoring formatting", () => {
    const merge = mergeVoice(
      form({ plate_no: "NKF 4771", amount: "50000" }),
      { plate_no: "photo", amount: "photo" },
      voice({ plate_no: "NKF4771", amount: 50000 }),
    );
    expect(merge.agreed.sort()).toEqual(["amount", "plate_no"]);
    expect(merge.values).toEqual({});
    expect(merge.conflicts).toEqual([]);
  });

  it("flags a conflict instead of choosing: the misread plate case", () => {
    const merge = mergeVoice(form({ plate_no: "NKF4991", color: "BLUE" }), { plate_no: "photo", color: "photo" }, voice({ plate_no: "NKF4771", color: "Black" }));
    expect(merge.conflicts).toEqual([
      { field: "plate_no", current: "NKF4991", currentSource: "photo", voice: "NKF4771" },
      { field: "color", current: "BLUE", currentSource: "photo", voice: "Black" },
    ]);
    expect(merge.values).toEqual({}); // nothing is overwritten
  });

  it("never overrides what staff typed, and does not call it a conflict", () => {
    const merge = mergeVoice(form({ plate_no: "ABC1234" }), { plate_no: "typed" }, voice({ plate_no: "NKF4771" }));
    expect(merge.values).toEqual({});
    expect(merge.conflicts).toEqual([]);
    expect(merge.agreed).toEqual([]);
  });

  it("leaves fields the voice did not mention alone", () => {
    const merge = mergeVoice(form({ buyer_name: "Jose Rizal" }), { buyer_name: "photo" }, voice({}));
    expect(merge).toEqual({ values: {}, sources: {}, conflicts: [], agreed: [] });
  });

  it("calls a field from an earlier voice note by its source when it conflicts with a new one", () => {
    const merge = mergeVoice(form({ amount: "40000" }), { amount: "voice" }, voice({ amount: 50000 }));
    expect(merge.conflicts).toEqual([{ field: "amount", current: "40000", currentSource: "voice", voice: "50000" }]);
  });

  it("treats a filled field with no recorded source as coming from the photo", () => {
    const merge = mergeVoice(form({ color: "Blue" }), {}, voice({ color: "Black" }));
    expect(merge.conflicts[0].currentSource).toBe("photo");
  });
});
