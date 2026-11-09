// What the database says when it refuses something, in words staff can act on.
const MESSAGES: Record<string, string> = {
  not_signed_in: "Please sign in again.",
  not_admin: "Only the Admin can do that.",
  not_approver: "Only the Approver can do that.",
  own_receipt: "You filled this receipt in, so someone else must approve it.",
  receipt_no_required: "Enter the receipt number.",
  receipt_no_taken: "That receipt number is already used.",
  kind_invalid: "Choose earnest money, partial or full payment.",
  payment_required: "Enter how much was paid.",
  payment_amount_invalid: "Every payment needs an amount above zero.",
  payment_method_invalid: "One of the payments has a method the system does not know.",
  payment_name_required: "Give each payment method a name.",
  proof_required: "Attach a proof for every payment.",
  payout_proof_required: "Attach a proof of the payout.",
  payout_not_allowed: "A payout only applies when the trade-in is worth more than what the buyer owes.",
  payout_too_high: "The payout is more than we owe the buyer.",
  overpayment: "More was received than the buyer owes on this deal.",
  buyer_required: "Enter the buyer's name.",
  unit_required: "Add at least one vehicle.",
  make_type_required: "Enter the make and type of every vehicle.",
  plate_required: "Enter the plate number of every vehicle.",
  plate_in_use: "That car already has a live deal. Continue that deal instead of starting a new one.",
  price_required: "Enter the agreed price.",
  sale_type_invalid: "Choose cash or financing.",
  institution_required: "Choose the financing institution.",
  down_payment_required: "Enter the down payment or the loan amount.",
  down_payment_too_high: "The down payment is more than the agreed price.",
  lieu_invalid: "The in-lieu amount is not valid.",
  lieu_too_high: "The in-lieu amount is more than the buyer owes.",
  trade_in_exceeds_down_payment: "The trade-in is worth more than the down payment. Raise the down payment to at least the trade-in value.",
  earlier_invalid: "The amount paid before this receipt is not valid.",
  trade_in_invalid: "The trade-in value is not valid.",
  deal_not_found: "That deal was not found.",
  deal_cancelled: "That deal was cancelled.",
  bad_attachment: "A proof file did not upload properly. Attach it again.",
  receipt_not_found: "That receipt was not found.",
  not_pending: "That receipt was already decided.",
  not_approved: "Only an approved receipt can be voided.",
  reason_required: "Write a reason (at least 3 letters).",
  refund_invalid: "The refund cannot be more than what was received.",
  already_cancelled: "That deal is already cancelled.",
  loan_status_invalid: "That loan status is not valid.",
  no_loan: "This deal has no loan.",
  settings_invalid: "Those settings are not valid.",
};

/** The friendly message for a Supabase error (its message is the code the database raised). */
export function friendlyError(message: string | undefined | null): string {
  const code = (message ?? "").trim();
  if (MESSAGES[code]) return MESSAGES[code];
  const found = Object.keys(MESSAGES).find((k) => code.includes(k));
  return found ? MESSAGES[found] : "Something went wrong. Please try again.";
}
