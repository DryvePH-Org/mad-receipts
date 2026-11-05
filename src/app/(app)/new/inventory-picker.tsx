"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export interface InvUnit { plate: string; makeType?: string; color?: string; motor?: string; chassis?: string; status: "Available" | "Reserved" | "Sold" }

/** The inventory sheet's cars, grouped by make and type. Pick a group, then the plate. */
export function InventoryPicker({ open, onOpenChange, units, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; units: InvUnit[]; onPick: (makeType: string, onlyUnit: InvUnit | null) => void }) {
  const [q, setQ] = useState("");
  const [make, setMake] = useState("");
  const [availableOnly, setAvailableOnly] = useState(true);
  const makeOf = (m: string) => m.split(" ").find((w) => /^[A-Za-z]/.test(w)) ?? "";
  const makes = useMemo(() => [...new Set(units.map((u) => makeOf(u.makeType ?? "")).filter(Boolean))].sort(), [units]);
  const groups = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const map = new Map<string, InvUnit[]>();
    for (const u of units) {
      if (!u.makeType) continue;
      if (availableOnly && u.status !== "Available") continue;
      if (make && makeOf(u.makeType) !== make) continue;
      const hay = `${u.makeType} ${u.plate} ${u.color ?? ""}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      map.set(u.makeType, [...(map.get(u.makeType) ?? []), u]);
    }
    return [...map];
  }, [units, q, make, availableOnly]);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Search the inventory" description="Pick the make and type, then choose the plate.">
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
          <div className="relative"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Make, model, plate or color" className="pl-8" aria-label="Search the inventory" /></div>
          <NativeSelect value={make} onChange={(e) => setMake(e.target.value)} aria-label="Make"><option value="">All makes</option>{makes.map((m) => <option key={m}>{m}</option>)}</NativeSelect>
        </div>
        <div className="flex gap-1.5">{[true, false].map((v) => <Button key={String(v)} size="sm" variant={availableOnly === v ? "default" : "outline"} className="rounded-full" onClick={() => setAvailableOnly(v)}>{v ? "Available" : "All"}</Button>)}</div>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {groups.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{units.length === 0 ? "The inventory sheet could not be read. Type the car yourself." : "Nothing matches. Try another word, or type the car yourself."}</p> : groups.map(([name, list]) => {
            const available = list.filter((u) => u.status === "Available").length;
            return (
              <button key={name} type="button" className="flex w-full items-center gap-3 rounded-lg border p-3 text-left hover:border-ring hover:bg-muted" onClick={() => { onPick(name, q.trim() && list.length === 1 ? list[0] : null); onOpenChange(false); }}>
                <span className="min-w-0 flex-1"><b className="block font-medium">{name}</b><span className="block truncate text-xs text-muted-foreground">{list.slice(0, 4).map((u) => `${u.plate} ${u.color ?? ""}`.trim()).join(" · ")}{list.length > 4 ? ` · +${list.length - 4} more` : ""}</span></span>
                <span className="text-right text-xs text-muted-foreground"><strong className={cn("block text-base", available ? "text-emerald-700" : "")}>{available}</strong>in stock</span>
              </button>
            );
          })}
        </div>
      </div>
    </ResponsiveDialog>
  );
}
