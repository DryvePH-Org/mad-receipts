"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { UnitDetails } from "@/lib/docs/details";
import { saveDetailsAction } from "../actions";
import { useStep } from "./use-step";

/** The staff's own checklist about the car (keys, maintenance, battery, where it was bought, EV). Saved with its own button; never blocks approval. */
export function AboutCard({ plate, details, missing }: { plate: string; details: UnitDetails; missing: string[] }) {
  const { busy, start, done } = useStep();
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
    <Card id="about">
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">About the car
        {missing.length ? <Pill tone="amber">{missing.length} to fill in</Pill> : <Pill tone="emerald">All filled in</Pill>}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {yn("ud-key", "Spare key", d.spareKey, (v) => set({ spareKey: v }))}
          {yn("ud-casa", "Maintained at the casa (dealer)", d.casaMaintained, (v) => set({ casaMaintained: v }))}
          {d.casaMaintained === "yes" && <>{txt("ud-casa-when", "Casa maintenance: when", "casaWhen", 60, "e.g. March 2026, 45,000 km")}{txt("ud-casa-where", "Casa maintenance: where", "casaWhere", 100, "e.g. Toyota Quezon Ave")}</>}
          {txt("ud-battery", "Battery: when it was changed", "batteryWhen", 60, "e.g. June 2026")}
          {txt("ud-bought", "Where the car was bought", "boughtFrom", 120)}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={d.isEv} onChange={(e) => set({ isEv: e.target.checked })} /> This is an electric car (EV)</label>
        {d.isEv && <div className="grid gap-4 sm:grid-cols-2">{yn("ud-charger", "EV charger", d.evCharger, (v) => set({ evCharger: v }))}{yn("ud-card", "EV charging card", d.evCard, (v) => set({ evCard: v }))}</div>}
        {txt("ud-note", "Note", "note", 300)}
        {missing.length > 0 && <p className="text-sm text-muted-foreground">Still blank: {missing.join("; ")}. You can approve with these blank; you will be asked to confirm.</p>}
        <Button disabled={busy} onClick={() => start(async () => done(await saveDetailsAction(plate, d)))}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Save the details</Button>
      </CardContent>
    </Card>
  );
}
