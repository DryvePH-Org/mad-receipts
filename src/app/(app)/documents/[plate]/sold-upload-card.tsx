"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { isHeic, toJpeg } from "../upload-photos";
import { Camera, Check, Download, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DOC_LABELS, type DocType } from "@/lib/docs/types";

interface PhotoResult { name: string; state: "sending" | "done" | "error"; types: string[]; flags: string[]; message?: string }
/** One line of the after-sale checklist. The signed AR can have several files: every AR that was uploaded is listed under it. */
export interface OutItem { key: string; label: string; present: boolean; files: { id: string; name: string; note: string | null; by?: string | null; at?: string }[] }

/**
 * The OUT documents, after the sale: one place to upload them (photos of the signed AR, the buyer's ID and the deed, in any order) and the checklist of
 * what is in. Every AR that is uploaded falls under the signed AR line. A car with no sale yet takes its sale from the first AR.
 */
export function SoldUploadCard({ plate, items, buyer, canUpload = true }: { plate: string; items: OutItem[]; buyer: string | null; canUpload?: boolean }) {
  const router = useRouter();
  const [photos, setPhotos] = useState<PhotoResult[]>([]);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function send(list: FileList | null) {
    if (!list?.length) return;
    const files = Array.from(list);
    setSending(true);
    setPhotos((p) => [...files.map((f) => ({ name: f.name, state: "sending" as const, types: [], flags: [] })), ...p]);
    for (const original of files) {
      const update = (patch: Partial<PhotoResult>) => setPhotos((p) => p.map((x) => (x.name === original.name && x.state === "sending" ? { ...x, ...patch } : x)));
      try {
        const heic = isHeic(original);
        if (!heic && !original.type.startsWith("image/")) throw new Error("Send a photo (JPEG or PNG).");
        const file = await imageCompression(heic ? await toJpeg(original) : original, { maxWidthOrHeight: 2400, initialQuality: 0.85, maxSizeMB: 3, fileType: "image/jpeg", useWebWorker: true });
        const body = new FormData();
        body.set("plate", plate);
        body.set("ar", "1"); // the first AR of a car with no sale makes the sale
        body.set("file", file, "photo.jpg");
        const res = await fetch("/api/docs/upload", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { result?: { types: string[]; flags: string[]; readStatus: string }; error?: string };
        if (!res.ok || !json.result) throw new Error(json.error ?? "The upload failed. Try again.");
        update({ state: "done", types: json.result.types, flags: json.result.flags, message: json.result.readStatus === "pending" ? "Saved. The bot is reading it; it appears in the list in a minute." : json.result.readStatus === "failed" ? "Saved in the folder. It could not be read, so Buying will check it." : undefined });
      } catch (e) {
        update({ state: "error", message: e instanceof Error ? e.message : "The upload failed." });
      }
    }
    if (input.current) input.current.value = "";
    setSending(false);
    router.refresh();
  }

  const have = items.filter((i) => i.present).length;
  return (
    <Card id="sold-upload">
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">After-sale documents
        <span className="text-sm font-normal text-muted-foreground">{have} of {items.length} in</span></CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">{buyer ? <>Buyer <b className="text-foreground">{buyer}</b>. </> : <>No sale is recorded yet: the first AR you upload makes it. </>}Take a photo of each paper; it goes into this car&apos;s folder, is read, and falls into the list below. Every AR that is uploaded is listed under the signed AR.</p>
        <ul className="divide-y rounded-lg ring-1 ring-foreground/10" aria-label="After-sale documents">
          {items.map((n) => (
            <li key={n.key} className="px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className={n.present ? "text-emerald-700" : "text-amber-700"} aria-hidden>{n.present ? <Check className="size-4" /> : <X className="size-4" />}</span>
                <span className="flex-1">{n.label}</span>
                <span className={n.present ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}>{n.present ? (n.files.length > 1 ? `${n.files.length} in the folder` : "In the folder") : "Still needed"}</span>
              </div>
              {n.files.length > 0 && (
                <ul className="mt-2 space-y-1 pl-7">
                  {n.files.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <a href={`/api/docs/file/${f.id}`} target="_blank" rel="noreferrer" aria-label={`Open ${f.name}`} className="block size-9 shrink-0 overflow-hidden rounded bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/docs/file/${f.id}`} alt="" loading="lazy" className="size-9 object-cover" />
                      </a>
                      <span className="min-w-0 flex-1"><span className="block truncate">{f.note ?? f.name}</span><span className="block text-muted-foreground">{f.by ? `Added by ${f.by}` : "In the folder"}{f.at ? ` · ${new Date(f.at).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })}` : ""}</span></span>
                      <a href={`/api/docs/file/${f.id}?download=1`} download className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:underline"><Download className="size-3.5" aria-hidden /> Download</a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {canUpload ? (
          <>
            <input ref={input} type="file" accept="image/*" multiple capture="environment" className="sr-only" id="doc-photos" aria-label="Photos of the after-sale documents" onChange={(e) => void send(e.target.files)} />
            <Button type="button" size="lg" disabled={sending} onClick={() => input.current?.click()}>{sending ? <Loader2 className="animate-spin" /> : <Camera />} Take or choose photos</Button>
            <p className="text-xs text-muted-foreground">One photo for each document, in any order. Keep the whole page in the picture, flat and well lit, so it can be read.</p>
          </>
        ) : null}
        {photos.length > 0 && (
          <ul className="space-y-2" aria-live="polite">
            {photos.map((p, i) => (
              <li key={`${p.name}-${i}`} className="space-y-1 rounded-lg border p-3">
                <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.state === "sending" ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Filing and reading…</span> : p.state === "error" ? <span className="text-destructive">Not saved</span> : <span className="text-emerald-800 dark:text-emerald-300">Saved ✓</span>}</div>
                {p.state === "done" && <p className="text-muted-foreground">{p.types.some((t) => t !== "other") ? `Recognised as: ${p.types.filter((t) => t !== "other").map((t) => DOC_LABELS[t as DocType] ?? t).join(" and ")}` : "Not recognised. It is in the folder; Buying will check what it is."}</p>}
                {p.flags.map((f) => <p key={f} className="text-amber-800 dark:text-amber-300">{f}</p>)}
                {p.message && <p className={p.state === "error" ? "text-destructive" : "text-muted-foreground"}>{p.message}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
