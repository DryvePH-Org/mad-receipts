"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AskDialog } from "@/components/shared/ask-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/deal/settings";
import { cn } from "@/lib/utils";
import { saveSettings } from "./actions";

type Color = [string, string];
const TABS = [["colors", "Colors"], ["pay", "Payments and lenders"], ["text", "Notes and phrases"], ["fields", "Fields and rules"], ["reminders", "Reminders"], ["print", "Print and company"]] as const;

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="mb-3 flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-muted-foreground/30 transition-colors peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
      <span className="text-sm font-medium">{label}{hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}</span>
    </label>
  );
}

function StringList({ title, hint, items, onChange, placeholder }: { title: string; hint: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const add = useRef<HTMLInputElement>(null);
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle><p className="text-sm text-muted-foreground">{hint}</p></CardHeader>
      <CardContent className="space-y-2">
        {items.map((v, i) => (
          <div key={`${i}-${v}`} className="flex gap-2">
            <Input defaultValue={v} aria-label={`${title} ${i + 1}`} onBlur={(e) => { const t = e.target.value.trim(); if (t === v) return; onChange(t ? items.map((x, j) => (j === i ? t : x)) : items.filter((_, j) => j !== i)); }} />
            <Button variant="ghost" size="icon" aria-label={`Remove ${v}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 /></Button>
          </div>
        ))}
        <div className="flex gap-2 border-t border-dashed pt-3">
          <Input ref={add} placeholder={placeholder} aria-label={`Add to ${title}`} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.nextElementSibling?.dispatchEvent(new MouseEvent("click", { bubbles: true })); } }} />
          <Button onClick={() => { const t = add.current?.value.trim(); if (t && !items.includes(t)) { onChange([...items, t]); add.current!.value = ""; } else add.current?.focus(); }}><Plus /> Add</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ColorList({ title, hint, items, onChange, onRemove, rename }: { title: React.ReactNode; hint?: string; items: Color[]; onChange: (v: Color[]) => void; onRemove?: () => void; rename?: boolean }) {
  const name = useRef<HTMLInputElement>(null), hex = useRef<HTMLInputElement>(null);
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center justify-between gap-2">{title}{onRemove && <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove this brand"><Trash2 /></Button>}</CardTitle>{hint && <p className="text-sm text-muted-foreground">{hint}</p>}</CardHeader>
      <CardContent className="space-y-2">
        {items.map(([n, h], i) => (
          <div key={`${i}-${n}`} className="flex gap-2">
            <input type="color" defaultValue={h} aria-label={`Color of ${n}`} className="h-8 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5" onBlur={(e) => e.target.value !== h && onChange(items.map((x, j) => (j === i ? [n, e.target.value] : x)))} />
            <Input defaultValue={n} aria-label={`Name of color ${i + 1}`} onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== n) onChange(items.map((x, j) => (j === i ? [t, h] : x))); }} />
            <Button variant="ghost" size="icon" aria-label={`Remove ${n}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 /></Button>
          </div>
        ))}
        <div className="flex gap-2 border-t border-dashed pt-3">
          <input ref={hex} type="color" defaultValue="#cccccc" aria-label="Color for the new name" className="h-8 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5" />
          <Input ref={name} placeholder="Color name" aria-label="New color name" />
          <Button onClick={() => { const t = name.current?.value.trim(); if (t) { onChange([...items, [t, hex.current?.value ?? "#cccccc"]]); name.current!.value = ""; } else name.current?.focus(); }}><Plus /> Add</Button>
        </div>
      </CardContent>
    </Card>
  );
  void rename;
}

/** The Admin's controls for every list and option the form uses. Each change is saved at once. */
export function SettingsEditor({ initial }: { initial: AppSettings }) {
  const [cfg, setCfg] = useState(initial);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("colors");
  const [saved, setSaved] = useState(false);
  const [reset, setReset] = useState(false);
  const newBrand = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function apply(next: AppSettings) {
    setCfg(next);
    const r = await saveSettings(next);
    if (!r.ok) return toast.error(r.error);
    setSaved(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 1600);
  }
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => apply({ ...cfg, [key]: value });
  const setColors = (colors: AppSettings["colors"]) => apply({ ...cfg, colors });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist">{TABS.map(([k, l]) => <Button key={k} role="tab" aria-selected={tab === k} size="sm" variant={tab === k ? "default" : "outline"} className="rounded-full" onClick={() => setTab(k)}>{l}</Button>)}</div>
        <span className={cn("ml-auto text-sm font-medium text-emerald-700 transition-opacity", saved ? "opacity-100" : "opacity-0")} role="status">Saved ✓</span>
        <Button variant="outline" onClick={() => setReset(true)}>Restore all defaults</Button>
      </div>

      {tab === "colors" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">Colors appear as choices on every vehicle card. Brand colors show up when the car&apos;s make matches the brand name. Make and type come from the inventory sheet, so they are not edited here.</p>
          <div className="grid gap-5 lg:grid-cols-2">
            <ColorList title="Common car colors" hint="The colors cars are most often sold in. Shown for every car, after its brand's own colors" items={cfg.colors.common} onChange={(common) => setColors({ ...cfg.colors, common })} />
            {Object.entries(cfg.colors.brands).map(([brand, list]) => (
              <ColorList key={brand} hint="Factory colors for this brand" items={list as Color[]}
                title={<Input defaultValue={brand} aria-label="Brand name" className="h-8 w-48 border-transparent font-medium hover:border-input" onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== brand && !cfg.colors.brands[t]) setColors({ ...cfg.colors, brands: Object.fromEntries(Object.entries(cfg.colors.brands).map(([k, v]) => [k === brand ? t : k, v])) }); else e.target.value = brand; }} />}
                onChange={(v) => setColors({ ...cfg.colors, brands: { ...cfg.colors.brands, [brand]: v } })}
                onRemove={() => { const { [brand]: _gone, ...rest } = cfg.colors.brands; void _gone; setColors({ ...cfg.colors, brands: rest }); }} />
            ))}
          </div>
          <Card><CardHeader><CardTitle>Add a brand</CardTitle><p className="text-sm text-muted-foreground">Give it its own list of factory color names</p></CardHeader>
            <CardContent className="flex max-w-lg gap-2"><Input ref={newBrand} placeholder="Brand name, e.g. Kia" aria-label="New brand name" />
              <Button onClick={() => { const t = newBrand.current?.value.trim(); if (t && !cfg.colors.brands[t]) { setColors({ ...cfg.colors, brands: { ...cfg.colors.brands, [t]: [] } }); newBrand.current!.value = ""; } else newBrand.current?.focus(); }}><Plus /> Add brand</Button></CardContent></Card>
        </div>
      )}

      {tab === "pay" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <StringList title="E-wallets and other payment methods" hint="The “Also paid by” buttons in the Payment step" items={cfg.wallets} onChange={(v) => set("wallets", v)} placeholder="e.g. PayMaya QR" />
          <StringList title="Banks for checks" hint="The Bank list in the check row" items={cfg.banks} onChange={(v) => set("banks", v)} placeholder="e.g. Landbank" />
          <StringList title="Financing institutions" hint="The Institution list for financing" items={cfg.institutions} onChange={(v) => set("institutions", v)} placeholder="e.g. Home Credit" />
          <StringList title="Years to pay" hint="The Years buttons for financing" items={cfg.years} onChange={(v) => set("years", v.filter((y) => /^\d{1,2}(\.\d)?$/.test(y)))} placeholder="e.g. 6" />
        </div>
      )}

      {tab === "text" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Standard notes</CardTitle><p className="text-sm text-muted-foreground">Printed on every receipt. “On by default” decides whether a new receipt starts with it.</p></CardHeader>
            <CardContent className="space-y-2">
              {cfg.notes.map((n, i) => (
                <div key={`${i}-${n.text}`} className="flex items-center gap-2">
                  <Input defaultValue={n.text} aria-label={`Standard note ${i + 1}`} onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== n.text) set("notes", cfg.notes.map((x, j) => (j === i ? { ...x, text: t } : x))); }} />
                  <label className="flex items-center gap-1.5 text-xs whitespace-nowrap"><input type="checkbox" checked={n.on} onChange={(e) => set("notes", cfg.notes.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} /> On by default</label>
                  <Button variant="ghost" size="icon" aria-label="Remove note" onClick={() => set("notes", cfg.notes.filter((_, j) => j !== i))}><Trash2 /></Button>
                </div>
              ))}
              <form className="flex gap-2 border-t border-dashed pt-3" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget.elements.namedItem("note") as HTMLInputElement; const t = f.value.trim(); if (t) { set("notes", [...cfg.notes, { text: t, on: true }]); f.value = ""; } }}>
                <Input name="note" placeholder="Write a standard note" aria-label="New standard note" /><Button type="submit"><Plus /> Add</Button></form>
            </CardContent>
          </Card>
          <div className="space-y-5">
            <StringList title="Ready-made remark lines" hint="The “Tap to add a line” buttons under Remarks" items={cfg.phrases} onChange={(v) => set("phrases", v)} placeholder="e.g. Spare tire included." />
            <StringList title="“On or before” phrases" hint="The quick words next to the balance date" items={cfg.duePhrases} onChange={(v) => set("duePhrases", v)} placeholder="e.g. Upon registration" />
          </div>
        </div>
      )}

      {tab === "fields" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Required fields</CardTitle><p className="text-sm text-muted-foreground">Staff cannot send a receipt for approval until these are filled in. Receipt number, buyer, plate, price and payment are always required.</p></CardHeader>
            <CardContent>
              <Switch checked={cfg.required.contact} onChange={(v) => set("required", { ...cfg.required, contact: v })} label="Contact number" hint="11 digits starting with 09" />
              <Switch checked={cfg.required.address} onChange={(v) => set("required", { ...cfg.required, address: v })} label="Postal address" />
              <Switch checked={cfg.required.motor} onChange={(v) => set("required", { ...cfg.required, motor: v })} label="Motor number" />
              <Switch checked={cfg.required.chassis} onChange={(v) => set("required", { ...cfg.required, chassis: v })} label="Chassis number" />
              <Switch checked={cfg.required.color} onChange={(v) => set("required", { ...cfg.required, color: v })} label="Color" />
              <Switch checked={cfg.required.proofs} onChange={(v) => set("required", { ...cfg.required, proofs: v })} label="Proof of every payment" hint="Photo of the cash, check photo, receipt or screenshot" />
            </CardContent></Card>
          <div className="space-y-5">
            <Card><CardHeader><CardTitle>Parts of the form</CardTitle><p className="text-sm text-muted-foreground">Turn a part off to hide it from the form</p></CardHeader>
              <CardContent>
                <Switch checked={cfg.sections.trade} onChange={(v) => set("sections", { ...cfg.sections, trade: v })} label="Trade-in" />
                <Switch checked={cfg.sections.lieu} onChange={(v) => set("sections", { ...cfg.sections, lieu: v })} label="In lieu of documents" />
                <Switch checked={cfg.sections.remarks} onChange={(v) => set("sections", { ...cfg.sections, remarks: v })} label="Remarks" />
              </CardContent></Card>
            <Card><CardHeader><CardTitle>Dashboard targets</CardTitle><p className="text-sm text-muted-foreground">The number after the slash on the Approver&apos;s dashboards, like 2/60</p></CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  {([["buyGoal", "Units to buy each month", "units"], ["sellGoal", "Units to release each month", "units"], ["pendingDays", "A reservation may stay open", "days"]] as const).map(([k, label, unit]) => (
                    <div key={k} className="space-y-1.5"><Label htmlFor={`dash-${k}`}>{label}</Label><div className="flex"><Input id={`dash-${k}`} defaultValue={cfg.dashboard[k]} inputMode="numeric" className="rounded-r-none text-right" onBlur={(e) => { const v = parseInt(e.target.value, 10); if (v > 0) set("dashboard", { ...cfg.dashboard, [k]: v }); else e.target.value = String(cfg.dashboard[k]); }} /><span className="grid place-items-center rounded-r-lg border border-l-0 bg-muted px-2.5 text-xs text-muted-foreground">{unit}</span></div></div>
                  ))}
                  <p className="text-xs text-muted-foreground sm:col-span-3">The first two apply to every month unless you set a different target below. When a reservation has no cleaning date in the sheet, it counts as late this many days after it was made.</p>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">A different target for one month</h4>
                  {Object.entries(cfg.dashboard.months).sort(([x], [y]) => y.localeCompare(x)).map(([m, v]) => {
                    const put = (patch: { buy?: number; sell?: number }) => set("dashboard", { ...cfg.dashboard, months: { ...cfg.dashboard.months, [m]: { ...v, ...patch } } });
                    const num = (kind: "buy" | "sell", label: string) => (
                      <div className="space-y-1"><Label htmlFor={`m-${m}-${kind}`} className="text-xs text-muted-foreground">{label}</Label>
                        <Input id={`m-${m}-${kind}`} defaultValue={v[kind] ?? ""} placeholder={String(kind === "buy" ? cfg.dashboard.buyGoal : cfg.dashboard.sellGoal)} inputMode="numeric" className="w-24 text-right"
                          onBlur={(e) => { const n = parseInt(e.target.value, 10); if (n > 0 && n <= 1000) put({ [kind]: n }); else { e.target.value = ""; const rest = kind === "buy" ? { sell: v.sell } : { buy: v.buy }; set("dashboard", { ...cfg.dashboard, months: { ...cfg.dashboard.months, [m]: rest } }); } }} /></div>
                    );
                    return (
                      <div key={m} className="flex flex-wrap items-end gap-3 rounded-lg border p-2.5">
                        <p className="min-w-32 flex-1 self-center font-medium">{new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
                        {num("buy", "Buy")}{num("sell", "Release")}
                        <Button variant="ghost" size="icon" aria-label={`Remove the target for ${m}`} onClick={() => { set("dashboard", { ...cfg.dashboard, months: Object.fromEntries(Object.entries(cfg.dashboard.months).filter(([k]) => k !== m)) }); }}><Trash2 /></Button>
                      </div>
                    );
                  })}
                  <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const m = new FormData(e.currentTarget).get("month")?.toString() ?? ""; if (/^\d{4}-\d{2}$/.test(m) && !cfg.dashboard.months[m]) { set("dashboard", { ...cfg.dashboard, months: { ...cfg.dashboard.months, [m]: { buy: cfg.dashboard.buyGoal, sell: cfg.dashboard.sellGoal } } }); e.currentTarget.reset(); } }}>
                    <div className="space-y-1"><Label htmlFor="new-month" className="text-xs text-muted-foreground">Month</Label><Input id="new-month" name="month" type="month" required className="w-44" /></div>
                    <Button type="submit"><Plus /> Add a month</Button>
                  </form>
                  <p className="text-xs text-muted-foreground">A month you add starts at the usual targets. Change the numbers, then press Save. Leave a box empty to use the usual target for that one.</p>
                </div>
              </CardContent></Card>
            <Card><CardHeader><CardTitle>Financing rules</CardTitle><p className="text-sm text-muted-foreground">Used for the default fee and the warnings. Staff can still type any other fee percent.</p></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {([["feeStd", "Standard processing fee", "% of the loan"], ["minDownPct", "Lowest usual down payment", "% of the price"]] as const).map(([k, label, unit]) => (
                  <div key={k} className="space-y-1.5"><Label htmlFor={k}>{label}</Label><div className="flex"><Input id={k} defaultValue={cfg[k]} inputMode="decimal" className="rounded-r-none text-right" onBlur={(e) => { const v = e.target.value.trim(); if (/^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) <= 100) set(k, v); else e.target.value = cfg[k]; }} /><span className="grid place-items-center rounded-r-lg border border-l-0 bg-muted px-2.5 text-xs text-muted-foreground">{unit}</span></div></div>
                ))}
              </CardContent></Card>
          </div>
        </div>
      )}

      {tab === "reminders" && (
        <Card className="max-w-xl"><CardHeader><CardTitle>When to remind</CardTitle><p className="text-sm text-muted-foreground">Applies to the whole team, in the app and in the 8:00 Telegram message</p></CardHeader>
          <CardContent>
            <Switch checked={cfg.reminders.before7} onChange={(v) => set("reminders", { ...cfg.reminders, before7: v })} label="7 days before the due date" />
            <Switch checked={cfg.reminders.before3} onChange={(v) => set("reminders", { ...cfg.reminders, before3: v })} label="3 days before the due date" />
            <Switch checked={cfg.reminders.dueDay} onChange={(v) => set("reminders", { ...cfg.reminders, dueDay: v })} label="On the due day" />
            <Switch checked={cfg.reminders.overdueDaily} onChange={(v) => set("reminders", { ...cfg.reminders, overdueDaily: v })} label="Every day when it is overdue" />
            <div className="grid gap-4 sm:grid-cols-2">
              {([["lenderDays", "A loan waited for the lender more than", "days"], ["approvalHours", "A receipt waited for approval more than", "hours"]] as const).map(([k, label, unit]) => (
                <div key={k} className="space-y-1.5"><Label htmlFor={k}>{label}</Label><div className="flex"><Input id={k} defaultValue={cfg.reminders[k]} inputMode="numeric" className="rounded-r-none text-right" onBlur={(e) => { const v = parseInt(e.target.value, 10); if (v > 0) set("reminders", { ...cfg.reminders, [k]: v }); else e.target.value = String(cfg.reminders[k]); }} /><span className="grid place-items-center rounded-r-lg border border-l-0 bg-muted px-2.5 text-xs text-muted-foreground">{unit}</span></div></div>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">The collateral date of documents we hold also triggers a reminder 7 days ahead.</p>
          </CardContent></Card>
      )}

      {tab === "print" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card><CardHeader><CardTitle>Company on the receipt</CardTitle><p className="text-sm text-muted-foreground">Shown at the top of every printed copy</p></CardHeader>
            <CardContent className="space-y-4">
              {([["name", "Business name"], ["tagline", "Title"]] as const).map(([k, label]) => <div key={k} className="space-y-1.5"><Label htmlFor={`co-${k}`}>{label}</Label><Input id={`co-${k}`} defaultValue={cfg.company[k]} onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== cfg.company[k]) set("company", { ...cfg.company, [k]: t }); }} /></div>)}
              <div className="space-y-1.5"><Label htmlFor="co-address">Address line</Label><textarea id="co-address" defaultValue={cfg.company.address} onBlur={(e) => e.target.value !== cfg.company.address && set("company", { ...cfg.company, address: e.target.value })} className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm" /></div>
            </CardContent></Card>
          <StringList title="Names of the printed copies" hint="Copy 1, 2, 3… are named in this order. Staff can still rename them when printing." items={cfg.copyNames} onChange={(v) => set("copyNames", v)} placeholder="e.g. Bank copy" />
        </div>
      )}

      <AskDialog open={reset} onOpenChange={setReset} title="Restore all defaults?" description="Every list, rule and name on this page goes back to how it started. Receipts and deals are not touched." fields={[]} confirm="Restore defaults" danger
        onConfirm={async () => { await apply(structuredClone(DEFAULT_SETTINGS) as AppSettings); }} />
    </div>
  );
}
