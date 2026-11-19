"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { canEditColumn, COLUMNS, GRID_CLASSIFICATIONS, SALE_STATUSES, VEHICLE_STATUSES, type Col, type GridRow, type Role } from "@/lib/docsbible/grid";
import { PAPER_VALUES } from "@/lib/docsbible/normalize";
import { saveCellAction } from "../../docs-bible/actions";
import { updateRegisterAction } from "../actions";

const choicesOf = (c: Col): readonly string[] | null => c.kind === "paper" ? PAPER_VALUES : c.kind === "classification" ? GRID_CLASSIFICATIONS : c.kind === "sale_status" ? SALE_STATUSES : c.kind === "vehicle_status" ? VEHICLE_STATUSES : null;
const GROUPS: { title: string; keys: string[] }[] = [
  { title: "Where the papers are", keys: ["papers_with", "registry_of_deeds"] },
  { title: "Notes", keys: ["other_docs", "paper_status", "remarks_1", "remarks_2"] },
  { title: "The car", keys: ["category", "body_type", "year_model", "make", "model_variant", "color", "mileage", "trans", "fuel", "cs_no", "sale_status", "vehicle_status", "arrival_date", "encumbrance", "mo_file", "reg_owner_name", "buying_source", "awarded_to", "spare_key", "bank_source", "renewal"] },
];

/** The car's row of the Docs Bible, right on the car's page: the same columns the sheet had, changed in place by Documentation and Admin. */
export function RegisterCard({ plate, row, role, canAct }: { plate: string; row: GridRow | null; role: Role; canAct: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string | null>>(row?.values ?? {});
  const [busy, start] = useTransition();
  if (!row) return (
    <Card id="register"><CardHeader><CardTitle>Car record</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm"><p className="text-muted-foreground">This car is not in MAD yet. It is added when its documents are approved{canAct ? ", or press the button once the case is chosen" : ""}.</p>
        {canAct && <Button variant="outline" disabled={busy} onClick={() => start(async () => { const r = await updateRegisterAction(plate); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); })}>{busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Add it to MAD</Button>}</CardContent></Card>
  );
  const save = (col: Col, value: string) => {
    const before = values[col.key] ?? null;
    if ((value.trim() || null) === before) return;
    start(async () => {
      const r = await saveCellAction(row.id, col.key, value, before);
      if (!r.ok) { toast.error(r.message ?? "Could not save."); router.refresh(); return; }
      setValues((v) => ({ ...v, [col.key]: r.value ?? null })); toast.success(`${col.label} saved`);
    });
  };
  const field = (col: Col) => {
    const can = canEditColumn(role, col), choices = choicesOf(col), v = values[col.key] ?? "";
    const id = `reg-${col.key}`;
    return (
      <div key={col.key} className={col.kind === "remarks" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
        <label htmlFor={id} className="text-xs text-muted-foreground">{col.label} <span className="opacity-60">({col.letter})</span></label>
        {!can ? <p className="min-h-8 rounded-lg bg-muted/50 px-2.5 py-1.5 text-sm break-words whitespace-pre-line">{v || "—"}</p>
          : choices ? <NativeSelect id={id} value={v} onChange={(e) => save(col, e.target.value)}>{col.kind !== "classification" && <option value="">(empty)</option>}{col.kind === "classification" && v === "Not classified (legacy)" && <option value={v}>Not classified</option>}{choices.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect>
          : col.kind === "remarks" ? <textarea id={id} className="min-h-24 w-full rounded-lg border bg-background p-2 text-sm" defaultValue={v} onBlur={(e) => save(col, e.target.value)} />
          : <Input id={id} defaultValue={v} onBlur={(e) => save(col, e.target.value)} />}
      </div>
    );
  };
  return (
    <Card id="register">
      <details className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4 font-heading text-base font-medium">Car record: notes and the car&apos;s details
        {row.complete && <Pill tone={row.complete === "COMPLETE" ? "emerald" : "amber"}>{row.complete}</Pill>}
        {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />}
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Show</span></summary>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">{role === "admin" ? "Change any box." : role === "documentation" ? "Change the notes. The car's details are changed by an Admin. The papers are on the Papers card." : "You can look at this row. Documentation and Admin change it."} Every change is saved at once and kept in the history.</p>
        {GROUPS.map((g) => <div key={g.title} className="space-y-3"><p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.title}</p><div className="grid gap-3 sm:grid-cols-2">{g.keys.map((k) => COLUMNS.find((c) => c.key === k)).filter((c): c is Col => !!c).map(field)}</div></div>)}
        {canAct && <div className="space-y-1 border-t pt-4"><Button variant="outline" disabled={busy} onClick={() => start(async () => { const r = await updateRegisterAction(plate); if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.message); })}><RefreshCw /> Fill the papers from this scan</Button><p className="text-xs text-muted-foreground">Sets each paper to what is in the folder and adds the dated scan note. It overwrites those boxes.</p></div>}
      </CardContent>
      </details>
    </Card>
  );
}
