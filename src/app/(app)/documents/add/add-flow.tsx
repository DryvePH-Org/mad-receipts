"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import { Camera, CircleAlert, FolderPlus, FolderOpen, Loader2, Search, CarFront, Check } from "lucide-react";
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

interface Photo { id: number; name: string; state: "sending" | "done" | "error"; types: string[]; flags: string[]; message?: string }

/** Plate → what will happen to the folder → photos. Each photo is filed and read; when the batch ends the team is told once. */
export function AddFlow({ suggestions, initialPlate = "", botScans = false }: { suggestions: { makes: string[]; colors: string[]; models: string[] }; initialPlate?: string; botScans?: boolean }) {
  const [plate, setPlate] = useState(initialPlate);
  const [preview, setPreview] = useState<FolderPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sending, setSending] = useState(false);
  const [finished, setFinished] = useState<string | null>(null);
  const [unit, setUnit] = useState<UnitStatus | null>(null);
  const [again, setAgain] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [details, setDetails] = useState<UnitDetailsInput>({ make: "", model_variant: "", year_model: "", color: "", category: "NORMAL" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const next = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  async function check(typed: string = plate) {
    if (typed.replace(/[^A-Za-z0-9]/g, "").length < 5) { setPreview({ state: "invalid", message: "Type the whole plate number, like NKF 4771." }); return; }
    setLooking(true); setFinished(null); setPhotos([]); setSaved(null); setAgain(false); setErrors({}); setFormError(null);
    const [folder, status] = await Promise.all([previewAddAction(typed), unitStatusAction(typed)]);
    setPreview(folder); setUnit(status);
    setLooking(false);
  }

  async function send(list: FileList | null) {
    if (!list?.length || preview?.state === "invalid" || preview?.state === "several" || !preview) return;
    const files = Array.from(list);
    const batch = files.map((f) => ({ id: ++next.current, file: f }));
    setSending(true); setFinished(null);
    setPhotos((p) => [...batch.map((b) => ({ id: b.id, name: b.file.name, state: "sending" as const, types: [], flags: [] })), ...p]);
    const update = (id: number, patch: Partial<Photo>) => setPhotos((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    for (const { id, file: original } of batch) {
      try {
        if (!original.type.startsWith("image/")) throw new Error("Send a photo (JPEG or PNG).");
        const file = await imageCompression(original, { maxWidthOrHeight: 2400, initialQuality: 0.85, maxSizeMB: 3, fileType: "image/jpeg", useWebWorker: true });
        const body = new FormData();
        body.set("plate", plate);
        body.set("file", file, "photo.jpg");
        body.set("label", `doc${id}`);
        const res = await fetch("/api/docs/add", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { result?: { types: string[]; flags: string[]; readStatus: string }; error?: string };
        if (!res.ok || !json.result) throw new Error(json.error ?? "The upload failed. Try again.");
        update(id, { state: "done", types: json.result.types, flags: json.result.flags, message: json.result.readStatus === "failed" ? "Saved in the folder. It could not be read yet; it will be read again." : undefined });
      } catch (e) {
        update(id, { state: "error", message: e instanceof Error ? e.message : "The upload failed." });
      }
    }
    if (input.current) input.current.value = "";
    await finishAddAction(plate).catch(() => undefined);
    setSending(false);
    setFinished(preview.plate);
  }

  useEffect(() => { if (initialPlate) void check(initialPlate); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = preview && (preview.state === "existing" || preview.state === "new");
  const inBible = !!unit && (unit.exists && !again || !!saved);
  const set = (k: keyof UnitDetailsInput, v: string) => { setDetails((d) => ({ ...d, [k]: v })); setErrors((e) => { const { [k]: _gone, ...rest } = e; void _gone; return rest; }); };

  async function saveUnit() {
    setSaving(true); setFormError(null);
    const r = await addUnitAction(plate, details, again);
    setSaving(false);
    if (r.ok) { setSaved(r.plate); return; }
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
        <CardHeader><CardTitle>1. Which car?</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-full max-w-xs space-y-1.5"><Label htmlFor="add-plate">Plate number</Label>
              <Input id="add-plate" value={plate} autoComplete="off" autoCapitalize="characters" placeholder="e.g. NKF 4771" onChange={(e) => { setPlate(e.target.value.toUpperCase()); setPreview(null); setUnit(null); setSaved(null); setFinished(null); }} onKeyDown={(e) => { if (e.key === "Enter") void check(); }} /></div>
            <Button type="button" disabled={looking || sending} onClick={() => check()}>{looking ? <Loader2 className="animate-spin" /> : <Search />} Check</Button>
          </div>
          {preview && (preview.state === "invalid" || preview.state === "several") && <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{preview.message}</p>}
          {preview?.state === "existing" && (
            <div className="space-y-1 rounded-xl border p-4 text-sm">
              <p className="flex items-center gap-2 font-medium"><FolderOpen className="size-4" /> {preview.folderName}</p>
              <p className="text-muted-foreground">The folder already exists in {preview.location === "sold" ? "Sold units" : "Available units"}{preview.files ? `, with ${preview.files} file${preview.files === 1 ? "" : "s"}` : ""}. The photos are added to it.</p>
              {preview.location === "sold" && <p className="text-amber-800 dark:text-amber-300">This car is already in Sold units.</p>}
            </div>
          )}
          {preview?.state === "new" && (
            <div className="space-y-1 rounded-xl border p-4 text-sm">
              <p className="flex items-center gap-2 font-medium"><FolderPlus className="size-4" /> {preview.folderName}</p>
              <p className="text-muted-foreground">There is no folder for this plate yet. It will be created in Available units when you add the first photo.</p>
              {!preview.inInventory && <p className="text-amber-800 dark:text-amber-300">This plate is not in the inventory sheet, so the folder is named with the plate only.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {unit && preview && preview.state !== "invalid" && preview.state !== "several" && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CarFront className="size-5" aria-hidden /> 2. The car</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {saved ? (
              <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"><Check className="size-4" aria-hidden /> {details.year_model.slice(-2)} {details.make} {details.model_variant} ({saved}) is in the Docs Bible. Now add its photos.</p>
            ) : unit.exists && !again ? (
              <div className="space-y-2 text-sm">
                <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"><Check className="size-4" aria-hidden /> This car is already in the Docs Bible: {unit.name}.</p>
                <p className="text-muted-foreground">Add its photos below, or <button type="button" className="underline underline-offset-2" onClick={() => setAgain(true)}>this car arrived again: add it as a new arrival</button>.</p>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void saveUnit(); }}>
                <p className="text-sm text-muted-foreground">{again ? "A second arrival of this plate: the earlier one is kept." : "This plate is not in the Docs Bible yet. Type what you know about the car; * is needed. You can add the rest later."}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {field("make", "Make", { listId: "dl-make", list: suggestions.makes, placeholder: "e.g. TOYOTA" })}
                  {field("model_variant", "Model", { listId: "dl-model", list: suggestions.models, placeholder: "e.g. VIOS 1.3 E" })}
                  {field("year_model", "Year", { placeholder: "2019 or 19" })}
                  {field("color", "Color", { listId: "dl-color", list: suggestions.colors, placeholder: "e.g. WHITE" })}
                  {field("body_type", "Body type", { select: BODY_TYPES })}
                  {field("trans", "Transmission", { select: TRANSMISSIONS })}
                  {field("fuel", "Fuel", { select: FUELS })}
                  {field("mileage", "Mileage", { placeholder: "e.g. 45T KMS" })}
                  {field("reg_owner_name", "Registered owner (on the CR)")}
                  {field("buying_source", "Bought from", { select: BUYING_SOURCES })}
                  {field("spare_key", "Spare key", { select: SPARE_KEYS })}
                  {field("arrival_date", "Date it arrived", { placeholder: "today if empty" })}
                </div>
                <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">More details (optional)</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">{field("cs_no", "CS no")}{field("mo_file", "MO file")}{field("awarded_to", "Awarded to")}{field("encumbrance", "Encumbrance (bank)")}{field("category", "Category")}</div></details>
                {formError && <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{formError}</p>}
                <Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <CarFront />} Save the car</Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {ready && !inBible && unit && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Save the car first, then add its photos.</p>}
      {ready && inBible && (
        <Card>
          <CardHeader><CardTitle>3. The documents</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <input ref={input} type="file" accept="image/*" multiple className="sr-only" id="add-photos" onChange={(e) => void send(e.target.files)} />
            <Button type="button" size="lg" disabled={sending} onClick={() => input.current?.click()}>{sending ? <Loader2 className="animate-spin" /> : <Camera />} Take or choose photos of the documents</Button>
            <div className="space-y-1 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Add every paper you have, so the car is ready to scan:</p>
              <p>Every car: the official receipt (OR), the certificate of registration (CR), the seller&apos;s ID, the deed of sale from the owner, and the stencil. A bank or financed car: also the chattel mortgage cancellation or the promissory note. A company: also the secretary&apos;s certificate and the IDs.</p>
              <p>One photo for each paper, or the OR and CR together. Keep each page whole, flat and well lit. You can add more later.</p>
            </div>
            {photos.length > 0 && (
              <ul className="space-y-2" aria-live="polite">
                {photos.map((p) => (
                  <li key={p.id} className="space-y-1 rounded-lg border p-3 text-sm">
                    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{p.name}</span>
                      {p.state === "sending" ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Filing and reading…</span>
                        : p.state === "error" ? <span className="text-destructive">Not saved</span> : <span className="text-emerald-800 dark:text-emerald-300">Saved ✓</span>}</div>
                    {p.state === "done" && <p className="text-muted-foreground">{p.types.some((t) => t !== "other") ? `Read as: ${p.types.filter((t) => t !== "other").map((t) => DOC_LABELS[t as DocType] ?? t).join(", ")}` : "Not recognised. It is in the folder; the staff will check it."}</p>}
                    {p.flags.map((f) => <p key={f} className="text-amber-800 dark:text-amber-300">{f}</p>)}
                    {p.message && <p className={p.state === "error" ? "text-destructive" : "text-muted-foreground"}>{p.message}</p>}
                  </li>
                ))}
              </ul>
            )}
            {finished && <p className="flex flex-wrap items-center gap-3 text-sm">{botScans ? "The bot is scanning these documents now; open the car to follow it." : "The team has been told that these photos were scanned."} <Button size="sm" nativeButton={false} render={<Link href={`/documents/${finished}`} />}>Open this car</Button></p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
