"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Loader2, Receipt as ReceiptIcon, Send } from "lucide-react";
import { toast } from "sonner";
import { LAYOUTS, ReceiptPaper, type PaperLayout } from "@/components/receipt/receipt-paper";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import type { AppSettings } from "@/lib/deal/settings";
import { missingFields, warningsFor } from "@/lib/deal/validate";
import type { FormState } from "@/lib/deal/types";
import { formatPeso } from "@/lib/rules/money";
import { cn } from "@/lib/utils";
import { submitReceipt, type SubmitResult } from "./actions";
import { emptyFin, emptyForm, prettyMoney, resolveFinance, workOut, type FinUi } from "./form-state";
import type { InvUnit } from "./inventory-picker";
import { StepBuyer, StepDeal, StepFinish, StepPayment, StepVehicles, type Ctx } from "./steps";

export interface LiveDeal { id: string; dealNo: string; buyerName: string; plateNos: string[]; receiptCount: number; committed: number; balance: number }
export interface ContinueDeal { id: string; dealNo: string; buyerName: string; committed: number; receiptCount: number; terms: Partial<FormState> }

const STEPS = [["Buyer", "Who is paying"], ["Vehicle", "What they buy"], ["Deal", "Price, loan, trade-in"], ["Payment", "Money received"], ["Finish", "Check the math"]] as const;
const norm = (p: string) => p.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

function initial(settings: AppSettings, today: string, cont: ContinueDeal | null): { form: FormState; fin: FinUi } {
  const base = emptyForm(settings, today);
  if (!cont) return { form: base, fin: emptyFin() };
  const t = cont.terms;
  const form: FormState = {
    ...base, ...t, receiptNo: "", date: today, kind: "partial", earlier: String(cont.committed / 100), cash: "", cashProofs: [], methods: [], payout: "", payoutProofs: [],
    units: t.units?.length ? t.units : base.units, ti: { ...base.ti, ...t.ti }, notes: t.notes?.length ? t.notes : base.notes,
  };
  return { form, fin: { ...emptyFin(), dpIn: prettyMoney(form.dp), feeMode: "amount", feeIn: prettyMoney(form.fee), feeTouched: true } };
}

