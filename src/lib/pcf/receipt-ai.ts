import { z } from "zod";

import { cleanText } from "@/lib/pcf/validators/text";
import { MAX_VOUCHER_LINES } from "@/lib/pcf/validators/voucher";

export type ScannedLine = {
  particulars: string;
  amount: string;
  category_id: string;
};

export type ScannedReceipt = {
  payee: string;
  voucher_date: string;
  lines: ScannedLine[];
  // Things the custodian should double-check (for example mismatched totals).
  warnings: string[];
};

const rawSchema = z.object({
  payee: z.string().nullish(),
  date: z.string().nullish(),
  items: z
    .array(
      z.object({
        description: z.string().nullish(),
        amount: z.union([z.number(), z.string()]).nullish(),
        category: z.string().nullish(),
      }),
    )
    .default([]),
  total: z.union([z.number(), z.string()]).nullish(),
});

export type ScanKind = "receipt" | "voucher";

const SHAPE =
  '{"payee": string|null, "date": "YYYY-MM-DD"|null, "items": [{"description": string, "amount": number, "category": string|null}], "total": number|null}';

export function buildScanPrompt(
  categoryNames: string[],
  today: string,
  kind: ScanKind = "receipt",
  knownPayees: string[] = [],
) {
  const categoryRule = `- category must be exactly one of: ${categoryNames.map((name) => JSON.stringify(name)).join(", ")}; use null if none fits.`;
  const common = [
    "Return ONLY a JSON object with this shape:",
    SHAPE,
    "Rules:",
    `- date is the date as YYYY-MM-DD. Today is ${today}; use it to resolve a missing year. Philippine dates are usually month/day/year. Use null if unreadable.`,
    "- amount is a plain number with no currency symbol or thousands separators.",
  ];
  const payeeHint = knownPayees.length
    ? `- People or shops this fund has paid before: ${knownPayees.map((name) => JSON.stringify(name)).join(", ")}. The payee is often one of them; if the handwriting is close to one of these names, use that exact spelling.`
    : null;
  if (kind === "voucher") {
    return [
      "You read a photo of a filled-in paper petty cash voucher (often handwritten, with signatures).",
      ...common,
      '- payee is who received the money: the "To:" / "Paid to" / "Payee" name. Never use the signature of an approver or custodian.',
      ...(payeeHint ? [payeeHint] : []),
      "- items has one entry for EVERY row of the particulars table, in order, with that row's amount. Combine quantity and description into the description. If the table has one row, return one item.",
      "- Read handwriting carefully and give your best reading of unclear words or digits; never invent rows that are not on the page.",
      "- Handwritten amounts: a zero is often drawn as a narrow oval, a slashed circle or a squiggle and is easily mistaken for 7, 6 or 8. Petty cash amounts are usually round figures such as 2,000 or 350.00, so prefer 0 for any unclear digit after the first. A comma is followed by exactly three digits (2,000 not 2,070). Read the amount column only; the particulars text is not part of the amount.",
      "- Ignore voucher numbers, signatures, stamps and the grand total row (put the grand total in total).",
      categoryRule + " If the form has its own account or category column, match it to the closest option.",
    ].join("\n");
  }
  return [
    "You read a photo of a store receipt or invoice for a petty cash voucher.",
    ...common,
    "- payee is the store or supplier name printed on the receipt.",
    ...(payeeHint ? [payeeHint] : []),
    "- items lists each purchased line with its peso amount (the line total, not the unit price). If only a total is readable, return one item describing the purchase briefly.",
    "- Do not invent items. Skip VAT, change, cash tendered and discount lines unless they are the only amount.",
    categoryRule,
  ].join("\n");
}

// Models sometimes wrap JSON in prose or a <think> block; take the first object.
function extractJson(text: string) {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function toAmount(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const number =
    typeof value === "number"
      ? value
      : Number(value.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(number) || number <= 0 || number >= 1e10) return null;
  return (Math.round(number * 100) / 100).toFixed(2);
}

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length];
}

const normalizeName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

function titleCase(name: string) {
  return name.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

// Handwriting is easy to misread, names we have seen before are not: snap a
// close match to the known spelling, and tidy ALL CAPS otherwise.
export function snapPayee(read: string, known: string[]) {
  const wanted = normalizeName(read);
  if (!wanted) return read;
  let best: { name: string; ratio: number } | null = null;
  for (const candidate of known) {
    const target = normalizeName(candidate);
    if (!target) continue;
    const ratio = editDistance(wanted, target) / Math.max(wanted.length, target.length);
    if (!best || ratio < best.ratio) best = { name: candidate, ratio };
  }
  if (best && best.ratio <= 0.3) return best.name;
  return read === read.toUpperCase() ? titleCase(read) : read;
}

export function parseScan(
  text: string,
  categories: { id: string; name: string }[],
  knownPayees: string[] = [],
): ScannedReceipt | null {
  const json = extractJson(text);
  const parsed = rawSchema.safeParse(json);
  if (!parsed.success) return null;
  const { payee, date, items, total } = parsed.data;

  const byName = new Map(
    categories.map((category) => [category.name.trim().toLowerCase(), category.id]),
  );

  let lines: ScannedLine[] = [];
  for (const item of items.slice(0, MAX_VOUCHER_LINES)) {
    const amount = toAmount(item.amount);
    // Model output is untrusted text (a receipt can contain instructions); clean it like user input.
    const particulars = cleanText(item.description ?? "").slice(0, 300);
    if (!amount || !particulars) continue;
    lines.push({
      particulars,
      amount,
      category_id: byName.get(item.category?.trim().toLowerCase() ?? "") ?? "",
    });
  }

  if (lines.length === 0) {
    const fallback = toAmount(total);
    if (fallback) {
      lines = [{ particulars: payee?.trim() || "Purchase", amount: fallback, category_id: "" }];
    }
  }

  const validDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
  if (lines.length === 0 && !payee?.trim() && !validDate) return null;

  const warnings: string[] = [];
  const written = toAmount(total);
  if (written && lines.length > 0) {
    const sum = lines.reduce((acc, line) => acc + Math.round(Number(line.amount) * 100), 0);
    if (sum !== Math.round(Number(written) * 100)) {
      warnings.push(
        `The lines add up to ₱${(sum / 100).toFixed(2)} but the total read from the paper is ₱${written}. Check the amounts.`,
      );
    }
  }

  return {
    payee: snapPayee(cleanText(payee ?? "").slice(0, 120), knownPayees),
    voucher_date: validDate,
    lines,
    warnings,
  };
}
