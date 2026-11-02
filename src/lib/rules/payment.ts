import { UNIT_STATUS, type UnitStatus } from "@/lib/inventory/types";

export type PaymentType = "earnest" | "partial" | "full";
export type DealStatus = "open" | "completed" | "cancelled";

export interface PaymentInput {
  /** All money in integer centavos. */
  agreedPrice: number;
  totalPaidBefore: number;
  amount: number;
  /** No confirmed receipts on the deal yet. */
  isFirstReceipt: boolean;
  /** Staff ticked "This is a reservation (earnest money)". */
  markedReservation: boolean;
}

export type PaymentError = "invalid_input" | "amount_not_positive" | "overpayment";

export type PaymentResult =
  | { balanceAfter: number; paymentType: PaymentType; error?: undefined }
  | { balanceAfter: number; paymentType: null; error: PaymentError };

/**
 * Computes the payment type from the numbers (section 2.2). The checkbox on the
 * paper is never trusted: the computed type always wins.
 */
export function computePayment(input: PaymentInput): PaymentResult {
  const { agreedPrice, totalPaidBefore, amount, isFirstReceipt, markedReservation } = input;

  const money = [agreedPrice, totalPaidBefore, amount];
  if (!money.every(Number.isSafeInteger) || agreedPrice <= 0 || totalPaidBefore < 0) {
    return { balanceAfter: NaN, paymentType: null, error: "invalid_input" };
  }

  const balanceAfter = agreedPrice - (totalPaidBefore + amount);
  if (amount <= 0) return { balanceAfter, paymentType: null, error: "amount_not_positive" };
  if (balanceAfter < 0) return { balanceAfter, paymentType: null, error: "overpayment" };

  if (balanceAfter === 0) return { balanceAfter, paymentType: "full" };
  if (isFirstReceipt && markedReservation) return { balanceAfter, paymentType: "earnest" };
  return { balanceAfter, paymentType: "partial" };
}

/** Deal status for a balance (section 2.3). Cancellation is an admin action, not a balance. */
export function dealStatusForBalance(balance: number): Exclude<DealStatus, "cancelled"> {
  return balance === 0 ? "completed" : "open";
}

/** Inventory unit status for a deal status (section 2.3). */
export function unitStatusForDeal(status: DealStatus): UnitStatus {
  switch (status) {
    case "open":
      return UNIT_STATUS.reserved;
    case "completed":
      return UNIT_STATUS.sold;
    case "cancelled":
      return UNIT_STATUS.available;
  }
}

export const PAYMENT_ERROR_MESSAGES: Record<PaymentError, string> = {
  invalid_input: "Check the agreed price and amount.",
  amount_not_positive: "The amount must be more than zero.",
  overpayment: "This payment is more than the remaining balance.",
};
