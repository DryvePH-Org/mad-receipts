"use client";

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Pill, type Tone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatPeso } from "@/lib/rules/money";
import { isOpen, ROUTE_LABEL, STAGE_LABEL, STAGES, transferState, type Route, type Transfer, type TransferInput, type TransferStage } from "@/lib/transfers/model";
import { addTransferAction, markCheckedAction, saveTransferAction } from "./actions";

const blank: TransferInput = { particular: "", financing: "", buyer: "", address: "", contact: "", crDate: "", transactionDate: "", liaison: "", sales: "", balance: "", note: "", doneOn: "", soldOn: "", agreedPrice: "", route: "unknown", stage: "in_process", originalsAt: "", nextStep: "" };
const inputOf = (t: Transfer): TransferInput => ({
  particular: t.particular ?? "", financing: t.financing ?? "", buyer: t.buyer ?? "", address: t.address ?? "", contact: t.contact ?? "", crDate: t.crDate ?? "", transactionDate: t.transactionDate ?? "",
  liaison: t.liaison ?? "", sales: t.sales ?? "", balance: t.balance ?? "", note: t.note ?? "", doneOn: t.doneOn ?? "", soldOn: t.soldOn ?? "", agreedPrice: t.agreedPrice ? String(t.agreedPrice) : "",
  route: t.route, stage: t.stage, originalsAt: t.originalsAt ?? "", nextStep: t.nextStep ?? "",
});
const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const STAGE_TONE: Record<TransferStage, Tone> = { in_process: "blue", transferred: "amber", released: "purple", delivered: "emerald", unknown: "zinc" };

type TextField = { key: Exclude<keyof TransferInput, "route" | "stage">; label: string; type?: "date"; wide?: boolean };
const FIELDS: TextField[] = [
  { key: "buyer", label: "Buyer", wide: true }, { key: "address", label: "Address", wide: true }, { key: "contact", label: "Contact number" },
  { key: "soldOn", label: "Sold on", type: "date" }, { key: "agreedPrice", label: "Agreed price (₱)" }, { key: "sales", label: "Sales" },
  { key: "liaison", label: "Liaison" }, { key: "originalsAt", label: "Where the original documents are" }, { key: "nextStep", label: "Next step" },
  { key: "particular", label: "What is done (ORCR transfer...)" }, { key: "financing", label: "Financing company / encumbrance" }, { key: "crDate", label: "CR date", type: "date" },
  { key: "transactionDate", label: "Transaction date", type: "date" }, { key: "balance", label: "Balance" }, { key: "doneOn", label: "Finished on", type: "date" }, { key: "note", label: "Note", wide: true },
];

