import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractReceipt } from "@/lib/extraction";
import { interpretTerms } from "@/lib/extraction/interpret";
import type { ExtractedReceipt } from "@/lib/extraction/schema";

// Reading real receipt photos end to end: two independent readings of the photo are cross-checked, then the
// reasoning model decides how the sale is paid. The photos are real customer receipts, so they are NOT in the
// repository: put them in Docs/ (git ignores .jpg/.jpeg there) and these tests skip when a photo is missing.
//
// The rule being tested: a value that goes into the form is either right, or blank with both readings offered.
// (If both readings make the SAME mistake, agreement cannot catch it: staff checking the paper is the last guard.)

const photo = (name: string) => (existsSync(`Docs/${name}`) ? new Uint8Array(readFileSync(`Docs/${name}`)) : null);

async function read(name: string) {
  const { fields, hints, uncertain, checked } = await extractReceipt(photo(name)!, "image/jpeg");
  const terms = await interpretTerms(fields, hints);
  return { fields, uncertain, checked, terms };
}

/** Right, or blank with the right answer among the choices. Never a wrong value. */
function rightOrUnsure(key: keyof ExtractedReceipt, fields: ExtractedReceipt, uncertain: Record<string, string[] | undefined>, truth: string | number) {
  const value = fields[key];
  if (value === null) {
    expect(uncertain[key]?.map((c) => c.replace(/[^A-Z0-9.]/gi, "").toUpperCase()), `${key} was blank but not offered`).toContain(String(truth).toUpperCase());
  } else {
    expect(String(value).toUpperCase(), key).toBe(String(truth).toUpperCase());
  }
}

describe("photo reading (real Groq)", () => {
  it.skipIf(!photo("ar-financed.jpg"))("a financed, full payment", async () => {
    const { fields, uncertain, checked, terms } = await read("ar-financed.jpg");
    expect(checked).toBe(true);
    rightOrUnsure("amount", fields, uncertain, 580000);
    rightOrUnsure("agreed_price", fields, uncertain, 720000);
    rightOrUnsure("plate_no", fields, uncertain, "DAR4015");
    expect(fields.balance).toBeNull(); // the paper says "Mad: 0 Gdfi: 130,000", not a number
    expect(terms.transaction_type).toBe("financing");
    expect(terms.loan_amount).toBe(130000);
    expect(String(terms.financier).toLowerCase()).toContain("gdfi");
  });

  it.skipIf(!photo("ar-awaiting-financing.jpg"))("a reservation waiting for financing approval", async () => {
    await new Promise((r) => setTimeout(r, 40_000)); // free-tier rate limit
    const { fields, uncertain, terms } = await read("ar-awaiting-financing.jpg");
    rightOrUnsure("amount", fields, uncertain, 20000);
    rightOrUnsure("agreed_price", fields, uncertain, 520000);
    rightOrUnsure("plate_no", fields, uncertain, "NKH7462");
    expect(terms.transaction_type).toBeNull(); // no loan amount yet
  });

  it.skipIf(!photo("ar-simple-cash.jpg"))("a plain earnest-money receipt", async () => {
    await new Promise((r) => setTimeout(r, 40_000));
    const { fields, uncertain, terms } = await read("ar-simple-cash.jpg");
    rightOrUnsure("amount", fields, uncertain, 50000);
    rightOrUnsure("agreed_price", fields, uncertain, 500000);
    rightOrUnsure("plate_no", fields, uncertain, "NKF4771");
    rightOrUnsure("receipt_no", fields, uncertain, "2556");
    expect(terms.transaction_type).toBeNull();
  });
});
