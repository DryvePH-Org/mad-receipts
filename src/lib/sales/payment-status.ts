import type { PaymentStatus } from "@/lib/docs/payments";

// The payment status of a sale follows its transaction (the deal made by the receipts), so nobody has to set it by hand:
//   no money yet = Unpaid; money in and a balance left = Partly paid; paid in full (cash) = Fully paid;
//   financing whose buyer's part is paid waits for the lender (still Partly paid) until the loan is released = Loan released.
// A cancelled deal clears it. Pure.

export interface DealMoney { status: string; balance: number | string | null; approved_paid: number | string | null; opening_paid: number | string | null; sale_type: string; loan_status: string }
const n = (v: unknown) => Number(v ?? 0);

export function paymentStatusOfDeal(d: DealMoney): PaymentStatus | null {
  if (d.status === "cancelled") return null;
  const received = n(d.approved_paid) + n(d.opening_paid);
  if (n(d.balance) > 0) return received > 0 ? "partial" : "unpaid";
  if (d.sale_type === "financing") return d.loan_status === "released" ? "loan_released" : "partial";
  return "paid";
}
