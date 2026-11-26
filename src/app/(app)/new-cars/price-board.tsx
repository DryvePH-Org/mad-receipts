"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AwaitingCar } from "@/lib/cars/read";
import { setFirstPriceAction } from "./actions";

/** Prices show with commas as they are typed: 458000 becomes 458,000. */
const fmt = (v: string) => { const d = v.replace(/\D/g, ""); return d === "" ? "" : Number(d).toLocaleString("en-PH"); };
const toNum = (v: string): number | null => { const t = v.replace(/[₱,\s]/g, ""); return /^\d+$/.test(t) && Number(t) > 0 ? Number(t) : null; };

export function PriceBoard({ cars }: { cars: AwaitingCar[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{cars.length} {cars.length === 1 ? "car is" : "cars are"} waiting for a price.</p>
      <ul className="space-y-3">{cars.map((c) => <li key={c.plate}><Row car={c} /></li>)}</ul>
    </div>
  );
}

function Row({ car }: { car: AwaitingCar }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [price, setPrice] = useState("");
  const [target, setTarget] = useState("");
  const name = [car.year, car.make, car.model].filter(Boolean).join(" ");
  const tooHigh = toNum(price) !== null && toNum(target) !== null && toNum(target)! > toNum(price)!;
  const ready = toNum(price) !== null && (target.trim() === "" || toNum(target) !== null) && !tooHigh;
  const save = () => start(async () => {
    const r = await setFirstPriceAction({ plate: car.plate, listPrice: toNum(price) ?? 0, targetPrice: toNum(target) });
    if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.error);
  });
  return (
    <div className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <p className="font-semibold tracking-wide">{car.plateDisplay}</p>
        <p className="truncate text-sm">{name || "Details not filled in yet"}</p>
        <p className="text-xs text-muted-foreground">{[car.color, car.mileage, car.arrived && `arrived ${car.arrived}`].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="space-y-1 sm:w-40"><Label htmlFor={`p-${car.plate}`}>Price</Label><Input id={`p-${car.plate}`} inputMode="numeric" value={price} onChange={(e) => setPrice(fmt(e.target.value))} placeholder="₱ 458,000" /></div>
      <div className="space-y-1 sm:w-40"><Label htmlFor={`t-${car.plate}`}>Target (lowest, optional)</Label><Input id={`t-${car.plate}`} inputMode="numeric" value={target} onChange={(e) => setTarget(fmt(e.target.value))} placeholder="₱ 450,000" aria-invalid={tooHigh} /></div>
      <Button onClick={save} disabled={!ready || pending}>{pending && <Loader2 className="animate-spin" />} Set price</Button>
    </div>
  );
}
