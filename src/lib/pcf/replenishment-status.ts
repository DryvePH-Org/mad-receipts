export const REPLENISHMENT_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "closed",
] as const;

export type ReplenishmentStatus = (typeof REPLENISHMENT_STATUSES)[number];

export const REPLENISHMENT_STATUS_LABELS: Record<
  ReplenishmentStatus,
  string
> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  closed: "Closed",
};

export function isReplenishmentStatus(
  value: string | undefined,
): value is ReplenishmentStatus {
  return (
    value !== undefined &&
    (REPLENISHMENT_STATUSES as readonly string[]).includes(value)
  );
}
