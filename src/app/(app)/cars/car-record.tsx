"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Pill, type Tone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { fullYear } from "@/lib/inventory/year";
import { AVAILABILITY_LABEL, type Availability, type CarRow } from "@/lib/cars/model";
import { DETAIL_FIELDS, FIELD_BY_KEY, tidyOf, type Checked, type DetailKey } from "@/lib/cars/standards";
import { updateCarDetailsAction } from "./actions";
import { EditStock } from "./edit-stock";

const TONE: Record<Availability, Tone> = { available: "emerald", asis: "amber", reserved: "blue", sold: "zinc", repair: "red", notforsale: "zinc" };
const peso = (n: number | null) => (n === null ? "No price" : `₱${n.toLocaleString("en-PH")}`);
const nice = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");
const title = (c: CarRow) => [c.year, c.brand, c.make].filter(Boolean).join(" ");

/** The same order for every car: who it is, what it is like, what is happening with it, where it is, and its papers. */
const GROUPS: { title: string; keys: DetailKey[] }[] = [
  { title: "Who it is", keys: ["year_model", "make", "model_variant", "color"] },
  { title: "What it is like", keys: ["body_type", "trans", "fuel", "mileage", "spare_key"] },
];

const Row = ({ k, v, flag }: { k: string; v: React.ReactNode; flag?: boolean }) => (
  <div className="min-w-0"><dt className="flex items-center gap-1.5 text-xs text-muted-foreground">{k}{flag && <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">not standard</span>}</dt><dd className="font-medium break-words">{v}</dd></div>
);
const Section = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <section className="space-y-3">
    <div className="flex items-center gap-2 border-b pb-1.5"><h3 className="flex-1 text-sm font-semibold">{title}</h3>{action}</div>
    {children}
  </section>
);

/**
 * One car, the same way every time: summary on top, then Car details, Status and price, Where it is, and Papers. Reading and editing happen here, in a window
 * about half the screen wide (the whole screen on a phone). The Admins edit the details; whoever changes the price list edits status, price and location.
 */
