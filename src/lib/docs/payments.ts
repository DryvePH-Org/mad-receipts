// How a sale is being paid: one status the staff set by hand on the car, and the payment papers kept in the car's archive. Pure constants and helpers.

export const PAYMENT_STATUSES = ["unpaid", "partial", "paid", "loan_released"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_LABEL: Record<PaymentStatus, string> = { unpaid: "Unpaid", partial: "Partly paid", paid: "Fully paid", loan_released: "Loan released" };
export const isPaymentStatus = (v: unknown): v is PaymentStatus => typeof v === "string" && (PAYMENT_STATUSES as readonly string[]).includes(v);

/** What a payment paper is, chosen when it is added (the signed AR has its own button and is read by the bot). */
export const PAYMENT_TAGS = ["Proof of payment", "Down payment", "Loan or financing release", "Trade-in", "Other"] as const;
export type PaymentTag = (typeof PAYMENT_TAGS)[number];
export const isPaymentTag = (v: unknown): v is PaymentTag => typeof v === "string" && (PAYMENT_TAGS as readonly string[]).includes(v);

/** A file of the archive as the page shows it. */
export interface ArchiveFile { id: string; name: string; tag: string; amount: number | null; on: string | null; note: string | null; addedAt: string; mime: string; /** a signed AR from the Documents papers: shown here, kept there */ ar?: boolean }

/** An amount typed with commas or a peso sign; empty or not a positive number is nothing. */
export function cleanAmount(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[₱,\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 1e9 ? Math.round(n * 100) / 100 : null;
}

/** The total of the amounts written on the archive's papers (what the staff typed, never worked out from a picture). */
export const archiveTotal = (files: Pick<ArchiveFile, "amount">[]): number => files.reduce((sum, f) => sum + (f.amount ?? 0), 0);