export function ReceiptForm({ userId, today, settings, inventory, liveDeals, continueDeal }: { userId: string; today: string; settings: AppSettings; inventory: InvUnit[]; liveDeals: LiveDeal[]; continueDeal: ContinueDeal | null }) {
  const router = useRouter();
  const init = useMemo(() => initial(settings, today, continueDeal), [settings, today, continueDeal]);
  const [form, setForm] = useState(init.form);
  const [fin, setFin] = useState(init.fin);
  const [step, setStep] = useState(continueDeal ? 4 : 1);
  const [visited, setVisited] = useState<Set<number>>(new Set(continueDeal ? [1, 2, 3, 4] : [1]));
  const [confirmed, setConfirmed] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Extract<SubmitResult, { ok: true }> | null>(null);
  const [layout, setLayout] = useState<PaperLayout>("form");
  const linked = continueDeal?.id ?? null;

  const resolved = resolveFinance(form.price, fin);
  const s: FormState = useMemo(() => ({ ...form, dp: form.sale === "financing" ? resolved.dp : "", fee: form.sale === "financing" ? resolved.fee : "" }), [form, resolved.dp, resolved.fee]);
  const { t, ledger, sources } = useMemo(() => workOut(s), [s]);
  const dup = !linked ? liveDeals.find((d) => s.units.some((u) => norm(u.plate) && d.plateNos.includes(norm(u.plate)))) : undefined;
  const missing = useMemo(() => missingFields(s, t, settings, { continuing: !!linked, duplicateDeal: dup?.dealNo }), [s, t, settings, linked, dup]);
  const warnings = useMemo(() => warningsFor(s, t, settings), [s, t, settings]);

  const set = (p: Partial<FormState>) => { setForm((f) => ({ ...f, ...p })); setConfirmed(false); };
  function show(n: number) { setStep(n); setVisited((v) => new Set([...v, ...Array.from({ length: n }, (_, i) => i + 1)])); window.scrollTo({ top: 0 }); }
  function go(target: string, to: number) {
    show(to);
    setTimeout(() => { const el = document.getElementById(target); if (el) { el.scrollIntoView({ block: "center" }); el.focus({ preventScroll: true }); } }, 80);
  }
  const ctx: Ctx = { s, t, ledger, sources, set, fin, setFin: (f) => { setFin(f); setConfirmed(false); }, settings, userId, inventory, missing, warnings, linked: !!linked, go, dpResolved: { dpC: resolved.dpC } };

  function send() {
    start(async () => {
      const r = await submitReceipt(s, linked);
      if (r.ok) { setResult(r); router.refresh(); }
      else toast.error(r.missing?.length ? `${r.error} ${r.missing.slice(0, 3).join(", ")}` : r.error);
    });
  }

  // The live preview: real paper size, shrunk to fit the column.
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const natural = { form: 794, half: 559, slip: 302 }[layout];
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const measure = () => setScale(Math.min(1, (el.clientWidth - 24) / natural));
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [natural]);

  const stepMissing = (n: number) => missing.filter((m) => m.step === n).length;
  const body = [<StepBuyer key={1} ctx={ctx} />, <StepVehicles key={2} ctx={ctx} />, <StepDeal key={3} ctx={ctx} />, <StepPayment key={4} ctx={ctx} />, <StepFinish key={5} ctx={ctx} confirmed={confirmed} onConfirm={setConfirmed} />][step - 1];
  const canSend = missing.length === 0 && confirmed && !pending;
  const balanceText = t.balance < 0 ? `− ${formatPeso(-t.balance)}` : formatPeso(t.balance);

  return (
    <div className="space-y-5">
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Steps">
        {STEPS.map(([name, hint], i) => {
          const n = i + 1, done = visited.has(n) && n !== step && n < 5 && stepMissing(n) === 0, active = n === step;
          return (
            <li key={name}><button type="button" onClick={() => show(n)} aria-current={active ? "step" : undefined}
              className={cn("flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold", active ? "bg-primary-foreground/20" : done ? "bg-emerald-100 text-emerald-800" : "bg-muted")}>{done ? <Check className="size-3.5" /> : n}</span>
              <span className="min-w-0 text-sm font-medium">{name}<small className={cn("block truncate text-xs font-normal", active ? "text-primary-foreground/70" : "text-muted-foreground")}>{hint}</small></span></button></li>
          );
        })}
      </ol>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        <div className="min-w-0 space-y-5">
          {(linked || dup) && (
            <div id="deal-banner" tabIndex={-1} className="flex flex-wrap items-center gap-3 rounded-xl bg-blue-50 p-3.5 text-sm text-blue-950 dark:bg-blue-500/10 dark:text-blue-100">
              <ReceiptIcon className="size-5 shrink-0" aria-hidden />
              {linked && continueDeal ? <span><b>Continuing deal {continueDeal.dealNo}</b> · {continueDeal.buyerName}. It has <b>{continueDeal.receiptCount} {continueDeal.receiptCount === 1 ? "receipt" : "receipts"}</b> so far, {formatPeso(continueDeal.committed)} in receipts. This will be <b>receipt {continueDeal.receiptCount + 1}</b>. The buyer, car and terms are copied from the deal.</span>
                : dup && <span><b>This car already has an open deal</b> · {dup.buyerName}. It has <b>{dup.receiptCount} {dup.receiptCount === 1 ? "receipt" : "receipts"}</b> so far, {formatPeso(dup.committed)} in receipts. This would be <b>receipt {dup.receiptCount + 1}</b>.</span>}
              {dup && !linked && <Button className="ml-auto" size="sm" variant="outline" nativeButton={false} render={<Link href={`/new?deal=${dup.id}`} />}>Continue this deal</Button>}
            </div>
          )}
          {body}
        </div>

        <aside className="space-y-3 xl:sticky xl:top-6">
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <div className="flex items-center justify-between gap-2 px-4 py-3"><b className="text-sm font-medium">Live preview</b>
              <div role="radiogroup" aria-label="Layout" className="inline-flex rounded-lg bg-muted p-0.5">{LAYOUTS.map((l) => <button key={l.id} type="button" role="radio" aria-checked={layout === l.id} onClick={() => setLayout(l.id)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", layout === l.id ? "bg-background shadow-sm" : "text-muted-foreground")}>{l.id === "form" ? "Form" : l.id === "half" ? "Half" : "Slip"}</button>)}</div></div>
            <div ref={wrap} className="relative h-[34rem] overflow-hidden bg-neutral-200 dark:bg-neutral-800">
              <div className="absolute top-3 left-0 origin-top-left" style={{ transform: `scale(${scale})`, left: `calc(50% - ${(natural * scale) / 2}px)` }}>
                <ReceiptPaper state={s} company={settings.company} layout={layout} copy={settings.copyNames[0] ?? "Customer's copy"} unapproved />
              </div>
            </div>
            <p className="px-4 py-2.5 text-xs text-muted-foreground">This is how the receipt prints. It updates as you type.</p>
          </div>
        </aside>
      </div>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-xl bg-background/95 p-3 shadow-lg ring-1 ring-foreground/15 backdrop-blur lg:bottom-4">
        <Button variant="outline" size="lg" onClick={() => show(step - 1)} disabled={step === 1}><ChevronLeft /> Back</Button>
        <div className="mr-auto flex gap-6 text-sm">
          {step >= 3 && <div><small className="block text-[11px] tracking-wide text-muted-foreground uppercase">{step === 3 ? "Agreed price" : "Paid today"}</small><b className="tabular-nums">{formatPeso(step === 3 ? t.price : t.today)}</b></div>}
          {step >= 3 && <div><small className="block text-[11px] tracking-wide text-muted-foreground uppercase">{step === 3 ? (t.due < 0 ? "We pay the buyer" : "Buyer pays us") : "Balance"}</small><b className="tabular-nums">{step === 3 ? formatPeso(Math.abs(t.due)) : balanceText}</b></div>}
          {step < 3 && <span className="self-center text-muted-foreground">Step {step} of 5</span>}
        </div>
        {step < 5 ? <Button size="lg" onClick={() => show(step + 1)}>Next: {STEPS[step][0]} <ChevronRight /></Button>
          : <Button size="lg" disabled={!canSend} onClick={send} title={missing.length ? "Fill in the missing fields first" : !confirmed ? "Tick the box to confirm you checked everything" : undefined}>{pending ? <Loader2 className="animate-spin" /> : <Send />} Send for approval</Button>}
      </div>

      <ResponsiveDialog open={!!result} onOpenChange={() => undefined} title="Sent for approval" description={result ? `Receipt ${result.receiptNo} · ${formatPeso(t.today)} from ${s.receivedFrom} · deal ${result.dealNo}. The Approver will check it next.` : undefined}>
        {result && (
          <div className="space-y-4">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900"><span>Receipt saved</span><b>✓ Done</b></li>
              <li className="flex justify-between rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900"><span>Sent to the Approver</span><b>✓ Done</b></li>
              <li className="flex justify-between rounded-lg bg-muted px-3 py-2 text-muted-foreground"><span>Drive, Sheets, inventory sheet and Telegram</span><b>After approval</b></li>
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" nativeButton={false} render={<a href={`/print/${result.receiptId}`} target="_blank" rel="noreferrer" />}>Print copies (unapproved)</Button>
              <Button variant="outline" nativeButton={false} render={<Link href={`/deals/${result.dealId}`} />}>Open the deal</Button>
              <Button nativeButton={false} render={<a href="/new" />}>New receipt</Button>
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </div>
  );
}
