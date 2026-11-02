import { formatPeso } from "./money";
import { PAYMENT_ERROR_MESSAGES, type PaymentResult, type PaymentType } from "./payment";
import { wordsMatchAmount } from "./words";

/** Receipt fields as edited on the review screen. Money is integer centavos. */
export interface ReceiptFields {
  receipt_no: string | null;
  receipt_date: string | null; // YYYY-MM-DD
  buyer_name: string | null;
  buyer_address: string | null;
  buyer_contact: string | null;
  amount_words: string | null;
  amount: number | null;
  paper_payment_type: PaymentType | null;
  make_type: string | null;
  plate_no: string | null;
  motor_no: string | null;
  chassis_no: string | null;
  color: string | null;
  agreed_price: number | null;
  less_payment: number | null;
  balance: number | null;
  payment_method: "cash" | "check" | null;
  check_no: string | null;
  bank_branch: string | null;
  balance_words: string | null;
  balance_amount: number | null;
  balance_due_date: string | null; // YYYY-MM-DD
}

export type IssueLevel = "error" | "warning";

export interface ValidationIssue {
  field: keyof ReceiptFields;
  level: IssueLevel;
  message: string;
}

export interface ValidationContext {
  /** Result of computePayment for this receipt, when the deal numbers are known. */
  payment?: PaymentResult;
}

/** Plates are the inventory key: uppercase letters and digits only ("nkf-4771" → "NKF4771"). */
export function normalizePlate(plate: string | null | undefined): string {
  return (plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const blank = (value: string | null) => !value || value.trim() === "";

const TYPE_LABEL: Record<PaymentType, string> = {
  earnest: "earnest money",
  partial: "partial payment",
  full: "full payment",
};

/**
 * Checks a receipt for problems. Errors block confirm; warnings need an explicit
 * "I checked the warnings". Motor and chassis numbers are optional: never flagged.
 * Whether the plate exists in inventory needs the sheet, so it is checked elsewhere.
 */
export function validateExtraction(
  data: ReceiptFields,
  context: ValidationContext = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (field: keyof ReceiptFields, message: string) =>
    issues.push({ field, level: "error", message });
  const warning = (field: keyof ReceiptFields, message: string) =>
    issues.push({ field, level: "warning", message });

  // Required fields.
  if (blank(data.receipt_no)) error("receipt_no", "Receipt number is missing.");
  if (normalizePlate(data.plate_no) === "") error("plate_no", "Plate number is missing.");
  if (data.amount === null) error("amount", "Amount is missing.");
  else if (data.amount <= 0) error("amount", "The amount must be more than zero.");

  // Paper arithmetic: agreed price − less payment should equal the balance.
  if (data.agreed_price !== null && data.less_payment !== null && data.balance !== null) {
    const expected = data.agreed_price - data.less_payment;
    if (expected !== data.balance) {
      warning(
        "balance",
        `Agreed price minus payment is ${formatPeso(expected)}, but the balance says ${formatPeso(data.balance)}.`,
      );
    }
  }

  // Words vs numbers.
  if (!blank(data.amount_words) && data.amount !== null && data.amount > 0) {
    if (!wordsMatchAmount(data.amount_words!, data.amount)) {
      warning("amount_words", `Amount in words does not match ${formatPeso(data.amount)}.`);
    }
  }
  const balanceNumber = data.balance_amount ?? data.balance;
  if (!blank(data.balance_words) && balanceNumber !== null && balanceNumber >= 0) {
    if (!wordsMatchAmount(data.balance_words!, balanceNumber)) {
      warning("balance_words", `Balance in words does not match ${formatPeso(balanceNumber)}.`);
    }
  }

  // Computed payment (needs the deal's numbers).
  const payment = context.payment;
  if (payment?.error && !(payment.error === "amount_not_positive" && data.amount !== null)) {
    // amount_not_positive is already reported above when the amount is present.
    error(payment.error === "invalid_input" ? "agreed_price" : "amount", PAYMENT_ERROR_MESSAGES[payment.error]);
  }
  if (payment?.paymentType && data.paper_payment_type && payment.paymentType !== data.paper_payment_type) {
    warning(
      "paper_payment_type",
      `The paper says ${TYPE_LABEL[data.paper_payment_type]}, but the numbers make this ${TYPE_LABEL[payment.paymentType]}. The computed type will be used.`,
    );
  }

  // A remaining balance needs a due date.
  const remaining = payment?.paymentType ? payment.balanceAfter : data.balance;
  if (remaining !== null && remaining > 0 && blank(data.balance_due_date)) {
    warning("balance_due_date", "There is a remaining balance but no due date.");
  }

  return issues;
}
