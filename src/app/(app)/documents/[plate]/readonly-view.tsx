import { Check, Minus, X } from "lucide-react";
import { Pill } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CASE_LABELS, DOC_LABELS, type DocType } from "@/lib/docs/types";
import type { GridRow, Role } from "@/lib/docsbible/grid";
import { RegisterCard } from "./register-card";
import type { CarViewData } from "./types";

/** What Sales and Approver see of a car: the same information, with no controls and no document pictures (those are for Documentation). */
export function ReadOnlyView({ data, register, role }: { data: CarViewData; register: GridRow | null; role: Role }) {
  const groups = [["Before the sale", data.items.filter((i) => i.stage === "available")], ["After the sale", data.items.filter((i) => i.stage === "sold")]] as const;
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Papers <Pill tone="zinc">{CASE_LABELS[data.caseType]}</Pill></CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {groups.map(([title, list]) => (
              <div key={title} className="space-y-1.5"><p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
                <ul className="divide-y rounded-lg ring-1 ring-foreground/10">{list.map((i) => <li key={i.key} className="flex items-center gap-3 px-3 py-2 text-sm"><span className={i.present ? "text-emerald-700" : "text-amber-700"} aria-hidden>{i.present ? <Check className="size-4" /> : <X className="size-4" />}</span><span className="flex-1">{i.label}</span><span className="text-muted-foreground">{i.present ? "In the folder" : "Missing"}</span></li>)}</ul></div>
            ))}
            <p className="text-xs text-muted-foreground">Photos of the papers are shown to Documentation only.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>What was found in the folder</CardTitle></CardHeader>
          <CardContent>
            {data.files.length === 0 ? <p className="text-sm text-muted-foreground">No photos yet.</p> : (
              <ul className="divide-y text-sm">{data.files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 py-2"><Minus className="size-3 text-muted-foreground" aria-hidden /><span className="min-w-0 flex-1 truncate">{f.name}</span>
                  {f.readStatus !== "done" ? <Pill tone="blue">Not read yet</Pill> : f.types.length === 0 ? <Pill tone="zinc">Nothing recognised</Pill> : f.types.map((t) => <Pill key={t} tone="emerald">{DOC_LABELS[t as DocType] ?? t}</Pill>)}
                  {f.flags.length > 0 && <Pill tone="amber">{f.flags.length} to check</Pill>}</li>
              ))}</ul>
            )}
          </CardContent>
        </Card>
      </div>
      <RegisterCard plate={data.plate} row={register} role={role} canAct={false} />
    </div>
  );
}
