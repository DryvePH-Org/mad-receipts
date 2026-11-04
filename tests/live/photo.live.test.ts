import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractReceipt } from "@/lib/extraction";
import { interpretTerms } from "@/lib/extraction/interpret";

// Reading real receipt photos end to end: the vision model reads the paper, then the reasoning model
// decides how the sale is paid. The photos are real customer receipts, so they are NOT in the repository:
// put them in Docs/ (git ignores .jpg/.jpeg there) and these tests skip when a photo is missing.

const photo = (name: string) => (existsSync(`Docs/${name}`) ? new Uint8Array(readFileSync(`Docs/${name}`)) : null);

async function read(name: string) {
  const bytes = photo(name)!;
  const { fields, hints } = await extractReceipt(bytes, "image/jpeg");
  return { fields, hints, terms: await interpretTerms(fields, hints) };
}

describe("photo reading (real Groq)", () => {
  it.skipIf(!photo("ar-financed.jpg"))("a financed, full payment: loan, earlier payment and totals", async () => {
    const { fields, terms } = await read("ar-financed.jpg");
    expect(fields.amount).toBe(580000);
    expect(fields.agreed_price).toBe(720000);
    expect(fields.less_payment).toBe(600000);
    expect(fields.balance).toBeNull(); // the paper says "Mad: 0 Gdfi: 130,000", not a number
    expect(terms.transaction_type).toBe("financing");
    expect(terms.loan_amount).toBe(130000);
    expect(String(terms.financier).toLowerCase()).toContain("gdfi");
    expect(terms.paid_before).toBe(20000);
  });

  it.skipIf(!photo("ar-awaiting-financing.jpg"))("a reservation waiting for financing approval stays unclassified", async () => {
    await new Promise((r) => setTimeout(r, 30_000)); // free-tier rate limit
    const { fields, terms } = await read("ar-awaiting-financing.jpg");
    expect(fields.amount).toBe(20000);
    expect(fields.agreed_price).toBe(520000);
    expect(fields.balance).toBe(500000);
    expect(fields.balance_due_date).toBeNull();
    expect(terms.transaction_type).toBeNull(); // no loan amount yet
    expect(terms.paid_before).toBeNull();
  });

  it.skipIf(!photo("ar-simple-cash.jpg"))("a plain earnest-money receipt: no terms, no earlier payments", async () => {
    await new Promise((r) => setTimeout(r, 30_000));
    const { fields, terms } = await read("ar-simple-cash.jpg");
    expect(fields.amount).toBe(50000);
    expect(fields.agreed_price).toBe(500000);
    expect(terms.transaction_type).toBeNull();
    expect(terms.paid_before).toBeNull();
  });
});
