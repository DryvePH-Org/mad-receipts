import type { Json } from "@/lib/supabase/database.types";

export const AUDIT_ENTITY_TYPES = [
  "vouchers",
  "replenishments",
  "funds",
  "cash_counts",
  "profiles",
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ENTITY_LABELS: Record<AuditEntityType, string> = {
  vouchers: "Voucher",
  replenishments: "Replenishment",
  funds: "Fund",
  cash_counts: "Cash count",
  profiles: "User",
};

export function isAuditEntityType(
  value: string | undefined,
): value is AuditEntityType {
  return (
    value !== undefined &&
    (AUDIT_ENTITY_TYPES as readonly string[]).includes(value)
  );
}

export const AUDIT_ACTIONS = ["insert", "update", "status_change"] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  insert: "Created",
  update: "Updated",
  status_change: "Status changed",
};

export function isAuditAction(
  value: string | undefined,
): value is AuditAction {
  return (
    value !== undefined && (AUDIT_ACTIONS as readonly string[]).includes(value)
  );
}

export type AuditDiffRow = { field: string; before: string; after: string };

// Bookkeeping columns the trigger always touches; not useful in a diff view.
const NOISY_FIELDS = new Set(["created_at", "updated_at"]);

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toRecord(value: Json | null): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function buildAuditDiff(
  oldData: Json | null,
  newData: Json | null,
): AuditDiffRow[] {
  const old = toRecord(oldData);
  const next = toRecord(newData);
  const fields = [...new Set([...Object.keys(old), ...Object.keys(next)])]
    .filter((field) => !NOISY_FIELDS.has(field))
    .sort();

  return fields
    .map((field) => ({
      field,
      before: stringifyValue(old[field]),
      after: stringifyValue(next[field]),
    }))
    .filter((row) => row.before !== row.after);
}
