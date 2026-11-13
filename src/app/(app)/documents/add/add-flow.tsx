"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import { Camera, CircleAlert, FolderPlus, FolderOpen, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOC_LABELS, type DocType } from "@/lib/docs/types";
import type { FolderPreview } from "@/lib/docs/service";
import { finishAddAction, previewAddAction } from "../actions";

interface Photo { id: number; name: string; state: "sending" | "done" | "error"; types: string[]; flags: string[]; message?: string }

/** Plate → what will happen to the folder → photos. Each photo is filed and read; when the batch ends the team is told once. */
export function AddFlow() {
  const [plate, setPlate] = useState("");
  const [preview, setPreview] = useState<FolderPreview | null>(null);
  const [looking, setLooking] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sending, setSending] = useState(false);
  const [finished, setFinished] = useState<string | null>(null);
  const next = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  async function check() {
    if (plate.replace(/[^A-Za-z0-9]/g, "").length < 5) { setPreview({ state: "invalid", message: "Type the whole plate number, like NKF 4771." }); return; }
    setLooking(true); setFinished(null); setPhotos([]);
    setPreview(await previewAddAction(plate));
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

  const ready = preview && (preview.state === "existing" || preview.state === "new");
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>1. Which car?</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-full max-w-xs space-y-1.5"><Label htmlFor="add-plate">Plate number</Label>
              <Input id="add-plate" value={plate} autoComplete="off" autoCapitalize="characters" placeholder="e.g. NKF 4771" onChange={(e) => { setPlate(e.target.value.toUpperCase()); setPreview(null); setFinished(null); }} onKeyDown={(e) => { if (e.key === "Enter") void check(); }} /></div>
            <Button type="button" disabled={looking || sending} onClick={check}>{looking ? <Loader2 className="animate-spin" /> : <Search />} Check</Button>
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

      {ready && (
        <Card>
          <CardHeader><CardTitle>2. The photos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <input ref={input} type="file" accept="image/*" multiple className="sr-only" id="add-photos" onChange={(e) => void send(e.target.files)} />
            <Button type="button" size="lg" disabled={sending} onClick={() => input.current?.click()}>{sending ? <Loader2 className="animate-spin" /> : <Camera />} Take or choose photos</Button>
            <p className="text-xs text-muted-foreground">One photo for each document, or the OR and CR together. You can add more later, one at a time or many at once. Keep each page whole, flat and well lit.</p>
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
            {finished && <p className="flex flex-wrap items-center gap-3 text-sm">The team has been told that these photos were scanned. <Button size="sm" nativeButton={false} render={<Link href={`/documents/${finished}`} />}>Open this car</Button></p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