function Form({ value, onSave, label }: { value: TransferInput; onSave: (v: TransferInput) => Promise<{ ok: true } | { ok: false; error: string }>; label: string }) {
  const uid = useId(); // each form has its own ids: the list holds many forms and a label must find its own box
  const [v, setV] = useState(value);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setMsg(null); start(async () => { const r = await onSave(v); setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error }); if (r.ok && label === "Add") setV(blank); }); }}>
      <div className="space-y-1.5"><Label htmlFor={`${uid}-stage`}>Stage</Label>
        <NativeSelect id={`${uid}-stage`} value={v.stage} onChange={(e) => setV({ ...v, stage: e.target.value as TransferStage })}>{STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</NativeSelect></div>
      <div className="space-y-1.5"><Label htmlFor={`${uid}-route`}>Who does the transfer</Label>
        <NativeSelect id={`${uid}-route`} value={v.route} onChange={(e) => setV({ ...v, route: e.target.value as Route })}>{(Object.keys(ROUTE_LABEL) as Route[]).map((r) => <option key={r} value={r}>{ROUTE_LABEL[r]}</option>)}</NativeSelect></div>
      {FIELDS.map((f) => (
        <div key={f.key} className={`space-y-1.5 ${f.wide ? "sm:col-span-2" : ""}`}>
          <Label htmlFor={`${uid}-${f.key}`}>{f.label}</Label>
          <Input id={`${uid}-${f.key}`} type={f.type ?? "text"} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
        </div>
      ))}
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : label === "Add" ? <Plus /> : null}{label === "Add" ? "Add the transfer" : "Save"}</Button>
        {msg && <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`} role="status">{msg.text}</span>}
      </div>
    </form>
  );
}

type Filter = "open" | "all" | TransferStage | "check" | "reference";
const FILTER_LABEL: [Filter, string][] = [["open", "Not delivered"], ["in_process", "In process"], ["transferred", "Transferred"], ["released", "Released"], ["delivered", "Delivered"], ["check", "To check"], ["reference", "Old list (reference)"], ["all", "All"]];

/** The sales and their transfers. Each opens to its fields; Documentation, Approver and Admin edit them. On the car's own page (`plate`) it is just that car's records. */
export function TransferList({ transfers, cars, today, plate, showCar = true }: { transfers: Transfer[]; cars: Record<string, string>; today: string; plate?: string; showCar?: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [checking, startCheck] = useTransition();
  const count = (f: Filter) => transfers.filter((t) => matches(t, f)).length;
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (plate ? transfers : transfers.filter((t) => matches(t, filter))).filter((t) => !words.length || words.every((w) => `${t.plate} ${t.carText ?? ""} ${t.buyer ?? ""} ${t.sales ?? ""} ${t.liaison ?? ""} ${t.financing ?? ""} ${t.plateOriginal ?? ""}`.toLowerCase().includes(w)));
  }, [transfers, filter, q, plate]);
  return (
    <div className="space-y-4">
      {!plate && (
        <div className="space-y-3">
          <div className="relative max-w-sm"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plate, buyer, sales, liaison" aria-label="Search transfers" className="pl-8" /></div>
          <div role="tablist" aria-label="Show" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {FILTER_LABEL.map(([f, label]) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`shrink-0 rounded-full border px-3 py-1 text-sm ${filter === f ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{label} <span className="opacity-70">{count(f)}</span></button>
            ))}
          </div>
        </div>
      )}
      {!shown.length ? <p className="text-sm text-muted-foreground">{plate ? "No transfer is recorded for this car yet." : "Nothing here. Try another word or another list."}</p> : (
        <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
          {shown.map((t) => {
            const s = transferState(t, today);
            const car = (t.unitId && cars[t.unitId]) || t.carText;
            return (
              <li key={t.id}>
                <details className="group">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                    {showCar && (t.unitId ? <Link href={`/documents/${t.plate}`} className="font-medium underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>{t.plate}</Link> : <span className="font-medium">{t.plate}</span>)}
                    {showCar && car && <span className="min-w-0 text-muted-foreground">{car}</span>}
                    <span className="min-w-0">{t.buyer ?? "No buyer"}</span>
                    <span className="text-xs text-muted-foreground">{[t.soldOn && `sold ${day(t.soldOn)}`, t.agreedPrice && formatPeso(Math.round(t.agreedPrice * 100)), t.originalsAt].filter(Boolean).join(" · ")}</span>
                    <span className="ml-auto flex flex-wrap items-center gap-2">
                      {t.flags.length > 0 && <Pill tone="amber">{t.flags.length} to check</Pill>}
                      {showCar && !t.unitId && <Pill tone="zinc">Not in Car documents yet</Pill>}
                      {t.isReference && <Pill tone="zinc">Old list</Pill>}
                      <Pill tone={STAGE_TONE[t.stage]}>{STAGE_LABEL[t.stage]}</Pill>
                      {!s.done && s.days !== null && <Pill tone={s.days > 60 ? "amber" : "zinc"}>{s.days} days since CR date</Pill>}
                      {t.doneOn && <Pill tone="emerald">Finished {day(t.doneOn)}</Pill>}
                    </span>
                  </summary>
                  <div className="space-y-4 border-t px-4 py-4">
                    {t.flags.length > 0 && (
                      <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
                        <p className="flex items-center gap-2 font-medium"><CircleAlert className="size-4" aria-hidden /> To check</p>
                        <ul className="list-disc space-y-0.5 pl-5">{t.flags.map((f) => <li key={f}>{f}</li>)}</ul>
                        <Button size="sm" variant="outline" disabled={checking} onClick={() => startCheck(async () => { const r = await markCheckedAction(t.id); if (r.ok) toast.success("Marked as checked."); else toast.error(r.error); router.refresh(); })}>Checked, it is fine</Button>
                      </div>
                    )}
                    {(t.plateOriginal || t.chassisNo || t.engineNo || !t.unitId) && (
                      <p className="text-xs text-muted-foreground">
                        {t.plateOriginal && <>The sheet had the plate as <b>{t.plateOriginal}</b>: it was corrected to match the car. </>}
                        {t.chassisNo && <>Chassis {t.chassisNo}. </>}{t.engineNo && <>Engine {t.engineNo}. </>}
                        {!t.unitId && <>This car has no record in Car documents. <Link href="/documents/add" className="underline underline-offset-2">Add it</Link> if you need its papers; the record then links itself by plate.</>}
                      </p>
                    )}
                    <Form label="Save" value={inputOf(t)} onSave={(v) => saveTransferAction(t.id, v)} />
                  </div>
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

function matches(t: Transfer, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "reference") return t.isReference;
  if (f === "check") return t.flags.length > 0;
  if (f === "open") return isOpen(t);
  return !t.isReference && t.stage === f;
}
