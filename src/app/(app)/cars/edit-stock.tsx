"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CarRow } from "@/lib/cars/model";
import { takeOffStockAction, updateStockAction } from "./actions";

type State = "Onhand" | "Reserved" | "Sold" | "Not for sale" | "For repair" | "Sell as is" | "Shipped to Cebu";
const STATES: { key: State; label: string; hint: string }[] = [
  { key: "Onhand", label: "Available", hint: "Ready to sell" },
  { key: "Reserved", label: "Reserved", hint: "Someone has it" },
  { key: "Sold", label: "Sold", hint: "Sold, the car stays listed as sold" },
  { key: "For repair", label: "For repair", hint: "Not ready" },
  { key: "Sell as is", label: "Sell as is", hint: "Can be sold without repair" },
  { key: "Not for sale", label: "Not for sale", hint: "Kept, not offered" },
  { key: "Shipped to Cebu", label: "Shipped to Cebu", hint: "On its way or in Cebu" },
];
const asText = (n: number | null | undefined) => (n === null || n === undefined ? "" : n.toLocaleString("en-PH"));
/** Prices show with commas as they are typed: 458000 becomes 458,000. */
const fmt = (v: string) => { const d = v.replace(/\D/g, ""); return d === "" ? "" : Number(d).toLocaleString("en-PH"); };
const toNum = (v: string): number | null => { const t = v.replace(/[₱,\s]/g, ""); return /^\d+$/.test(t) ? Number(t) : null; };

/** The one place Admin and Approver change a car of the price list. Plain words, one screen; the price history and who changed it are kept. */
export function EditStock({ car, locations, onClose }: { car: CarRow; locations: string[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const raw = car.raw!;
  const [state, setState] = useState<State>((raw.state as State | null) ?? (car.availability === "sold" ? "Sold" : car.availability === "reserved" ? "Reserved" : car.availability === "repair" ? "For repair" : car.availability === "asis" ? "Sell as is" : car.availability === "notforsale" ? "Not for sale" : car.toCebu ? "Shipped to Cebu" : "Onhand"));
  const [f, setF] = useState({
    listPrice: asText(raw.listPrice), reprice: asText(raw.reprice), targetPrice: asText(raw.targetPrice), retarget: asText(raw.retarget), agreedPrice: raw.agreedPrice,
    person: car.reservedFor.join(" "), note: raw.note, location: car.location, tools: raw.tools,
  });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const [sure, setSure] = useState(false);
  const bad = (["listPrice", "reprice", "targetPrice", "retarget"] as const).filter((k) => f[k].trim() !== "" && toNum(f[k]) === null);
  const needsPerson = (state === "Reserved" || state === "Sold") && !f.person.trim();

  const save = () => start(async () => {
    const r = await updateStockAction({ plate: car.plate, listPrice: toNum(f.listPrice), reprice: toNum(f.reprice), targetPrice: toNum(f.targetPrice), retarget: toNum(f.retarget), agreedPrice: f.agreedPrice, state, person: f.person, note: f.note, location: f.location, tools: f.tools });
    if (r.ok) { toast.success(r.message); router.refresh(); onClose(); } else toast.error(r.error);
  });
  const takeOff = () => start(async () => { const r = await takeOffStockAction(car.plate); if (r.ok) { toast.success(r.message); router.refresh(); onClose(); } else toast.error(r.error); });
  const money = (k: "listPrice" | "reprice" | "targetPrice" | "retarget", label: string, hint?: string) => (
    <div className="space-y-1"><Label htmlFor={`e-${k}`}>{label}</Label><Input id={`e-${k}`} inputMode="numeric" value={f[k]} onChange={(e) => set(k, fmt(e.target.value))} placeholder="₱ 458,000" aria-invalid={bad.includes(k)} />{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
  );

  return (
    <div className="space-y-5 text-sm">
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">What is happening with this car</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {STATES.map((s) => (
            <button key={s.key} type="button" aria-pressed={state === s.key} onClick={() => setState(s.key)} className={`rounded-lg border p-2.5 text-left transition ${state === s.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"}`}>
              <span className="block font-medium">{s.label}</span><span className="block text-xs text-muted-foreground">{s.hint}</span>
            </button>
          ))}
        </div>
        {(state === "Reserved" || state === "Sold") && (
          <div className="space-y-1"><Label htmlFor="e-person">For whom? (the salesperson, as in the sheet: DAVID)</Label><Input id="e-person" value={f.person} onChange={(e) => set("person", e.target.value.toUpperCase())} aria-invalid={needsPerson} /></div>
        )}
        {(state === "Reserved" || state === "Sold" || f.agreedPrice.trim() !== "") && (
          <div className="space-y-1"><Label htmlFor="e-agreed">Agreed price</Label><Input id="e-agreed" value={f.agreedPrice} maxLength={60} onChange={(e) => set("agreedPrice", e.target.value)} placeholder="₱ 471,000" /><p className="text-xs text-muted-foreground">The price agreed with the buyer. Type it the way you know it (an amount, or a few words).</p></div>
        )}
        <div className="space-y-1"><Label htmlFor="e-note">Note (optional)</Label><Input id="e-note" value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. 48V battery arrived, installation in progress" /></div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Prices (whole pesos)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {money("listPrice", "Price", "The price we quote")}{money("reprice", "Reprice", "A lower price, if it was repriced")}
          {money("targetPrice", "Target", "The lowest we would take")}{money("retarget", "Re-target", "The new lowest, if repriced")}
        </div>
        {bad.length > 0 && <p className="text-xs text-destructive">Type prices as whole pesos, like 458,000.</p>}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Where and what</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="e-location">Location</Label><Input id="e-location" list="e-locations" value={f.location} onChange={(e) => set("location", e.target.value.toUpperCase())} /><datalist id="e-locations">{locations.map((l) => <option key={l} value={l} />)}</datalist></div>
          <div className="space-y-1"><Label htmlFor="e-tools">Tools</Label><Input id="e-tools" value={f.tools} onChange={(e) => set("tools", e.target.value)} /></div>
        </div>
        <p className="text-xs text-muted-foreground">The car&apos;s details (year, make, model, color, mileage...) are changed with Edit details by an Admin. Its papers and OR date are in Car documents.</p>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending || bad.length > 0 || needsPerson} onClick={save}>{pending && <Loader2 className="animate-spin" />} Save</Button>
        <Button variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
        <span className="ml-auto">
          {sure ? <span className="flex items-center gap-2"><span className="text-xs">Take it off the stock list?</span><Button size="sm" variant="destructive" disabled={pending} onClick={takeOff}>Yes, take it off</Button><Button size="sm" variant="ghost" onClick={() => setSure(false)}>No</Button></span>
            : <Button size="sm" variant="outline" onClick={() => setSure(true)}>Take off the stock list</Button>}
        </span>
      </div>
    </div>
  );
}
