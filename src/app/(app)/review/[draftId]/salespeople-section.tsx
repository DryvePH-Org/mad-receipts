"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_SALESPEOPLE, newRowKey, type SalesRow } from "@/lib/salespeople/rows";

export interface SalespersonOption {
  id: string;
  name: string;
}

/** Who sold the car and each person's own commission percent. */
export function SalespeopleSection({
  rows,
  options,
  names,
  required,
  errors,
  onChange,
}: {
  rows: SalesRow[];
  options: SalespersonOption[];
  /** Names of everyone referenced, including people no longer on the active list. */
  names: Map<string, string>;
  required: boolean;
  errors: string[];
  onChange: (rows: SalesRow[]) => void;
}) {
  const update = (key: string, patch: Partial<SalesRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Sold by
          {required && <span className="text-destructive"> *</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {required
            ? "This payment completes the sale, so add who sold the car and each person's own commission %."
            : "Optional until the car is sold. You can say it in a voice note on any receipt."}
        </p>

        {options.length === 0 && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
            No salespeople have been added yet. Ask an admin to add them under Admin → Salespeople.
          </p>
        )}

        {rows.map((row) => {
          const known = row.salespersonId && !options.some((o) => o.id === row.salespersonId);
          return (
            <div key={row.key} className="space-y-2 rounded-lg border p-3">
              {row.heard && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  I heard &quot;{row.heard}&quot;{row.salespersonId ? ". Check this is the right person." : "."}
                </p>
              )}
              <div className="grid grid-cols-[1fr_6.5rem_auto] items-end gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`sp-${row.key}`}>Salesperson</Label>
                  <select
                    id={`sp-${row.key}`}
                    value={row.salespersonId}
                    onChange={(e) => update(row.key, { salespersonId: e.target.value, heard: undefined })}
                    className="h-12 w-full rounded-lg border border-input bg-transparent px-3 text-base"
                  >
                    <option value="">Choose…</option>
                    {known && <option value={row.salespersonId}>{names.get(row.salespersonId) ?? "Unknown"} (inactive)</option>}
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`pct-${row.key}`}>Commission %</Label>
                  <Input
                    id={`pct-${row.key}`}
                    value={row.percent}
                    onChange={(e) => update(row.key, { percent: e.target.value })}
                    inputMode="decimal"
                    placeholder="3"
                    className="h-12 text-base"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                  aria-label="Remove this salesperson"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          );
        })}

        {errors.length > 0 && (
          <ul className="space-y-1">
            {errors.map((message) => (
              <li key={message} className="text-sm text-destructive">
                {message}
              </li>
            ))}
          </ul>
        )}

        {rows.length < MAX_SALESPEOPLE && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange([...rows, { key: newRowKey(), salespersonId: "", percent: "" }])}
            className="h-12 w-full text-base"
          >
            <Plus className="size-5" /> Add {rows.length === 0 ? "salesperson" : "another salesperson"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
