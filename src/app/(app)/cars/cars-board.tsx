"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Key, LayoutGrid, Loader2, MapPin, RefreshCw, Rows3, Search, SlidersHorizontal, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Pill, type Tone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { AVAILABILITY_LABEL, EMPTY_FILTER, filterCars, sortCars, spareKeyState, summarize, type Availability, type CarFilter, type CarRow, type SortKey } from "@/lib/cars/model";
import { refreshCarsAction } from "./actions";

const TONE: Record<Availability, Tone> = { available: "emerald", asis: "amber", reserved: "blue", sold: "zinc", repair: "red" };
const peso = (n: number | null) => (n === null ? "No price" : `₱${n.toLocaleString("en-PH")}`);
const unique = (cars: CarRow[], pick: (c: CarRow) => string) => [...new Set(cars.map(pick).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const nice = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");
const time = (ms: number) => new Date(ms).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const title = (c: CarRow) => [c.year, c.brand, c.make].filter(Boolean).join(" ");

export function CarsBoard({ cars, at, stale, role, sheetUrl, canOpenDocs }: { cars: CarRow[]; at: number; stale: boolean; role: string; sheetUrl: string | null; canOpenDocs: boolean }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [f, setF] = useState<CarFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<SortKey>("newest");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<CarRow | null>(null);
  const set = (patch: Partial<CarFilter>) => setF((x) => ({ ...x, ...patch }));

  const summary = useMemo(() => summarize(cars), [cars]);
  const shown = useMemo(() => sortCars(filterCars(cars, f), sort), [cars, f, sort]);
  const brands = useMemo(() => unique(cars, (c) => c.brand), [cars]);
  const bodies = useMemo(() => unique(cars, (c) => c.bodyType), [cars]);
  const fuels = useMemo(() => unique(cars, (c) => c.fuel), [cars]);
  const showTarget = cars.some((c) => c.target !== null);
  const active = f.q || f.availability.length || f.brands.length || f.bodyTypes.length || f.fuels.length || f.priceMin !== null || f.priceMax !== null || f.yearMin !== null || f.yearMax !== null || f.sellableOnly || f.repairOnly || f.spareKey;

  const toggle = <K extends "availability" | "brands" | "bodyTypes" | "fuels">(k: K, v: CarFilter[K][number]) => set({ [k]: (f[k] as string[]).includes(v as string) ? (f[k] as string[]).filter((x) => x !== v) : [...(f[k] as string[]), v] } as Partial<CarFilter>);
  const num = (v: string) => (v.trim() === "" || !/^\d+$/.test(v.trim()) ? null : Number(v.trim()));
  const refresh = () => startRefresh(async () => { try { await refreshCarsAction(); router.refresh(); toast.success("Read again from the sheet."); } catch { toast.error("Could not refresh. Try again."); } });

  const tile = (label: string, value: number | string, sub: string, onClick?: () => void, on?: boolean) => (
    <button type="button" onClick={onClick} disabled={!onClick} aria-pressed={on} className={`rounded-xl p-3 text-left ring-1 transition sm:p-4 ${on ? "bg-primary/5 ring-primary" : "ring-foreground/10"} ${onClick ? "hover:bg-muted/50" : ""}`}>
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </button>
  );
  const only = (a: Availability) => set({ availability: f.availability.length === 1 && f.availability[0] === a ? [] : [a], sellableOnly: false, repairOnly: false });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tile("Can be sold", summary.sellable, "available or sell as is", () => set({ sellableOnly: !f.sellableOnly, availability: [] }), f.sellableOnly)}
        {tile("Available", summary.available, "ready to sell", () => only("available"), f.availability.includes("available") && f.availability.length === 1)}
        {tile("Reserved", summary.reserved, "someone has it", () => only("reserved"), f.availability.includes("reserved") && f.availability.length === 1)}
        {tile("For repair", summary.repair, "not ready", () => only("repair"), f.availability.includes("repair") && f.availability.length === 1)}
        {tile("Sell as is", summary.asis, "no repair planned", () => only("asis"), f.availability.includes("asis") && f.availability.length === 1)}
        {tile("Days in stock", summary.avgDays ?? "—", summary.oldest !== null ? `average; oldest ${summary.oldest}` : "average")}
      </div>

      <div className="space-y-3 rounded-xl p-3 ring-1 ring-foreground/10 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Search cars" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search plate, brand, model, color…" className="pl-9" />
          </div>
          <NativeSelect aria-label="Sort" className="w-48" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="newest">Newest arrival</option><option value="oldest">Longest in stock</option><option value="priceLow">Price: low to high</option><option value="priceHigh">Price: high to low</option><option value="yearNew">Year: newest</option><option value="brand">Brand A to Z</option><option value="days">Days in stock</option>
          </NativeSelect>
          <Button type="button" variant={more ? "secondary" : "outline"} onClick={() => setMore((m) => !m)} aria-expanded={more}><SlidersHorizontal /> Filters</Button>
          <div className="flex rounded-lg ring-1 ring-foreground/10" role="group" aria-label="View">
            <Button type="button" size="icon" variant={view === "cards" ? "secondary" : "ghost"} aria-label="Cards" aria-pressed={view === "cards"} onClick={() => setView("cards")}><LayoutGrid /></Button>
            <Button type="button" size="icon" variant={view === "table" ? "secondary" : "ghost"} aria-label="Table" aria-pressed={view === "table"} onClick={() => setView("table")}><Rows3 /></Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
          {(Object.keys(AVAILABILITY_LABEL) as Availability[]).filter((a) => summary.total === 0 || cars.some((c) => c.availability === a)).map((a) => (
            <button key={a} type="button" aria-pressed={f.availability.includes(a)} onClick={() => toggle("availability", a)} className={`rounded-full border px-3 py-1 text-sm ${f.availability.includes(a) ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}>{AVAILABILITY_LABEL[a]} <span className="text-muted-foreground">{cars.filter((c) => c.availability === a).length}</span></button>
          ))}
        </div>

        {more && (
          <div className="grid gap-4 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <fieldset className="space-y-1.5"><legend className="text-sm font-medium">Brand</legend><div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">{brands.map((b) => <button key={b} type="button" aria-pressed={f.brands.includes(b)} onClick={() => toggle("brands", b)} className={`rounded-full border px-2.5 py-0.5 text-xs ${f.brands.includes(b) ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}>{b}</button>)}</div></fieldset>
            <fieldset className="space-y-1.5"><legend className="text-sm font-medium">Body type</legend><div className="flex flex-wrap gap-1.5">{bodies.map((b) => <button key={b} type="button" aria-pressed={f.bodyTypes.includes(b)} onClick={() => toggle("bodyTypes", b)} className={`rounded-full border px-2.5 py-0.5 text-xs ${f.bodyTypes.includes(b) ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}>{b}</button>)}</div></fieldset>
            <fieldset className="space-y-1.5"><legend className="text-sm font-medium">Fuel</legend><div className="flex flex-wrap gap-1.5">{fuels.map((b) => <button key={b} type="button" aria-pressed={f.fuels.includes(b)} onClick={() => toggle("fuels", b)} className={`rounded-full border px-2.5 py-0.5 text-xs ${f.fuels.includes(b) ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}>{b}</button>)}</div></fieldset>
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2"><label className="space-y-1">Price from<Input inputMode="numeric" placeholder="0" value={f.priceMin ?? ""} onChange={(e) => set({ priceMin: num(e.target.value) })} /></label><label className="space-y-1">to<Input inputMode="numeric" placeholder="any" value={f.priceMax ?? ""} onChange={(e) => set({ priceMax: num(e.target.value) })} /></label></div>
              <div className="grid grid-cols-2 gap-2"><label className="space-y-1">Year from<Input inputMode="numeric" placeholder="2015" value={f.yearMin ?? ""} onChange={(e) => set({ yearMin: num(e.target.value) })} /></label><label className="space-y-1">to<Input inputMode="numeric" placeholder="2026" value={f.yearMax ?? ""} onChange={(e) => set({ yearMax: num(e.target.value) })} /></label></div>
              <label className="flex items-center gap-2"><input type="checkbox" className="size-4" checked={f.spareKey} onChange={(e) => set({ spareKey: e.target.checked })} /> With spare key only</label>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>Showing <b className="text-foreground">{shown.length}</b> of {cars.length} cars</span>
          {active ? <button type="button" className="inline-flex items-center gap-1 underline underline-offset-2" onClick={() => { setF(EMPTY_FILTER); }}><X className="size-3.5" /> Clear filters</button> : null}
          <span className="ml-auto flex items-center gap-2">
            <span>{stale ? "Showing an older copy: the sheet could not be reached. " : ""}Read at {time(at)}</span>
            <Button type="button" size="sm" variant="outline" disabled={refreshing} onClick={refresh}>{refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh now</Button>
            {sheetUrl && <Button size="sm" variant="ghost" nativeButton={false} render={<a href={sheetUrl} target="_blank" rel="noreferrer" />}><ExternalLink /> Sheet</Button>}
          </span>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl p-8 text-center text-sm text-muted-foreground ring-1 ring-foreground/10">No car matches these filters. {active ? "Try clearing one." : ""}</p>
      ) : view === "cards" ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {shown.map((c) => (
            <li key={c.plate}>
              <button type="button" onClick={() => setOpen(c)} className="flex h-full w-full flex-col gap-2 rounded-xl p-4 text-left ring-1 ring-foreground/10 transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary">
                <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="truncate font-medium">{title(c)}</p><p className="font-mono text-xs text-muted-foreground">{c.plateDisplay}</p></div><Pill tone={TONE[c.availability]}>{AVAILABILITY_LABEL[c.availability]}</Pill></div>
                <p className="text-xs text-muted-foreground">{[c.color, c.mileage, c.trans, c.fuel].filter(Boolean).join(" · ") || "—"}</p>
                <div className="mt-auto flex items-end justify-between gap-2">
                  <div><p className="text-lg font-semibold tabular-nums">{peso(c.price)}</p>{c.repriced && c.originalPrice && <p className="text-xs text-muted-foreground line-through">{peso(c.originalPrice)}</p>}</div>
                  <p className="text-right text-xs text-muted-foreground">{c.daysInStock !== null ? `${c.daysInStock} days` : "arrival unknown"}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {c.availability === "reserved" && c.reservedFor.length > 0 && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-900 dark:bg-blue-500/10 dark:text-blue-200">by {c.reservedFor.join(", ")}{c.reservedOn ? ` · ${c.reservedOn}` : ""}</span>}
                  {c.repairStatus && <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-red-900 dark:bg-red-500/10 dark:text-red-200"><Wrench className="size-3" aria-hidden />{c.repairStatus}</span>}
                  {c.location && <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"><MapPin className="size-3" aria-hidden />{c.location}</span>}
                  {spareKeyState(c.spareKey) === "yes" && <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"><Key className="size-3" aria-hidden />spare key</span>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs tracking-wide text-muted-foreground uppercase"><tr>{["Plate", "Car", "Color", "Price", "Status", "Days", "Repair", "Location"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {shown.map((c) => (
                <tr key={c.plate} className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(c)}>
                  <td className="px-3 py-2 font-mono text-xs">{c.plateDisplay}</td>
                  <td className="px-3 py-2"><button type="button" className="text-left font-medium underline-offset-2 hover:underline" onClick={(e) => { e.stopPropagation(); setOpen(c); }}>{title(c)}</button></td>
                  <td className="px-3 py-2 text-muted-foreground">{c.color || "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{peso(c.price)}{c.repriced && <span className="ml-1 text-xs text-muted-foreground line-through">{peso(c.originalPrice)}</span>}</td>
                  <td className="px-3 py-2"><Pill tone={TONE[c.availability]}>{AVAILABILITY_LABEL[c.availability]}</Pill></td>
                  <td className="px-3 py-2 tabular-nums">{c.daysInStock ?? "—"}</td>
                  <td className="px-3 py-2">{c.repairStatus || "—"}</td>
                  <td className="px-3 py-2">{c.location || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ResponsiveDialog open={!!open} onOpenChange={(o) => !o && setOpen(null)} title={open ? title(open) : ""} description={open ? `Plate ${open.plateDisplay}` : undefined}>
        {open && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2"><Pill tone={TONE[open.availability]}>{AVAILABILITY_LABEL[open.availability]}</Pill>{open.repairStatus && <Pill tone="red">{open.repairStatus}</Pill>}{open.toCebu && <Pill tone="purple">Manila unit to Cebu</Pill>}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {([
                ["Price", peso(open.price)], ...(open.repriced ? [["Original price", peso(open.originalPrice)] as [string, string]] : []), ...(showTarget && role !== "sales" ? [["Target", peso(open.target)] as [string, string]] : []),
                ["Body type", open.bodyType || "—"], ["Color", open.color || "—"], ["Mileage", open.mileage || "—"], ["Transmission", open.trans || "—"], ["Fuel", open.fuel || "—"],
                ["Arrived", nice(open.arrived)], ["Days in stock", open.daysInStock !== null ? String(open.daysInStock) : "—"], ["Location", open.location || "—"],
                ["Spare key", spareKeyState(open.spareKey) === "yes" ? "Yes" : spareKeyState(open.spareKey) === "no" ? "No" : open.spareKey || "—"],
                ...(open.encumbrance || role !== "sales" ? [["Encumbrance", open.encumbrance || "None"] as [string, string]] : []),
                ...(open.orExp ? [["OR expires", nice(open.orExp)] as [string, string]] : []), ...(open.docsCode ? [["Documents", open.docsCode] as [string, string]] : []),
              ] as [string, string][]).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
            </dl>
            {open.remarks && <div><p className="text-xs text-muted-foreground">Notes in the sheet</p><p className="rounded-lg bg-muted p-2">{open.remarks}</p></div>}
            {canOpenDocs && <Button variant="outline" nativeButton={false} render={<Link href={`/documents/${open.plate}`} />}>Open the car&apos;s documents</Button>}
          </div>
        )}
      </ResponsiveDialog>
    </div>
  );
}