export function CarRecord({ car, onClose, canEditStatus, canEditDetails, canOpenDocs, showTarget, role, docs, locations, suggestions }: {
  car: CarRow; onClose: () => void; canEditStatus: boolean; canEditDetails: boolean; canOpenDocs: boolean; showTarget: boolean; role: string;
  docs: { label: string; tone: Tone } | undefined; locations: string[]; suggestions: Partial<Record<DetailKey, string[]>>;
}) {
  const [mode, setMode] = useState<"view" | "details" | "status">("view");
  const rec = car.record;
  const shown = (k: DetailKey): string => {
    // what the screens show: the price list's own wording first, as everywhere else
    const listed = k === "model_variant" ? car.make : k === "color" ? car.color : k === "mileage" ? car.mileage : k === "fuel" ? car.fuel : null;
    return listed || rec?.[k] || "";
  };
  const odd = (k: DetailKey) => { const v = shown(k); return !!v && !tidyOf(k, v).fits; };
  const oddCount = DETAIL_FIELDS.filter(odd).length;

  return (
    <ResponsiveDialog open onOpenChange={(o) => { if (!o) onClose(); }} title={title(car)} description={`Plate ${car.plateDisplay}`} size="half">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-muted/60 p-3">
          <Pill tone={TONE[car.availability]}>{AVAILABILITY_LABEL[car.availability]}</Pill>
          {car.repairStatus && <Pill tone="red">{car.repairStatus}</Pill>}
          {car.toCebu && <Pill tone="purple">Manila unit to Cebu</Pill>}
          <span className="text-lg font-semibold tabular-nums">{peso(car.price)}</span>
          {car.repriced && car.originalPrice && <span className="text-sm text-muted-foreground line-through">{peso(car.originalPrice)}</span>}
          <span className="ml-auto text-sm text-muted-foreground">{car.daysInStock !== null ? `${car.daysInStock} days in stock` : "arrival unknown"}</span>
        </div>

        {mode === "details" && rec ? (
          <Section title="Car details"><EditDetails car={car} suggestions={suggestions} onDone={() => setMode("view")} /></Section>
        ) : (
          <Section title="Car details" action={canEditDetails && rec && mode === "view" ? <Button size="sm" variant="outline" onClick={() => setMode("details")}><Pencil /> Edit details</Button> : undefined}>
            {GROUPS.map((g) => (
              <div key={g.title} className="space-y-2">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.title}</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                  {g.keys.map((k) => <Row key={k} k={FIELD_BY_KEY.get(k)!.label} v={FIELD_BY_KEY.get(k)!.show(shown(k))} flag={odd(k)} />)}
                </dl>
              </div>
            ))}
            {oddCount > 0 && <p className="text-xs text-amber-900 dark:text-amber-200">{oddCount} {oddCount === 1 ? "detail does" : "details do"} not follow the standard format. {canEditDetails ? <Link href="/cars/tidy" className="underline underline-offset-2">Tidy them up</Link> : "An Admin can tidy it."}</p>}
          </Section>
        )}

        {mode === "status" && car.raw ? (
          <Section title="Status, price and where it is"><EditStock car={car} locations={locations} onClose={() => setMode("view")} /></Section>
        ) : (
          <>
            <Section title="Status and price" action={canEditStatus && car.raw && mode === "view" ? <Button size="sm" variant="outline" onClick={() => setMode("status")}><Pencil /> Edit status and price</Button> : undefined}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Row k="Status" v={AVAILABILITY_LABEL[car.availability]} />
                {car.reservedFor.length > 0 && <Row k={car.availability === "sold" ? "Sold to" : "Reserved by"} v={`${car.reservedFor.join(", ")}${car.reservedOn ? ` · ${car.reservedOn}` : ""}`} />}
                <Row k="Price" v={peso(car.price)} />
                {car.repriced && <Row k="Original price" v={peso(car.originalPrice)} />}
                {showTarget && role !== "marketing" && <Row k="Target" v={peso(car.target)} />}
                <Row k="Arrived" v={nice(car.arrived)} /><Row k="Days in stock" v={car.daysInStock !== null ? String(car.daysInStock) : "—"} />
              </dl>
              {car.remarks && <div><p className="text-xs text-muted-foreground">Notes</p><p className="rounded-lg bg-muted p-2.5">{car.remarks}</p></div>}
            </Section>
            <Section title="Where it is">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Row k="Location" v={car.location || "—"} />
                {car.raw?.tools ? <Row k="Tools" v={car.raw.tools} /> : null}
              </dl>
            </Section>
          </>
        )}

        <Section title="Papers">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Row k="Documents" v={docs ? docs.label : "Not started"} />
            {(car.encumbrance || role !== "marketing") && <Row k="Encumbrance" v={car.encumbrance || "None"} />}
            {car.orExp && <Row k="OR expires" v={nice(car.orExp)} />}
            {car.docsCode && <Row k="Papers with" v={car.docsCode} />}
          </dl>
          {canOpenDocs && <Button variant="outline" nativeButton={false} render={<Link href={`/documents/${car.plate}`} />}>Open the car&apos;s page</Button>}
        </Section>
      </div>
    </ResponsiveDialog>
  );
}

/**
 * The details form: the same fields in the same order for every car. A closed list is a pick list; the rest are typed and shown the way they will be saved
 * (CAPITALS, 45,000 KM). A value the standard does not know stays as an extra choice, so nothing is lost by opening the form.
 */
