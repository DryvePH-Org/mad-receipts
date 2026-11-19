"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { transferState, type Transfer, type TransferInput } from "@/lib/transfers/model";
import { addTransferAction, saveTransferAction } from "./actions";

const blank: TransferInput = { particular: "", financing: "", buyer: "", address: "", contact: "", crDate: "", transactionDate: "", liaison: "", sales: "", balance: "", note: "", doneOn: "" };
const inputOf = (t: Transfer): TransferInput => ({ particular: t.particular ?? "", financing: t.financing ?? "", buyer: t.buyer ?? "", address: t.address ?? "", contact: t.contact ?? "", crDate: t.crDate ?? "", transactionDate: t.transactionDate ?? "", liaison: t.liaison ?? "", sales: t.sales ?? "", balance: t.balance ?? "", note: t.note ?? "", doneOn: t.doneOn ?? "" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

const FIELDS: { key: keyof TransferInput; label: string; type?: "date"; wide?: boolean }[] = [
  { key: "buyer", label: "Buyer", wide: true }, { key: "address", label: "Address", wide: true }, { key: "contact", label: "Contact number" },
  { key: "particular", label: "What is done (ORCR transfer...)" }, { key: "financing", label: "Encumbrance / financing" }, { key: "crDate", label: "CR date", type: "date" },
  { key: "transactionDate", label: "Transaction date", type: "date" }, { key: "liaison", label: "Liaison" }, { key: "sales", label: "Sales" },
  { key: "balance", label: "Balance" }, { key: "doneOn", label: "Finished on", type: "date" }, { key: "note", label: "Note", wide: true },
];

function Form({ value, onSave, label }: { value: TransferInput; onSave: (v: TransferInput) => Promise<{ ok: true } | { ok: false; error: string }>; label: string }) {
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setMsg(null); start(async () => { const r = await onSave(v); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); if (r.ok && label === "Add") setV(blank); }); }}>
      {FIELDS.map((f) => (
        <div key={f.key} className={`space-y-1.5 ${f.wide ? "sm:col-span-2" : ""}`}>
          <Label htmlFor={`tf-${f.key}`}>{f.label}</Label>
          <Input id={`tf-${f.key}`} type={f.type ?? "text"} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
        </div>
      ))}
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : label === "Add" ? <Plus /> : null}{label === "Add" ? "Add the transfer" : "Save"}</Button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role="status">{msg.text}</span>}
      </div>
    </form>
  );
}

/** The transfers of the OR/CR to the buyers. Each opens to its fields; Documentation, Approver and Admin edit them. */
export function TransferList({ transfers, cars, today, plate, showCar = true }: { transfers: Transfer[]; cars: Record<string, string>; today: string; plate?: string; showCar?: boolean }) {
  return (
    <div className="space-y-4">
      {!transfers.length ? <p className="text-sm text-muted-foreground">No transfer is recorded{plate ? " for this car" : ""} yet.</p> : (
        <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
          {transfers.map((t) => {
            const s = transferState(t, today);
            const car = (t.unitId && cars[t.unitId]) || t.carText;
            return (
              <li key={t.id}>
                <details className="group">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                    {showCar && (t.unitId ? <Link href={`/documents/${t.plate}`} className="font-medium underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>{t.plate}</Link> : <span className="font-medium">{t.plate}</span>)}
                    {showCar && car && <span className="text-muted-foreground">{car}</span>}
                    <span>{t.buyer ?? "No buyer"}</span>
                    {t.particular && <span className="text-muted-foreground">{t.particular}</span>}
                    <span className="ml-auto flex items-center gap-2">
                      {showCar && !t.unitId && <Pill tone="zinc">Not in Car documents yet</Pill>}
                      {s.done ? <Pill tone="emerald">Finished {day(t.doneOn!)}</Pill> : s.days !== null ? <Pill tone={s.days > 60 ? "amber" : "zinc"}>{s.days} days since CR date</Pill> : <Pill tone="zinc">In process</Pill>}
                    </span>
                  </summary>
                  <div className="border-t px-4 py-4"><Form label="Save" value={inputOf(t)} onSave={(v) => saveTransferAction(t.id, v)} /></div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      {plate && (
        <details className="rounded-xl ring-1 ring-foreground/10">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Add a transfer</summary>
          <div className="border-t px-4 py-4"><Form label="Add" value={blank} onSave={(v) => addTransferAction(plate, v)} /></div>
        </details>
      )}
    </div>
  );
}
