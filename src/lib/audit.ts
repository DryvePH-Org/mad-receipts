import { pesos } from "@/lib/deals";

export const ACTION_LABELS: Record<string, string> = {
  "receipt.confirm": "Receipt confirmed",
  "receipt.void": "Receipt voided",
  "deal.cancel": "Deal cancelled",
  "deal.update": "Deal details changed",
  "user.create": "User created",
  "user.reset_password": "Password reset",
  "salesperson.create": "Salesperson added",
  "salesperson.update": "Salesperson changed",
  "salesperson.activate": "Salesperson reactivated",
  "salesperson.deactivate": "Salesperson deactivated",
  "sync.retry": "Sync retried",
};

export const AUDIT_ENTITIES = ["receipt", "deal", "user", "salesperson", "sync_job"] as const;

export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action;

type Json = unknown;
const at = (value: Json, ...path: string[]): Json =>
  path.reduce<Json>((v, key) => (v && typeof v === "object" ? (v as Record<string, Json>)[key] : undefined), value);
const text = (value: Json) => (typeof value === "string" || typeof value === "number" ? String(value) : "");

const DETAIL_LABELS: Record<string, string> = {
  buyer_name: "buyer name",
  buyer_address: "address",
  buyer_contact: "contact",
  make_type: "vehicle",
  color: "color",
  motor_no: "motor no.",
  chassis_no: "chassis no.",
};

/** Which editable details differ between the before and after of a deal.update entry. */
export function changedDetails(before: Json, after: Json): string[] {
  const changed = Object.entries(DETAIL_LABELS)
    .filter(([key]) => text(at(before, "deal", key)) !== text(at(after, "deal", key)))
    .map(([, label]) => label);
  if (JSON.stringify(at(before, "salespeople")) !== JSON.stringify(at(after, "salespeople"))) changed.push("salespeople");
  return changed;
}

/** One readable line for an audit entry. */
export function auditSummary(entry: { action: string; before: Json; after: Json }): string {
  const { action, before, after } = entry;
  switch (action) {
    case "receipt.confirm": {
      const no = text(at(after, "receipt", "receipt_no"));
      const amount = at(after, "receipt", "amount");
      const parts = [no && `No. ${no}`, typeof amount === "number" && pesos(amount), text(at(after, "deal", "plate_no"))];
      return parts.filter(Boolean).join(" · ");
    }
    case "receipt.void":
      return `No. ${text(at(before, "receipt", "receipt_no"))} voided: ${text(at(after, "receipt", "void_reason"))}`;
    case "deal.cancel":
      return `${text(at(after, "plate_no"))} cancelled: ${text(at(after, "cancel_reason"))}${at(after, "forfeited") ? " (money forfeited)" : ""}`;
    case "deal.update": {
      const changed = changedDetails(before, after);
      return `${text(at(after, "deal", "plate_no"))}: ${changed.length ? `changed ${changed.join(", ")}` : "saved with no changes"}`;
    }
    case "user.create":
      return text(at(after, "email"));
    case "salesperson.create":
    case "salesperson.update":
      return text(at(after, "name"));
    case "sync.retry":
      return [text(at(after, "target")), text(at(after, "event"))].filter(Boolean).join(" · ");
    default:
      return "";
  }
}
