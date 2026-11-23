"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, CircleAlert, FolderPlus, FolderOpen, Loader2, CarFront, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOC_LABELS, type DocType } from "@/lib/docs/types";
import type { FolderPreview } from "@/lib/docs/service";
import { BODY_TYPES, BUYING_SOURCES, FUELS, REQUIRED_DETAILS, SPARE_KEYS, TRANSMISSIONS, type UnitDetailsInput } from "@/lib/docsbible/add-unit";
import type { UnitStatus } from "@/lib/docsbible/add-unit-server";
import { NativeSelect } from "@/components/ui/native-select";
import { addUnitAction, finishAddAction, previewAddAction, unitStatusAction } from "../actions";
import { IMAGE_ACCEPT, prepareImage } from "../upload-photos";
import { UploadDropzone, useUploadQueue } from "../[plate]/bulk-upload";

let photoNo = 0;

/** The new car: its plate and details in one form, then the documents. Each photo is filed and read; when the batch ends the team is told once. */
export function AddFlow({ suggestions, initialPlate = "", botScans = false }: { suggestions: { makes: string[]; colors: string[]; models: string[] }; initialPlate?: string; botScans?: boolean }) {
  const [plate, setPlate] = useState(initialPlate);
  const [preview, setPreview] = useState<FolderPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [finished, setFinished] = useState<string | null>(null);
  const [unit, setUnit] = useState<UnitStatus | null>(null);
  const [again, setAgain] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [details, setDetails] = useState<UnitDetailsInput>({ make: "", model_variant: "", year_model: "", color: "", category: "NORMAL" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [staged, setStaged] = useState<File[]>([]); // documents chosen in the form: they go to Drive right after the car is saved
  const stagedInput = useRef<HTMLInputElement>(null);

  async function check(typed: string = plate) {
    if (typed.replace(/[^A-Za-z0-9]/g, "").length < 5) return;
    setLooking(true); setFinished(null); setAgain(false); setErrors({}); setFormError(null);
    const [folder, status] = await Promise.all([previewAddAction(typed), unitStatusAction(typed)]);
    setPreview(folder); setUnit(status);
    setLooking(false);
  }

  /** The photos go into the car's Drive folder (made if needed), two at a time, and the scan starts when the last one is in. */
  const queue = useUploadQueue({
    concurrency: 2,
    process: async (original) => {
      const file = await prepareImage(original);
      const body = new FormData();
      body.set("plate", plate);
      body.set("file", file, "photo.jpg");
      body.set("label", `doc${++photoNo}`);
      const res = await fetch("/api/docs/add", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { result?: { types: string[]; flags: string[]; readStatus: string }; error?: string };
      if (!res.ok || !json.result) throw new Error(json.error ?? `The upload failed (error ${res.status}). Try again.`);
      return { types: json.result.types, flags: json.result.flags, message: json.result.readStatus === "failed" ? "Saved in the folder. It could not be read yet; it will be read again." : undefined };
    },
    onFinished: async (saved) => { if (saved > 0) await finishAddAction(plate).catch(() => undefined); setFinished(plate); },
  });
  /** Photos chosen before the car was saved, or added after. */
  function send(files: File[]) { if (files.length && preview && preview.state !== "invalid" && preview.state !== "several") { setFinished(null); queue.add(files); } }
  // the plate is looked up by itself as it is typed (the folder, and whether the car is already in MAD): there is no Check button
  useEffect(() => {
    if (plate.replace(/[^A-Za-z0-9]/g, "").length < 5) { setPreview(null); setUnit(null); return; }
    const t = setTimeout(() => void check(plate), 500);
    return () => clearTimeout(t);
  }, [plate]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = preview && (preview.state === "existing" || preview.state === "new");
  const inBible = !!unit && (unit.exists && !again || !!saved);
  const set = (k: keyof UnitDetailsInput, v: string) => { setDetails((d) => ({ ...d, [k]: v })); setErrors((e) => { const { [k]: _gone, ...rest } = e; void _gone; return rest; }); };

  async function saveUnit() {
    setSaving(true); setFormError(null);
    const r = await addUnitAction(plate, details, again);
    setSaving(false);
    if (r.ok) { setSaved(r.plate); if (staged.length) { const files = staged; setStaged([]); send(files); } return; }
    setErrors(r.errors ?? {}); setFormError(r.message);
  }
  const field = (k: keyof UnitDetailsInput, label: string, opts: { list?: readonly string[]; listId?: string; placeholder?: string; select?: readonly string[] } = {}) => {
    const required = REQUIRED_DETAILS.some((r) => r.key === k);
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`u-${k}`}>{label}{required ? " *" : ""}</Label>
        {opts.select ? <NativeSelect id={`u-${k}`} value={details[k] ?? ""} onChange={(e) => set(k, e.target.value)}><option value="">Choose…</option>{opts.select.map((o) => <option key={o} value={o}>{o}</option>)}</NativeSelect>
          : <Input id={`u-${k}`} value={details[k] ?? ""} list={opts.listId} placeholder={opts.placeholder} autoComplete="off" onChange={(e) => set(k, e.target.value)} aria-invalid={!!errors[k]} />}
        {opts.listId && opts.list && <datalist id={opts.listId}>{opts.list.map((o) => <option key={o} value={o} />)}</datalist>}
        {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
      </div>
    );
  };
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CarFront className="size-5" aria-hidden /> 1. The new car</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="add-plate">Plate number *</Label>
            <div className="relative">
              <Input id="add-plate" value={plate} autoComplete="off" autoCapitalize="characters" placeholder="e.g. NKF 4771" className="pr-9" onChange={(e) => { setPlate(e.target.value.toUpperCase()); setSaved(null); setFinished(null); }} />
              {looking && <Loader2 className="absolute top-2.5 right-3 size-4 animate-spin text-muted-foreground" aria-label="Looking" />}
            </div>
          </div>
          {preview && (preview.state === "invalid" || preview.state === "several") && <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{preview.message}</p>}
          {preview?.state === "existing" && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><FolderOpen className="size-4" aria-hidden /> A folder already exists for this plate ({preview.folderName}) in {preview.location === "sold" ? "Sold units" : "Available units"}{preview.files ? `, with ${preview.files} file${preview.files === 1 ? "" : "s"}` : ""}. The documents are added to it.{preview.location === "sold" && <span className="text-amber-800 dark:text-amber-300"> This car is already in Sold units.</span>}</p>
          )}
          {preview?.state === "new" && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><FolderPlus className="size-4" aria-hidden /> There is no folder for this plate yet: {preview.folderName} is made in Available units when you add the first photo.{!preview.inInventory && <span className="text-amber-800 dark:text-amber-300"> The plate is not in the inventory sheet, so the folder is named with the plate only.</span>}</p>
          )}
          {saved ? (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"><Check className="size-4" aria-hidden /> {details.year_model.slice(-2)} {details.make} {details.model_variant} ({saved}) is in MAD.{staged.length === 0 && queue.items.length === 0 ? " Now add its documents." : ""}</p>
          ) : unit?.exists && !again ? (
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"><Check className="size-4" aria-hidden /> This car is already in MAD: {unit.name}.</p>
              <p className="text-muted-foreground">Add its documents below, or <button type="button" className="underline underline-offset-2" onClick={() => setAgain(true)}>this car arrived again: add it as a new arrival</button>.</p>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void saveUnit(); }}>
              <p className="text-sm text-muted-foreground">{again ? "A second arrival of this plate: the earlier one is kept." : unit ? "This plate is not in MAD yet." : "Type the plate, then the car's details."} Only the plate, make, model, year and color are needed (*). The rest can be filled in later.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {field("make", "Make", { listId: "dl-make", list: suggestions.makes, placeholder: "e.g. TOYOTA" })}
                {field("model_variant", "Model", { listId: "dl-model", list: suggestions.models, placeholder: "e.g. VIOS 1.3 E" })}
                {field("year_model", "Year", { placeholder: "2019 or 19" })}
                {field("color", "Color", { listId: "dl-color", list: suggestions.colors, placeholder: "e.g. WHITE" })}
              </div>
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <p className="font-medium">Documents (photos of the papers)</p>
                <p className="text-xs text-muted-foreground">Choose them now and they go into the car&apos;s Google Drive folder, and are scanned, as soon as you save the car. Or add them after saving.</p>
                <input ref={stagedInput} type="file" accept={IMAGE_ACCEPT} multiple className="sr-only" id="staged-photos" onChange={(e) => { const chosen = Array.from(e.target.files ?? []); setStaged((s) => [...s, ...chosen]); e.target.value = ""; }} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => stagedInput.current?.click()}><Camera /> Choose photos</Button>
                  {staged.length > 0 && <span className="text-muted-foreground">{staged.length} {staged.length === 1 ? "photo" : "photos"} chosen</span>}
                  {staged.length > 0 && <button type="button" className="text-xs underline underline-offset-2" onClick={() => setStaged([])}>Clear</button>}
                </div>
              </div>
              <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">More about the car (optional, can be filled in later)</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {field("body_type", "Body type", { select: BODY_TYPES })}
                  {field("trans", "Transmission", { select: TRANSMISSIONS })}
                  {field("fuel", "Fuel", { select: FUELS })}
                  {field("mileage", "Mileage", { placeholder: "e.g. 45T KMS" })}
                  {field("reg_owner_name", "Registered owner (on the CR)")}
                  {field("buying_source", "Bought from", { select: BUYING_SOURCES })}
                  {field("spare_key", "Spare key", { select: SPARE_KEYS })}
                  {field("arrival_date", "Date it arrived", { placeholder: "today if empty" })}
                  {field("cs_no", "CS no")}{field("mo_file", "MO file")}{field("awarded_to", "Awarded to")}{field("encumbrance", "Encumbrance (bank)")}{field("category", "Category")}
                </div></details>
              {formError && <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{formError}</p>}
              <Button type="submit" disabled={saving || plate.replace(/[^A-Za-z0-9]/g, "").length < 5}>{saving ? <Loader2 className="animate-spin" /> : <CarFront />} {staged.length ? `Save the car and upload ${staged.length} ${staged.length === 1 ? "document" : "documents"}` : "Save the car"}</Button>
            </form>
          )}
        </CardContent>
      </Card>

      {ready && !inBible && unit && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Save the car first, then add its documents.</p>}
      {ready && inBible && (
        <Card>
          <CardHeader><CardTitle>2. The documents</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <UploadDropzone queue={queue} label="photos of the documents" inputId="add-photos" lines={(i) => (
              <p className="text-muted-foreground">{i.types?.some((t) => t !== "other") ? `Read as: ${i.types.filter((t) => t !== "other").map((t) => DOC_LABELS[t as DocType] ?? t).join(", ")}` : "Not recognised. It is in the folder; you can say what it is on the car's page."}</p>
            )} />
            <div className="space-y-1 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Add every paper you have, so the car is ready to scan:</p>
              <p>Every car: the official receipt (OR), the certificate of registration (CR), the seller&apos;s ID, the deed of sale from the owner, and the stencil. A bank or financed car: also the chattel mortgage cancellation or the promissory note. A company: also the secretary&apos;s certificate and the IDs.</p>
              <p>One photo for each paper, or the OR and CR together. Keep each page whole, flat and well lit. You can add more later.</p>
            </div>
            {finished && <p className="flex flex-wrap items-center gap-3 text-sm">{botScans ? "The bot is scanning these documents now; open the car to follow it." : "The team has been told that these photos were scanned."} <Button size="sm" nativeButton={false} render={<Link href={`/documents/${finished}`} />}>Open this car</Button></p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
