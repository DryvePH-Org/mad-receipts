"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ownerLabel, type UnitDetails } from "@/lib/docs/details";
import { saveDetailsAction } from "../actions";
import { useEditConfirm } from "./edit-confirm";
import { useStep } from "./use-step";

/** The staff's own checklist about the car (which owner, keys, maintenance, battery, the dealership it was bought from, EV extras). Saved with its own button; never blocks approval. */
export function AboutCard({ plate, details, missing, readOnly = false, confirmEdits = false }: { confirmEdits?: boolean; plate: string; details: UnitDetails; missing: string[]; readOnly?: boolean }) {
  const { busy, start, done } = useStep();
  const { confirm, dialog } = useEditConfirm(confirmEdits);
  const [d, setD] = useState<UnitDetails>(details);
  const set = (patch: Partial<UnitDetails>) => setD((x) => ({ ...x, ...patch }));
  const yn = (id: string, label: string, value: "yes" | "no" | "", onChange: (v: "yes" | "no" | "") => void) => (
    <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value as "yes" | "no" | "")}><option value="">Not answered</option><option value="yes">Yes</option><option value="no">No</option></NativeSelect></div>
  );
  const txt = (id: string, label: string, key: "casaWhen" | "casaWhere" | "batteryWhen" | "boughtFrom" | "note", max: number, placeholder?: string) => (
    <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><Input id={id} value={d[key]} maxLength={max} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value })} /></div>
  );
  return (
    <Card id="about" className="gap-0 py-0">
      <details className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4 font-heading text-base font-medium">About the car
        {missing.length ? <Pill tone="amber">{missing.length} to fill in</Pill> : <Pill tone="emerald">All filled in</Pill>}
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Show</span></summary>
      <CardContent className="pb-4 space-y-4"><fieldset disabled={readOnly} className="m-0 min-w-0 space-y-4 border-0 p-0">
        <div className="grid gap-4 sm:grid-cols-2">
          {yn("ud-key", "Spare key", d.spareKey, (v) => set({ spareKey: v }))}
          {yn("ud-casa", "Maintained at the casa (dealer)", d.casaMaintained, (v) => set({ casaMaintained: v }))}
          {d.casaMaintained === "yes" && <>{txt("ud-casa-when", "Casa maintenance: when", "casaWhen", 60, "e.g. March 2026, 45,000 km")}{txt("ud-casa-where", "Casa maintenance: where", "casaWhere", 100, "e.g. Toyota Quezon Ave")}</>}
          {txt("ud-battery", "Battery: when it was changed", "batteryWhen", 60, "e.g. June 2026")}
          {txt("ud-bought", "Dealership the car was bought from", "boughtFrom", 120)}
          <div className="space-y-1.5"><Label htmlFor="ud-owner">Which owner is this? (1 = first owner)</Label>
            <Input id="ud-owner" type="number" inputMode="numeric" min={1} max={30} value={d.ownerNo} onChange={(e) => set({ ownerNo: e.target.value.replace(/\D/g, "").slice(0, 2) })} />
            {d.ownerNo && ownerLabel(d.ownerNo) && <p className="text-xs text-muted-foreground">{ownerLabel(d.ownerNo)}</p>}</div>
          <div className="space-y-1.5"><Label htmlFor="ud-ev">Electric car?</Label>
            <NativeSelect id="ud-ev" value={d.evType} onChange={(e) => { const evType = e.target.value as UnitDetails["evType"]; set({ evType, isEv: evType !== "" }); }}><option value="">No</option><option value="ev">EV</option><option value="phev">PH EV</option></NativeSelect></div>
        </div>
        {d.isEv && <div className="grid gap-4 sm:grid-cols-2">
          {yn("ud-wall", "Wall charger", d.wallCharger, (v) => set({ wallCharger: v }))}
          {yn("ud-portable", "Portable charger", d.portableCharger, (v) => set({ portableCharger: v }))}
          {yn("ud-keycard", "Key card", d.keyCard, (v) => set({ keyCard: v }))}
          {yn("ud-chargingcard", "Charging card", d.chargingCard, (v) => set({ chargingCard: v }))}
        </div>}
        {txt("ud-note", "Note", "note", 300)}
        {!readOnly && missing.length > 0 && <p className="text-sm text-muted-foreground">Still blank: {missing.join("; ")}. You can approve with these blank; you will be asked to confirm.</p>}
        {!readOnly && <Button disabled={busy} onClick={() => confirm(() => start(async () => done(await saveDetailsAction(plate, d))))}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Save the details</Button>}
      </fieldset>
      </CardContent>
      </details>
      {dialog}
    </Card>
  );
}