function EditDetails({ car, suggestions, onDone }: { car: CarRow; suggestions: Partial<Record<DetailKey, string[]>>; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const rec = car.record!;
  const start0 = useMemo(() => Object.fromEntries(DETAIL_FIELDS.map((k) => {
    const listed = k === "model_variant" ? car.make : k === "color" ? car.color : k === "mileage" ? car.mileage : k === "fuel" ? car.fuel : null;
    const value = listed || rec[k] || "";
    return [k, k === "year_model" && value ? fullYear(value) : value]; // the year is typed in full (2016) and kept as two digits
  })) as Record<DetailKey, string>, [car, rec]);
  const [v, setV] = useState<Record<DetailKey, string>>(start0);
  const [serverErrors, setServerErrors] = useState<Partial<Record<DetailKey, string>>>({});
  const checks = useMemo(() => Object.fromEntries(DETAIL_FIELDS.map((k) => [k, FIELD_BY_KEY.get(k)!.check(v[k])])) as Record<DetailKey, Checked>, [v]);
  const bad = DETAIL_FIELDS.filter((k) => !checks[k].ok);
  // a field is saved when its value differs from the car record's, or when the price list keeps its own (older) copy that this save should replace
  const listed = (k: DetailKey) => (k === "model_variant" ? car.make : k === "color" ? car.color : k === "mileage" ? car.mileage : k === "fuel" ? car.fuel : "");
  const changed = DETAIL_FIELDS.filter((k) => { const c = checks[k]; return c.ok && (c.value !== (rec[k]?.trim() || null) || !!listed(k)); });
  const set = (k: DetailKey, value: string) => { setV((x) => ({ ...x, [k]: value })); setServerErrors((e) => ({ ...e, [k]: undefined })); };

  const save = () => start(async () => {
    const patch: Partial<Record<DetailKey, string>> = {};
    for (const k of changed) patch[k] = v[k];
    const r = await updateCarDetailsAction(car.plate, patch);
    if (r.ok) { toast.success(r.message); router.refresh(); onDone(); } else { toast.error(r.error); if (r.fields) setServerErrors(r.fields); }
  });

  const field = (k: DetailKey) => {
    const std = FIELD_BY_KEY.get(k)!, c = checks[k], err = serverErrors[k] ?? (c.ok ? null : c.error), saved = c.ok ? c.value : null;
    const listId = `dl-${k}`;
    return (
      <div key={k} className="space-y-1">
        <Label htmlFor={`d-${k}`}>{std.label}</Label>
        {std.options ? (
          <NativeSelect id={`d-${k}`} value={saved ?? ""} onChange={(e) => set(k, e.target.value)} aria-invalid={!!err}>
            <option value="">(not set)</option>
            {saved && !std.options.includes(saved) && <option value={saved}>{saved}</option>}
            {c.ok === false && v[k] && <option value={v[k]}>{v[k]} (not standard)</option>}
            {std.options.map((o) => <option key={o} value={o}>{k === "spare_key" ? std.show(o) : o}</option>)}
          </NativeSelect>
        ) : (
          <>
            <Input id={`d-${k}`} value={v[k]} onChange={(e) => set(k, e.target.value)} placeholder={std.hint} list={suggestions[k]?.length ? listId : undefined} aria-invalid={!!err} inputMode={k === "mileage" || k === "year_model" ? "numeric" : undefined} />
            {suggestions[k]?.length ? <datalist id={listId}>{suggestions[k]!.map((s) => <option key={s} value={s} />)}</datalist> : null}
          </>
        )}
        {err ? <p className="text-xs text-destructive">{err}</p> : saved && saved !== v[k].trim() ? <p className="text-xs text-muted-foreground">Will be saved as <b className="text-foreground">{std.show(saved)}</b></p> : <p className="text-xs text-muted-foreground">{std.options ? "Pick one." : `Example: ${std.hint}`}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {GROUPS.map((g) => (
        <fieldset key={g.title} className="space-y-3">
          <legend className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.title}</legend>
          <div className="grid gap-4 sm:grid-cols-2">{g.keys.map(field)}</div>
        </fieldset>
      ))}
      <p className="text-xs text-muted-foreground">Every car follows the same formats, so the list reads the same everywhere. What you save here is the one value shown on every screen.</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending || bad.length > 0 || changed.length === 0} onClick={save}>{pending && <Loader2 className="animate-spin" />} Save the details</Button>
        <Button variant="ghost" disabled={pending} onClick={onDone}>Cancel</Button>
        {changed.length > 0 && <span className="self-center text-xs text-muted-foreground">{changed.length} {changed.length === 1 ? "change" : "changes"}</span>}
      </div>
    </div>
  );
}
