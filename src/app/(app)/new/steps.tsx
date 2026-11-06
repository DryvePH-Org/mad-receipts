"use client";

import { useState } from "react";
import { Banknote, Bold, CircleCheck, CircleDollarSign, Coins, HandCoins, Landmark, List, Minus, Pencil, Plus, Search, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { LedgerView, SourcesView } from "@/components/deal/ledger-view";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { words } from "@/lib/deal/math";
import type { Ledger, Totals } from "@/lib/deal/math";
import type { AppSettings } from "@/lib/deal/settings";
import { unitFieldId, type Missing, type Warning } from "@/lib/deal/validate";
import { KIND_LABELS, type FormState, type MethodRow, type PaymentKind, type UnitInput } from "@/lib/deal/types";
import { formatDate } from "@/lib/dates";
import { formatPeso, toCentavos } from "@/lib/rules/money";
import { cn } from "@/lib/utils";
import { brandOf, emptyMethod, emptyUnit, prettyPhone, switchDpMode, switchFeeMode, type DpMode, type FeeMode, type FinUi } from "./form-state";
import { Chip, PickCards, Seg, Switch } from "./form-parts";
import { InventoryPicker, type InvUnit } from "./inventory-picker";
import { MoneyInput } from "./money-input";
import { ProofBox } from "./proof-box";

export interface Ctx {
  s: FormState; t: Totals; ledger: Ledger; sources: { rows: { label: string; note: string; amount: number }[]; total: number; proves: boolean };
  set: (p: Partial<FormState>) => void; fin: FinUi; setFin: (f: FinUi) => void; settings: AppSettings; userId: string; inventory: InvUnit[];
  missing: Missing[]; warnings: Warning[]; linked: boolean; go: (target: string, step: number) => void; dpResolved: { dpC: number };
  /** earnest money: no earlier payments, shown as 0 until the user unlocks it */
  earlierLocked: boolean; unlockEarlier: () => void;
  /** full payment: cash is exactly what is left, until the user unlocks it */
  cashAuto: boolean; unlockCash: () => void;
}

const bad = (ctx: Ctx, id: string) => ctx.missing.some((m) => m.target === id);
const Warn = ({ list }: { list: string[] }) => (<>{list.map((w) => <p key={w} className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{w}</p>)}</>);
const Title = ({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) => (
  <CardHeader><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted">{icon}</span><div><CardTitle>{title}</CardTitle><p className="text-sm text-muted-foreground">{desc}</p></div></div></CardHeader>
);

// ======================= 1. Buyer =======================
export function StepBuyer({ ctx }: { ctx: Ctx }) {
  const { s, set } = ctx;
  const digits = s.contact.replace(/\D/g, "");
  return (
    <Card><Title icon={<ShieldCheck className="size-4" />} title="Who is paying" desc="The buyer and how to reach them" />
      <CardContent className="grid gap-4 sm:grid-cols-6">
        <div className="sm:col-span-2"><FormField id="receiptNo" label="Receipt No." hint="The red number on the booklet." error={bad(ctx, "receiptNo") ? "Required" : undefined}><Input id="receiptNo" className="font-mono" inputMode="numeric" value={s.receiptNo} onChange={(e) => set({ receiptNo: e.target.value })} placeholder="2541" /></FormField></div>
        <div className="sm:col-span-2"><FormField id="date" label="Date"><Input id="date" type="date" value={s.date} onChange={(e) => set({ date: e.target.value })} /></FormField></div>
        <div className="sm:col-span-4"><FormField id="receivedFrom" label="Received from" error={bad(ctx, "receivedFrom") ? "Required" : undefined}><Input id="receivedFrom" value={s.receivedFrom} onChange={(e) => set({ receivedFrom: e.target.value })} placeholder="Full name of the buyer" autoComplete="off" disabled={ctx.linked} /></FormField></div>
        <div className="sm:col-span-2"><FormField id="contact" label="Contact no." hint={!digits ? "11 digits, starting with 09" : digits.length !== 11 ? `${digits.length} of 11 digits` : !digits.startsWith("09") ? "Mobile numbers start with 09" : "11 digits ✓"}><Input id="contact" className="font-mono" inputMode="tel" value={s.contact} aria-invalid={bad(ctx, "contact")} onChange={(e) => set({ contact: e.target.value.replace(/[^\d\s]/g, "") })} onBlur={(e) => set({ contact: prettyPhone(e.target.value) })} placeholder="0917 123 4567" /></FormField></div>
        <div className="sm:col-span-6"><FormField id="address" label="Postal address" error={bad(ctx, "address") ? "Required" : undefined}><Input id="address" value={s.address} onChange={(e) => set({ address: e.target.value })} placeholder="Street, barangay, city" /></FormField></div>
      </CardContent></Card>
  );
}

// ======================= 2. Vehicles =======================
function UnitCard({ ctx, i }: { ctx: Ctx; i: number }) {
  const { s, set, settings, inventory } = ctx;
  const u = s.units[i], n = s.units.length;
  const [picker, setPicker] = useState(false);
  const [manual, setManual] = useState(inventory.length === 0);
  const [typedPlate, setTypedPlate] = useState(false);
  const [otherColor, setOtherColor] = useState(false);
  const update = (p: Partial<UnitInput>) => set({ units: s.units.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const usedElsewhere = new Set(s.units.filter((_, j) => j !== i).map((x) => x.plate.replace(/[^A-Za-z0-9]/g, "").toUpperCase()));
  const same = inventory.filter((x) => x.makeType === u.makeType);
  const brand = brandOf(settings.colors.brands, u.makeType), brandColors = brand ? settings.colors.brands[brand] : [];
  // a common color the brand already lists under its own name is shown once, with the brand's colors
  const commonColors = settings.colors.common.filter(([c]) => !brandColors.some(([b]) => b.toLowerCase() === c.toLowerCase()));
  const allColors = [...brandColors, ...commonColors];
  const customColor = u.color !== "" && !allColors.some(([c]) => c === u.color);
  const showOther = otherColor || customColor;
  const chip = ([c, hex]: [string, string]) => <Chip key={c} selected={u.color === c} dot={hex} onClick={() => { update({ color: u.color === c ? "" : c }); setOtherColor(false); }}>{c}</Chip>;
  const plateOk = !u.plate || /^[A-Z]{3}\s?\d{3,4}$/.test(u.plate.toUpperCase());
  const chassisLen = u.chassis.replace(/\s/g, "").length;

  function pick(makeType: string, only: InvUnit | null) {
    const group = inventory.filter((x) => x.makeType === makeType && x.status === "Available");
    const unit = only ?? (group.length === 1 ? group[0] : null);
    setManual(false); setTypedPlate(false);
    update(unit ? { makeType, plate: unit.plate, color: unit.color ?? "", ...(unit.motor ? { motor: unit.motor.toUpperCase() } : {}), ...(unit.chassis ? { chassis: unit.chassis.toUpperCase() } : {}) } : { makeType, plate: u.makeType === makeType ? u.plate : "", color: u.makeType === makeType ? u.color : "" });
  }

  return (
    <Card>
      <CardHeader><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-muted"><Search className="size-4" /></span><div><CardTitle>{n > 1 ? `Unit ${i + 1} of ${n}` : "Vehicle"}</CardTitle><p className="text-sm text-muted-foreground">Description of the car</p></div>
        <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => setPicker(true)}><Search /> Search inventory</Button></div></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-6">
        <div className="sm:col-span-4"><FormField id={unitFieldId(i, "makeType")} label="Make / type" error={bad(ctx, unitFieldId(i, "makeType")) ? "Required" : undefined}
          hint={manual ? undefined : u.makeType ? `${same.filter((x) => x.status === "Available").length} in stock` : undefined}>
          <Input id={unitFieldId(i, "makeType")} value={u.makeType} readOnly={!manual} onClick={() => !manual && setPicker(true)} onKeyDown={(e) => { if (!manual && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setPicker(true); } }}
            onChange={(e) => update({ makeType: e.target.value })} placeholder={manual ? "Type the make and model" : "Tap to search the inventory"} className={cn(!manual && "cursor-pointer bg-muted font-medium")} autoComplete="off" />
          <button type="button" className="mt-1.5 text-xs underline" onClick={() => (manual ? setPicker(true) : setManual(true))}>{manual ? "Pick from the inventory instead" : "Not in the inventory? Type it yourself"}</button></FormField></div>
        <div className="sm:col-span-2"><FormField id={unitFieldId(i, "plate")} label="Plate number" error={bad(ctx, unitFieldId(i, "plate")) ? "Required" : undefined} hint={manual || typedPlate ? (plateOk ? "Letters and numbers" : "Check the format, e.g. ABC 1234") : "Only plates of this make and type"}>
          {!manual && !typedPlate ? (
            <NativeSelect id={unitFieldId(i, "plate")} value={u.plate} disabled={!u.makeType} onChange={(e) => { if (e.target.value === "__type") { setTypedPlate(true); update({ plate: "" }); } else { const x = same.find((y) => y.plate === e.target.value); update({ plate: e.target.value, color: x?.color || u.color, ...(x?.motor ? { motor: x.motor.toUpperCase() } : {}), ...(x?.chassis ? { chassis: x.chassis.toUpperCase() } : {}) }); } }}>
              <option value="">{u.makeType ? "Choose the plate…" : "Pick the make / type first"}</option>
              {same.map((x) => <option key={x.plate} value={x.plate} disabled={(x.status !== "Available" || usedElsewhere.has(x.plate.replace(/[^A-Za-z0-9]/g, ""))) && x.plate !== u.plate}>{x.plate}{x.color ? ` · ${x.color}` : ""}{x.status !== "Available" ? ` · ${x.status}` : ""}</option>)}
              {u.plate && !same.some((x) => x.plate === u.plate) && <option value={u.plate}>{u.plate}</option>}
              {u.makeType && <option value="__type">Not listed, type it…</option>}
            </NativeSelect>
          ) : <Input id={unitFieldId(i, "plate")} className="font-mono uppercase" value={u.plate} onChange={(e) => update({ plate: e.target.value.toUpperCase() })} placeholder="ABC 1234" />}</FormField></div>
        <div className="sm:col-span-3"><FormField id={unitFieldId(i, "motor")} label="Motor number" hint={u.motor ? `${u.motor.replace(/\s/g, "").length} characters` : undefined} error={bad(ctx, unitFieldId(i, "motor")) ? "Required" : undefined}><Input id={unitFieldId(i, "motor")} className="font-mono uppercase" value={u.motor} onChange={(e) => update({ motor: e.target.value.toUpperCase() })} /></FormField></div>
        <div className="sm:col-span-3"><FormField id={unitFieldId(i, "chassis")} label="Chassis number" hint={!chassisLen ? undefined : chassisLen === 17 ? "17 of 17 characters ✓" : `${chassisLen} characters · most chassis numbers have 17`} error={bad(ctx, unitFieldId(i, "chassis")) ? "Required" : undefined}><Input id={unitFieldId(i, "chassis")} className="font-mono uppercase" value={u.chassis} onChange={(e) => update({ chassis: e.target.value.toUpperCase() })} /></FormField></div>
        <div className="space-y-2 sm:col-span-6" id={unitFieldId(i, "color")} tabIndex={-1}>
          <Label>Color{bad(ctx, unitFieldId(i, "color")) && <span className="ml-2 text-xs font-normal text-destructive">Required</span>}</Label>
          {brandColors.length > 0 && <><p className="text-xs text-muted-foreground">{brand} factory colors</p><div className="flex flex-wrap gap-1.5">{brandColors.map(chip)}</div></>}
          <p className="text-xs text-muted-foreground">{brandColors.length ? "Other common car colors" : "Common car colors"}</p>
          <div className="flex flex-wrap gap-1.5">{commonColors.map(chip)}<Chip dashed selected={showOther} onClick={() => setOtherColor(!otherColor)}><Pencil className="size-3.5" />Other, type your own</Chip></div>
          {showOther && <Input aria-label="Color name" className="max-w-sm" value={customColor ? u.color : ""} onChange={(e) => update({ color: e.target.value })} placeholder="Type the color name" />}
          <p className="text-xs text-muted-foreground">{brand ? `Names are the ones ${brand} uses. If the car papers say something else, choose Other and type it.` : "Pick the make and type to see that brand's factory color names."}</p>
        </div>
      </CardContent>
      <InventoryPicker open={picker} onOpenChange={setPicker} units={inventory} onPick={pick} />
    </Card>
  );
}

export function StepVehicles({ ctx }: { ctx: Ctx }) {
  const { s, set } = ctx, n = s.units.length;
  return (
    <>
      <Card><Title icon={<Coins className="size-4" />} title="How many units" desc="Each unit gets its own description card" />
        <CardContent className="flex items-center gap-3">
          <Button type="button" size="icon" variant="outline" aria-label="Fewer units" disabled={n <= 1} onClick={() => set({ units: s.units.slice(0, n - 1) })}><Minus /></Button>
          <b className="w-8 text-center text-lg" aria-live="polite">{n}</b>
          <Button type="button" size="icon" variant="outline" aria-label="More units" disabled={n >= 10} onClick={() => set({ units: [...s.units, emptyUnit()] })}><Plus /></Button>
          <p className="text-sm text-muted-foreground">Make and type come from the inventory. Pick the make and type first, then choose the plate from the cars of that type.</p>
        </CardContent></Card>
      {s.units.map((_, i) => <UnitCard key={i} ctx={ctx} i={i} />)}
    </>
  );
}

// ======================= 3. Deal =======================
export function StepDeal({ ctx }: { ctx: Ctx }) {
  const { s, t, set, fin, setFin, settings } = ctx;
  const [instOther, setInstOther] = useState(false);
  const inList = settings.institutions.includes(s.institution);
  const pc = (c: number, of: number) => (of ? Math.round((c / of) * 1000) / 10 : 0);
  const feePct = fin.feeMode === "percent" ? parseFloat(fin.feeIn.replace(/,/g, "")) || 0 : t.loan ? Math.round((t.fee / t.loan) * 10000) / 100 : 0;
  const feeVal = parseFloat(fin.feeIn.replace(/,/g, "")) || 0;
  const feeChoice: "std" | "none" | "other" = fin.feeOther ? "other" : feeVal === 0 ? "none" : fin.feeMode === "percent" && String(feeVal) === settings.feeStd ? "std" : "other";
  const dpIn = fin.dpMode === "percent" ? "%" : "₱";
  return (
    <>
      <Card><Title icon={<Banknote className="size-4" />} title="Agreed price" desc={`The full price of the unit${s.units.length > 1 ? ` (all ${s.units.length} units)` : ""}`} />
        <CardContent><div className="max-w-xs"><FormField id="price" label="Agreed price" hint="Everything below is taken off this price." error={bad(ctx, "price") ? "Required" : undefined}><MoneyInput id="price" value={s.price} onChange={(v) => set({ price: v })} disabled={ctx.linked} /></FormField></div></CardContent></Card>

      <Card><Title icon={<Landmark className="size-4" />} title="How the unit is paid" desc="Cash or financing" />
        <CardContent className="space-y-5">
          <PickCards cols={2} label="How the unit is paid" value={s.sale} onChange={(v) => { set({ sale: v }); if (v === "financing" && !fin.feeTouched && !fin.feeIn.trim()) setFin({ ...fin, feeMode: "percent", feeIn: settings.feeStd, feeLock: null }); }}
            options={[{ value: "cash", title: "Cash", hint: "The buyer pays the whole price", icon: <Banknote className="size-5" /> }, { value: "financing", title: "Financing", hint: "A lender pays the loan", icon: <Landmark className="size-5" /> }]} />
          {s.sale === "cash" && <p className="text-sm text-muted-foreground">Cash sale: nothing more to fill in here.</p>}
          {s.sale === "financing" && (
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="sm:col-span-3"><FormField id="institution" label="Institution" error={bad(ctx, "institution") ? "Required" : undefined}>
                <NativeSelect id="institution" value={instOther || (s.institution && !inList) ? "__other" : s.institution} onChange={(e) => { if (e.target.value === "__other") { setInstOther(true); set({ institution: "" }); } else { setInstOther(false); set({ institution: e.target.value }); } }}>
                  <option value="">Choose…</option>{settings.institutions.map((x) => <option key={x}>{x}</option>)}<option value="__other">Other…</option></NativeSelect>
                {(instOther || (s.institution && !inList)) && <Input className="mt-2" aria-label="Institution name" value={s.institution} onChange={(e) => set({ institution: e.target.value })} placeholder="Type the institution" />}</FormField></div>
              <div className="sm:col-span-3"><FormField id="monthly" label="Monthly payment"><MoneyInput id="monthly" value={s.monthly} onChange={(v) => set({ monthly: v })} /></FormField></div>
              <div className="sm:col-span-3 space-y-2"><Label htmlFor="dpIn">Down payment or loan</Label>
                <Seg label="How you know it" value={fin.dpMode} options={[["amount", "DP ₱"], ["percent", "DP %"], ["loan", "Loan ₱"]]} onChange={(m: DpMode) => setFin(switchDpMode(s.price, fin, m))} className="flex" />
                <MoneyInput id="dpIn" prefix={dpIn} value={fin.dpIn} onChange={(v) => setFin({ ...fin, dpIn: v })} invalid={bad(ctx, "dpIn")} />
                <p className="text-xs text-muted-foreground">Type whichever you know. The others are worked out. Most lenders ask for about {settings.minDownPct}% down.</p></div>
              <div className="sm:col-span-3 space-y-2"><Label>Processing fee</Label>
                <Seg label="Processing fee" value={feeChoice} className="flex"
                  options={[["std", `${settings.feeStd}%`], ["none", "No fee"], ["other", "Other"]]}
                  onChange={(c: "std" | "none" | "other") => setFin(c === "std" ? { ...fin, feeMode: "percent", feeIn: settings.feeStd, feeLock: null, feeTouched: true, feeOther: false }
                    : c === "none" ? { ...fin, feeMode: "percent", feeIn: "0", feeLock: null, feeTouched: true, feeOther: false }
                    : { ...fin, feeIn: feeChoice === "other" ? fin.feeIn : "", feeLock: null, feeTouched: true, feeOther: true })} />
                {feeChoice === "other" && (<>
                  <Seg label="How the fee is typed" value={fin.feeMode} options={[["percent", "% of loan"], ["amount", "₱ amount"]]} onChange={(m: FeeMode) => setFin(switchFeeMode(s.price, fin, m))} className="flex" />
                  <MoneyInput id="feeIn" prefix={fin.feeMode === "percent" ? "%" : "₱"} value={fin.feeIn} onChange={(v) => setFin({ ...fin, feeIn: v, feeTouched: true })} /></>)}
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {feeChoice === "none" ? "No processing fee on this deal."
                    : !t.loan ? "Enter the price and the down payment to see the fee."
                    : fin.feeMode === "percent" || feeChoice === "std" ? `${feePct}% of the ${formatPeso(t.loan)} loan = ${formatPeso(t.fee)}.`
                    : `${formatPeso(t.fee)} is ${feePct}% of the ${formatPeso(t.loan)} loan.`}
                  {" "}The buyer pays it together with the down payment, so it is part of the balance.</p></div>
              <div className="sm:col-span-6 grid divide-y rounded-lg bg-muted/50 text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {t.dpSet && t.price ? (<>
                  <div className="p-3"><p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Down payment</p><b className="text-base">{formatPeso(t.share)}</b><p className="text-xs text-muted-foreground">{pc(t.share, t.price)}% of the price</p></div>
                  <div className="p-3"><p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Loan{s.institution ? ` from ${s.institution}` : ""}</p><b className="text-base">{formatPeso(t.loan)}</b><p className="text-xs text-muted-foreground">{pc(t.loan, t.price)}% of the price</p></div>
                  <div className="p-3"><p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Processing fee</p><b className="text-base">{formatPeso(t.fee)}</b><p className="text-xs text-muted-foreground">{t.fee && t.loan ? `${feePct}% of the loan${feeChoice === "other" ? " · custom" : ""}` : "none"}</p></div>
                </>) : <p className="p-3 text-muted-foreground sm:col-span-3">Enter the agreed price and the down payment (or the loan) to see the split.</p>}
              </div>
              <div className="sm:col-span-6"><div className="flex flex-wrap items-center gap-2"><Label>Years to pay</Label>{settings.years.map((y) => <Chip key={y} selected={s.years === y} onClick={() => set({ years: s.years === y ? "" : y })}>{y}</Chip>)}
                <Input aria-label="Other number of years" className="w-24" inputMode="decimal" placeholder="Other" value={settings.years.includes(s.years) ? "" : s.years} onChange={(e) => set({ years: e.target.value.replace(/[^\d.]/g, "") })} />
                {t.years > 0 && t.monthly > 0 && <span className="text-xs text-muted-foreground">= {t.months} monthly payments · {formatPeso(t.repay)} paid to the lender in total</span>}</div></div>
            </div>
          )}
        </CardContent></Card>

      {settings.sections.trade && (
        <Card><Title icon={<Coins className="size-4" />} title="Trade-in" desc="Is the buyer handing in a car?" />
          <CardContent className="space-y-4">
            <Seg label="Trade-in" value={s.hasTi ? "yes" : "no"} options={[["no", "No"], ["yes", "Yes, trade-in"]]} onChange={(v) => set({ hasTi: v === "yes" })} />
            {s.hasTi && (
              <div className="grid gap-4 sm:grid-cols-6">
                <div className="sm:col-span-2"><FormField id="tiYear" label="Year model"><Input id="tiYear" inputMode="numeric" maxLength={4} value={s.ti.year} onChange={(e) => set({ ti: { ...s.ti, year: e.target.value.replace(/\D/g, "") } })} placeholder="2016" /></FormField></div>
                <div className="sm:col-span-4"><FormField id="tiUnit" label="Unit" error={bad(ctx, "tiUnit") ? "Required" : undefined}><Input id="tiUnit" value={s.ti.unit} onChange={(e) => set({ ti: { ...s.ti, unit: e.target.value } })} placeholder="Make and model of the traded car" /></FormField></div>
                <div className="sm:col-span-2"><FormField id="tiPlate" label="Plate number"><Input id="tiPlate" className="font-mono uppercase" value={s.ti.plate} onChange={(e) => set({ ti: { ...s.ti, plate: e.target.value.toUpperCase() } })} placeholder="ABC 1234" /></FormField></div>
                <div className="sm:col-span-2"><FormField id="tiMileage" label="Mileage"><div className="flex"><Input id="tiMileage" inputMode="numeric" className="rounded-r-none text-right font-mono" value={s.ti.mileage} onChange={(e) => set({ ti: { ...s.ti, mileage: e.target.value.replace(/[^\d,]/g, "") } })} /><span className="grid place-items-center rounded-r-lg border border-l-0 bg-muted px-2.5 text-sm text-muted-foreground">km</span></div></FormField></div>
                <div className="sm:col-span-2"><FormField id="tiValue" label="Trade-in value" error={bad(ctx, "tiValue") ? "Required" : undefined}><MoneyInput id="tiValue" value={s.ti.value} onChange={(v) => set({ ti: { ...s.ti, value: v } })} /></FormField></div>
                <div className="flex items-center justify-between gap-4 rounded-lg p-3 ring-1 ring-foreground/10 sm:col-span-6">
                  <div><p className="font-medium">{t.tv ? (t.due < 0 ? "We pay the buyer" : "Buyer adds cash") : "Additional amount"}</p><p className="text-xs text-muted-foreground">{t.tv ? `${t.dpSet ? "Down payment" : "Agreed price"} ${formatPeso(t.share)} − trade-in ${formatPeso(t.tv)} = ${formatPeso(t.due)}` : "Worked out for you from the price and the trade-in value"}</p></div>
                  <b className="text-xl tabular-nums">{t.tv ? formatPeso(Math.abs(t.due)) : formatPeso(0)}</b></div>
                <p className="text-xs text-muted-foreground sm:col-span-6">The traded car is not cash. Its value is taken off what the buyer pays, so it is never part of the balance. If the car is worth more than the buyer&apos;s share, the extra becomes what we pay the buyer.</p>
              </div>
            )}
          </CardContent></Card>
      )}

      {settings.sections.lieu && (
        <Card><Title icon={<ShieldCheck className="size-4" />} title="In lieu of documents" desc="We keep the buyer's documents until they pay" />
          <CardContent className="space-y-4">
            <Switch checked={s.hasLieu} onChange={(v) => set({ hasLieu: v })} label="Hold the documents as collateral" hint="Like OR/CR: we do not hand them over until the amount is paid. No money moves now, so the balance does not change." />
            {s.hasLieu && <div className="grid max-w-xl gap-4 sm:grid-cols-2"><FormField id="lieuAmount" label="Amount to be paid" hint="Part of the balance the documents secure" error={bad(ctx, "lieuAmount") ? "Required" : undefined}><MoneyInput id="lieuAmount" value={s.lieuAmount} onChange={(v) => set({ lieuAmount: v })} /></FormField>
              <FormField id="lieuUntil" label="Pay on or before" error={bad(ctx, "lieuUntil") ? "Required" : undefined}><Input id="lieuUntil" type="date" value={s.lieuUntil} onChange={(e) => set({ lieuUntil: e.target.value })} /></FormField></div>}
          </CardContent></Card>
      )}

      <Card><Title icon={<CircleDollarSign className="size-4" />} title="What the buyer pays" desc="Worked out from the price, the loan and the trade-in" />
        <CardContent className="space-y-3">
          {t.price ? <LedgerView ledger={ctx.ledger} stage="deal" showProof={false} /> : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Enter the agreed price to see what the buyer pays.</p>}
          <Warn list={ctx.warnings.filter((w) => w.step === 3).map((w) => w.text)} />
        </CardContent></Card>
    </>
  );
}

// ======================= 4. Payment =======================
export function StepPayment({ ctx }: { ctx: Ctx }) {
  const { s, t, set, settings, userId } = ctx;
  const proofs = settings.required.proofs;
  const setMethod = (i: number, p: Partial<MethodRow>) => set({ methods: s.methods.map((m, j) => (j === i ? { ...m, ...p } : m)) });
  const [bankOther, setBankOther] = useState<Record<number, boolean>>({});
  const b = ctx.ledger.balance;
  return (
    <>
      <Card><Title icon={<HandCoins className="size-4" />} title="This payment" desc="What kind of payment, and how the money came in" />
        <CardContent className="space-y-5">
          {s.hasLieu && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-muted px-3 py-2 text-sm"><ShieldCheck className="size-4 shrink-0" aria-hidden /><b>In lieu of documents</b>
              <span>{s.lieuAmount ? <b className="tabular-nums">{formatPeso(toCentavos(s.lieuAmount) ?? 0)}</b> : "no amount yet"}{s.lieuUntil ? ` to be paid on or before ${formatDate(s.lieuUntil)}` : ""}.</span>
              <span className="text-xs text-muted-foreground">We hold the buyer&apos;s documents until then. It is not part of the math.</span></p>
          )}
          <PickCards label="Kind of payment" value={s.kind} onChange={(kind: PaymentKind) => set({ kind })} options={[
            { value: "earnest", title: KIND_LABELS.earnest, hint: "Reserves the unit", icon: <Coins className="size-5" /> },
            { value: "partial", title: KIND_LABELS.partial, hint: "Part of the amount due", icon: <Banknote className="size-5" /> },
            { value: "full", title: KIND_LABELS.full, hint: "Nothing is left", icon: <ShieldCheck className="size-5" /> }]} />
          <div className="space-y-3">
            <div className="grid grid-cols-[7rem_1fr] items-center gap-3"><span className="flex items-center gap-2 font-medium"><Banknote className="size-4" aria-hidden /> Cash</span>
              <MoneyInput id="cash" aria-label="Cash amount" value={s.cash} onChange={(v) => set({ cash: v })} invalid={bad(ctx, "cash")} disabled={ctx.cashAuto} /></div>
            {ctx.cashAuto && <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground sm:pl-[7.75rem]">Full payment: cash is exactly what is left to pay, so nothing is left over.<Button type="button" variant="outline" size="sm" onClick={ctx.unlockCash}><Pencil className="size-3.5" /> Edit</Button></p>}
            <div className="sm:pl-[7.75rem]"><ProofBox id="cash-proof" userId={userId} files={s.cashProofs} onChange={(f) => set({ cashProofs: f })} label="Attach photo of the cash" hint="Required when cash is entered" need={proofs && !!t.today && !!s.cash && s.cashProofs.length === 0 || bad(ctx, "cash-proof")} /></div>
            {s.methods.map((m, i) => (
              <div key={i} className="space-y-2 border-t pt-3">
                <div className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr_auto] sm:items-center">
                  {m.type === "check" ? <span className="flex items-center gap-2 font-medium">Check</span> : <Input id={`method-${i}-name`} aria-label="Method name" value={m.name} onChange={(e) => setMethod(i, { name: e.target.value })} placeholder="Name of the method" />}
                  <MoneyInput aria-label={`${m.name || m.type} amount`} value={m.amount} onChange={(v) => setMethod(i, { amount: v })} />
                  <Input aria-label={m.type === "check" ? "Check number" : "Reference number"} className="font-mono" value={m.type === "check" ? m.checkNo : m.ref} onChange={(e) => setMethod(i, m.type === "check" ? { checkNo: e.target.value } : { ref: e.target.value })} placeholder={m.type === "check" ? "Check no." : "Reference no."} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove this payment" onClick={() => set({ methods: s.methods.filter((_, j) => j !== i) })}><Trash2 /></Button>
                </div>
                {m.type === "check" && (
                  <div className="grid gap-2 sm:grid-cols-[7rem_1fr_1fr_auto]"><span />
                    <div><NativeSelect aria-label="Bank" value={bankOther[i] || (m.bank && !settings.banks.includes(m.bank)) ? "__other" : m.bank} onChange={(e) => { if (e.target.value === "__other") { setBankOther({ ...bankOther, [i]: true }); setMethod(i, { bank: "" }); } else { setBankOther({ ...bankOther, [i]: false }); setMethod(i, { bank: e.target.value }); } }}><option value="">Bank…</option>{settings.banks.map((x) => <option key={x}>{x}</option>)}<option value="__other">Other…</option></NativeSelect>
                      {(bankOther[i] || (m.bank && !settings.banks.includes(m.bank))) && <Input className="mt-2" aria-label="Bank name" value={m.bank} onChange={(e) => setMethod(i, { bank: e.target.value })} placeholder="Type the bank" />}</div>
                    <Input aria-label="Branch" value={m.branch} onChange={(e) => setMethod(i, { branch: e.target.value })} placeholder="Branch (Br.)" /></div>
                )}
                <div className="sm:pl-[7.75rem]"><ProofBox id={`method-${i}-proof`} userId={userId} files={m.proofs} onChange={(f) => setMethod(i, { proofs: f })} label={m.type === "check" ? "Attach photo of the check" : "Attach screenshot or receipt"} hint={m.type === "check" ? "Front of the check" : "Bank receipt or e-wallet screenshot"} need={proofs && !!m.amount.trim() && m.proofs.length === 0 || bad(ctx, `method-${i}-proof`)} /></div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-4"><span className="mr-1 text-sm text-muted-foreground">Also paid by:</span>
            <Chip dashed onClick={() => set({ methods: [...s.methods, emptyMethod("check")] })}><Plus className="size-3.5" />Check</Chip>
            {settings.wallets.map((w) => <Chip key={w} dashed onClick={() => set({ methods: [...s.methods, emptyMethod("wallet", w)] })}><Plus className="size-3.5" />{w}</Chip>)}
            <Chip dashed onClick={() => set({ methods: [...s.methods, emptyMethod("wallet")] })}><Pencil className="size-3.5" />Other, type your own</Chip></div>
          <p className="text-xs text-muted-foreground">Cash is always there. Tap a method to add a row, and use the bin to take one away. Names can be edited.</p>
          <div className="flex items-center justify-between border-t-2 border-foreground pt-3 text-base font-semibold"><span>Paid today</span><span className="tabular-nums">{formatPeso(t.today)}</span></div>
          <div className="space-y-1"><Label>The sum of pesos <span className="font-normal text-muted-foreground">written out automatically</span></Label><p className="rounded-lg bg-muted px-3 py-2 font-medium">{words(t.today) || "Fill in an amount above"}</p></div>
        </CardContent></Card>

      <Card><Title icon={<Banknote className="size-4" />} title="Balance" desc="What is left after everything received" />
        <CardContent className="space-y-5">
          <div className="max-w-xs"><FormField id="earlier" label="Earlier payments" hint={ctx.linked ? "Every receipt already on this deal, counted for you." : ctx.earlierLocked ? "Earnest money is the first payment, so nothing was paid before. Press Edit if something was." : "Received before today, for example on a paper receipt."}><div className="flex gap-2"><MoneyInput id="earlier" value={s.earlier} onChange={(v) => set({ earlier: v })} disabled={ctx.linked || ctx.earlierLocked} />{ctx.earlierLocked && <Button type="button" variant="outline" onClick={ctx.unlockEarlier}><Pencil className="size-4" /> Edit</Button>}</div></FormField></div>
          {t.due < 0 && (
            <div className="space-y-3 rounded-lg bg-amber-50 p-4 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
              <p className="font-medium">The buyer&apos;s car is worth more than their share</p>
              <p className="text-sm">The old car is worth {formatPeso(-t.due)} more than the buyer&apos;s share of the price, so we pay the buyer {formatPeso(-t.due)}. Record the cash we hand over.</p>
              <div className="grid gap-3 sm:grid-cols-2"><FormField id="payout" label="Paid out to the buyer"><MoneyInput id="payout" value={s.payout} onChange={(v) => set({ payout: v })} /></FormField>
                <div className="space-y-2"><Label>Proof of the payout</Label><ProofBox id="payout-proof" userId={userId} files={s.payoutProofs} onChange={(f) => set({ payoutProofs: f })} label="Attach proof" hint="Cash handed over, or the transfer receipt" need={proofs && t.payout > 0 && s.payoutProofs.length === 0} /></div></div>
            </div>
          )}
          {t.price ? <LedgerView ledger={ctx.ledger} showInfo={false} /> : <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Enter the agreed price first (step 3).</p>}
          <div className="space-y-1"><Label>Balance of, in words <span className="font-normal text-muted-foreground">automatic</span></Label><p className="rounded-lg bg-muted px-3 py-2 font-medium">{t.balance > 0 ? words(t.balance) : t.price ? (t.balance === 0 ? (t.due < 0 ? "Nil, settled with the buyer" : "Nil, paid in full") : `No balance: ${b.label.toLowerCase()} ${formatPeso(b.amount)}`) : "Fill in the agreed price"}</p></div>
          {(t.balance > 0 || !t.price) && (
            <div className="space-y-2" id={s.dueMode === "date" ? "dueDate" : "dueText"}>
              <div className="flex flex-wrap items-center gap-2"><Label>Shall be given on or before</Label><Seg label="Date or words" value={s.dueMode} options={[["date", "Date"], ["text", "Words"]]} onChange={(v) => set({ dueMode: v })} /></div>
              {s.dueMode === "date" ? <Input aria-label="Due date" type="date" className="max-w-64" value={s.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /> : (
                <><Input aria-label="Due in words" value={s.dueText} onChange={(e) => set({ dueText: e.target.value })} placeholder="e.g. upon release of OR/CR" />
                  <div className="flex flex-wrap gap-1.5">{settings.duePhrases.map((p) => <Chip key={p} dashed onClick={() => set({ dueText: p })}>{p}</Chip>)}</div></>
              )}
              <p className="text-xs text-muted-foreground">Only needed while a balance is left. Pick a date, or switch to Words.</p>
            </div>
          )}
          <Warn list={ctx.warnings.filter((w) => w.step === 4).map((w) => w.text)} />
        </CardContent></Card>
    </>
  );
}

// ======================= 5. Finish =======================
export function StepFinish({ ctx, confirmed, onConfirm }: { ctx: Ctx; confirmed: boolean; onConfirm: (v: boolean) => void }) {
  const { s, t, set, settings, ledger } = ctx;
  const [view, setView] = useState<"details" | "sources">("details");
  const [ta, setTa] = useState<HTMLTextAreaElement | null>(null);
  const addLine = (line: string) => set({ remarks: s.remarks + (s.remarks && !s.remarks.endsWith("\n") ? "\n" : "") + line });
  function format(kind: "bold" | "bullets") {
    if (!ta) return;
    const a = ta.selectionStart, b = ta.selectionEnd, v = s.remarks;
    if (kind === "bold") return set({ remarks: a === b ? `${v.slice(0, a)}**text**${v.slice(b)}` : `${v.slice(0, a)}**${v.slice(a, b)}**${v.slice(b)}` });
    const start = v.lastIndexOf("\n", a - 1) + 1, e = v.indexOf("\n", b), end = e < 0 ? v.length : e;
    const lines = v.slice(start, end).split("\n"), all = lines.every((l) => /^\s*-\s/.test(l));
    set({ remarks: v.slice(0, start) + lines.map((l) => (all ? l.replace(/^\s*-\s/, "") : /^\s*-\s/.test(l) ? l : `- ${l}`)).join("\n") + v.slice(end) });
  }
  const unitLines = s.units.map((u) => [u.makeType, u.color].filter(Boolean).join(" · ") + (u.plate ? ` — ${u.plate}` : ""));
  const cell = (k: string, v: React.ReactNode, big?: boolean) => <div className="border-b py-2" key={k}><p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{k}</p><p className={cn("font-medium", big && "text-lg font-semibold tabular-nums")}>{v || "—"}</p></div>;
  const b = ledger.balance;
  return (
    <>
      <Card><Title icon={<Coins className="size-4" />} title="Payment details" desc="Every peso, in order. Compare it with the paper before saving." />
        <CardContent className="space-y-4">
          <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">How the math works <span className="font-normal text-muted-foreground">· the rules this page follows</span></summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5">
              <li><b>Agreed price</b> is the full price of the unit (all units together).</li>
              <li><b>Trade-in value</b> comes off the price. It is a car, not cash, so it is never part of the balance.</li>
              <li><b>Loan</b> (financing) = price − down payment. The lender pays it to us, so it is not in the balance.</li>
              <li><b>Processing fee</b> (financing only, usually {settings.feeStd}% of the loan, or none, or any amount) is paid by the buyer on top of the down payment. It is part of the amount due.</li>
              <li><b>Amount due from the buyer</b> = down payment (or the whole price on a cash sale) − trade-in + processing fee. Below zero means we pay the buyer.</li>
              <li><b>Balance</b> = amount due − earlier payments − payments today (+ any payout we made to the buyer).</li>
              <li><b>In lieu of documents</b> is collateral: no money moves, so it is never in the math.</li>
              <li><b>Proof:</b> price + processing fee = trade-in + loan + received − payout + balance. If this does not add up, saving is blocked.</li>
            </ol></details>
          <Seg label="View" value={view} options={[["details", "Payment details"], ["sources", "Who pays for the price"]]} onChange={setView} />
          {!t.price ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing to show yet. Fill in the agreed price and the payment.</p> : view === "details" ? <LedgerView ledger={ledger} /> : <SourcesView {...ctx.sources} />}
        </CardContent></Card>

      {settings.sections.remarks && (
        <Card><Title icon={<Pencil className="size-4" />} title="Remarks" desc="Only if there is something extra to write down" />
          <CardContent className="space-y-4">
            <Switch checked={s.hasRem} onChange={(v) => set({ hasRem: v })} label="Add remarks" hint="Type it, or tap a ready-made line" />
            {s.hasRem && (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-lg border">
                  <div className="flex flex-wrap items-center gap-1 border-b bg-muted p-1.5"><Button type="button" size="sm" variant="ghost" onClick={() => format("bold")}><Bold /> Bold</Button><Button type="button" size="sm" variant="ghost" onClick={() => format("bullets")}><List /> Bullets</Button><span className="px-2 text-xs text-muted-foreground">Select words and tap Bold · select lines and tap Bullets</span></div>
                  <textarea ref={setTa} aria-label="Remarks" value={s.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="Write anything the buyer and the office should remember…" className="min-h-32 w-full resize-y bg-transparent p-3 text-base outline-none md:text-sm" />
                  <p className="flex justify-between border-t px-3 py-1.5 text-xs text-muted-foreground"><span>Shown on the receipt exactly like this</span><span>{s.remarks.length} characters</span></p></div>
                <div className="flex flex-wrap gap-1.5">{settings.phrases.map((p) => <Chip key={p} dashed onClick={() => addLine(p)}><Plus className="size-3.5" />{p}</Chip>)}</div>
              </div>
            )}
            <div className="space-y-2 border-t pt-4"><p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Standard notes</p>
              <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{s.notes.filter((n) => n.on && n.text.trim()).length} standard notes will print <span className="font-normal text-muted-foreground">· tap to review, edit or switch any off</span></summary>
                <div className="mt-3 space-y-2">{s.notes.map((n, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border px-3 py-1.5"><input type="checkbox" aria-label="Print this note" checked={n.on} onChange={(e) => set({ notes: s.notes.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)) })} />
                    <input aria-label={`Note ${i + 1}`} className={cn("flex-1 bg-transparent text-sm outline-none", !n.on && "text-muted-foreground line-through")} value={n.text} onChange={(e) => set({ notes: s.notes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} placeholder="Write the note" />
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove this note" onClick={() => set({ notes: s.notes.filter((_, j) => j !== i) })}><Trash2 /></Button></div>))}
                  <Button type="button" size="sm" variant="outline" onClick={() => set({ notes: [...s.notes, { text: "", on: true }] })}><Plus /> Add a note</Button></div></details></div>
          </CardContent></Card>
      )}

      <Card><Title icon={<ShieldCheck className="size-4" />} title="Check before saving" desc="Read it back against the buyer's ID and the unit's papers" />
        <CardContent className="space-y-3">
          {ctx.missing.length > 0 && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><p className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><span><b>Still to fill in:</b> {ctx.missing.map((m, i) => <span key={m.label}>{i > 0 && ", "}<button type="button" className="font-semibold underline" onClick={() => ctx.go(m.target, m.step)}>{m.label}</button></span>)}.</span></p></div>}
          <Warn list={ctx.warnings.map((w) => w.text)} />
          {ctx.missing.length === 0 && ctx.warnings.length === 0 && <p className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"><CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />Everything is filled in, and the price, trade-in, loan and payments add up.</p>}
          <div className="grid gap-x-6 sm:grid-cols-3">
            {cell("Receipt no.", s.receiptNo)}{cell("Received from", s.receivedFrom)}{cell("Contact", s.contact)}
            {s.units.map((u, i) => cell(s.units.length > 1 ? `Unit ${i + 1}` : "Unit", <>{unitLines[i]}<span className="block font-mono text-xs font-normal text-muted-foreground">{[u.motor, u.chassis].filter(Boolean).join(" · ")}</span></>))}
            {cell("Agreed price", t.price ? formatPeso(t.price) : "", true)}{cell(b.label, t.price ? formatPeso(b.amount) : "", true)}{cell("Paid today", t.today ? formatPeso(t.today) : "", true)}
          </div>
          <label className="mt-2 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 font-medium"><input type="checkbox" className="size-5" checked={confirmed} onChange={(e) => onConfirm(e.target.checked)} />I checked every field above against the buyer and the paperwork.</label>
        </CardContent></Card>
    </>
  );
}
