import { formatPeso, toCentavos } from "@/lib/rules/money";
import type { PaymentType } from "@/lib/rules/payment";

/** What staff see for a deal's status (section 2.3): open = Reserved, completed = Sold. */
export const DEAL_STATUS_LABEL: Record<string, string> = {
  open: "Reserved",
  completed: "Sold",
  cancelled: "Cancelled",
};

export const dealStatusLabel = (status: string | null | undefined) => DEAL_STATUS_LABEL[status ?? ""] ?? "—";

export const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  earnest: "Earnest money",
  partial: "Partial payment",
  full: "Full payment",
};

export const paymentTypeLabel = (type: string | null | undefined) =>
  PAYMENT_TYPE_LABEL[type as PaymentType] ?? "—";

/** A numeric(12,2) value from the database as pesos: 450000 → "₱450,000". */
export function pesos(value: number | string | null | undefined): string {
  const centavos = value === null || value === undefined ? null : toCentavos(value);
  return centavos === null ? "—" : formatPeso(centavos);
}
