"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { isHeic, toJpeg } from "../upload-photos";
import { Camera, Check, CircleAlert, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DOC_LABELS, type DocType } from "@/lib/docs/types";

interface PhotoResult { name: string; state: "sending" | "done" | "error"; types: string[]; flags: string[]; message?: string }

/** After the sale: the signed AR, the buyer's ID and the deed go into the car's folder from here, and the checklist updates. */
export function SoldUploadCard({ plate, items, deal }: { plate: string; items: { key: string; label: string; present: boolean }[]; deal: { dealNo: string; buyerName: string } | null }) {
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
        body.set("file", file, "photo.jpg");
        const res = await fetch("/api/docs/upload", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { result?: { types: string[]; flags: string[]; readStatus: string }; error?: string };
        if (!res.ok || !json.result) throw new Error(json.error ?? "The upload failed. Try again.");
        update({ state: "done", types: json.result.types, flags: json.result.flags, message: json.result.readStatus === "failed" ? "Saved in the folder. It could not be read, so Documentation will check it." : undefined });
      } catch (e) {
        update({ state: "error", message: e instanceof Error ? e.message : "The upload failed." });
      }
    }
    if (input.current) input.current.value = "";
    setSending(false);
    router.refresh();
  }

  return (
    <Card id="sold-upload">
      {deal && <CardHeader><CardTitle>Sold papers</CardTitle></CardHeader>}
      <CardContent className={deal ? "space-y-4 text-sm" : "py-3 text-sm"}>
        {!deal ? <p className="flex gap-2 text-muted-foreground"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><span><b className="font-medium text-foreground">Sold papers:</b> no AR has been made for this car yet. They can be added once it is sold and an AR exists.</span></p> : (
          <>
            <p className="text-muted-foreground">Buyer <b className="text-foreground">{deal.buyerName}</b> · AR {deal.dealNo}. Take a photo of each paper: it goes into this car&apos;s folder and is read.</p>
            <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
              {items.map((n) => (
                <li key={n.key} className="flex items-center gap-3 px-3 py-2.5">
                  <span className={n.present ? "text-emerald-700" : "text-amber-700"} aria-hidden>{n.present ? <Check className="size-4" /> : <X className="size-4" />}</span>
                  <span className="flex-1">{n.label}</span><span className={n.present ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}>{n.present ? "In the folder" : "Still needed"}</span>
                </li>
              ))}
            </ul>
            <input ref={input} type="file" accept="image/*" multiple capture="environment" className="sr-only" id="doc-photos" onChange={(e) => void send(e.target.files)} />
            <Button type="button" size="lg" disabled={sending} onClick={() => input.current?.click()}>{sending ? <Loader2 className="animate-spin" /> : <Camera />} Take or choose photos</Button>
            <p className="text-xs text-muted-foreground">One photo for each document. Keep the whole page in the picture, flat and well lit, so it can be read.</p>
            {photos.length > 0 && (
              <ul className="space-y-2" aria-live="polite">
                {photos.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="space-y-1 rounded-lg border p-3">
                    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{p.name}</span>
                      {p.state === "sending" ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Filing and reading…</span> : p.state === "error" ? <span className="text-destructive">Not saved</span> : <span className="text-emerald-800 dark:text-emerald-300">Saved ✓</span>}</div>
                    {p.state === "done" && <p className="text-muted-foreground">{p.types.some((t) => t !== "other") ? `Recognised as: ${p.types.filter((t) => t !== "other").map((t) => DOC_LABELS[t as DocType] ?? t).join(" and ")}` : "Not recognised. It is in the folder and Documentation will check it."}</p>}
                    {p.flags.map((f) => <p key={f} className="text-amber-800 dark:text-amber-300">{f}</p>)}
                    {p.message && <p className={p.state === "error" ? "text-destructive" : "text-muted-foreground"}>{p.message}</p>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
