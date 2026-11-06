import type { AuditDiffRow } from "@/lib/pcf/audit";

export function AuditDiffTable({ rows }: { rows: AuditDiffRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No field changes recorded.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      {rows.map((row) => (
        <div
          key={row.field}
          className="rounded-lg border border-border px-3 py-2"
        >
          <p className="text-xs font-medium text-muted-foreground">
            {row.field}
          </p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <p className="truncate text-muted-foreground line-through decoration-destructive/50">
              {row.before}
            </p>
            <p className="truncate font-medium">{row.after}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
