"use client";

import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { Camera, Check, CircleAlert, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOC_LABELS, type DocType } from "@/lib/docs/types";
import type { SalesView } from "@/lib/docs/sales";
import { lookupCarAction } from "./actions";

interface Target { plate: string; display: string; folderName: string | null; buyer: string; dealNo: string; linked: boolean }
interface PhotoResult { name: string; state: "sending" | "done" | "error"; types: string[]; flags: string[]; message?: string }

/** Plate → confirm the car and buyer → photos. Each photo is filed in that car's folder, read, and the list below updates. */
export function UploadFlow({ targets }: { targets: Target[] }) {
  const [plate, setPlate] = useState("");
  const [view, setView] = useState<SalesView | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoResult[]>([]);
  const input = useRef<HTMLInputElement>(null);

  async function find() {
    setLooking(true); setError(null); setView(null); setConfirmed(false); setPhotos([]);
    const r = await lookupCarAction(plate);
    if (r.ok) setView(r.view); else setError(r.message);
    setLooking(false);
  }

  async function send(list: FileList | null) {
    if (!list?.length || !view) return;
    const files = Array.from(list);
    setPhotos((p) => [...files.map((f) => ({ name: f.name, state: "sending" as const, types: [], flags: [] })), ...p]);
    for (const original of files) {
      const update = (patch: Partial<PhotoResult>) => setPhotos((p) => p.map((x) => (x.name === original.name && x.state === "sending" ? { ...x, ...patch } : x)));
      try {
        if (!original.type.startsWith("image/")) throw new Error("Send a photo (JPEG or PNG).");
        // document photos stay sharper than receipt proofs so small print can be read
        const file = await imageCompression(original, { maxWidthOrHeight: 2400, initialQuality: 0.85, maxSizeMB: 3, fileType: "image/jpeg", useWebWorker: true });
        const body = new FormData();
        body.set("plate", view.plate);
        body.set("file", file, "photo.jpg");
        const res = await fetch("/api/docs/upload", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { result?: { types: string[]; flags: string[]; readStatus: string }; view?: SalesView; error?: string };
        if (!res.ok || !json.result) throw new Error(json.error ?? "The upload failed. Try again.");
        if (json.view) setView(json.view);
        update({ state: "done", types: json.result.types, flags: json.result.flags, message: json.result.readStatus === "failed" ? "Saved in the folder. It could not be read, so Documentation will check it." : undefined });
      } catch (e) {
        update({ state: "error", message: e instanceof Error ? e.message : "The upload failed." });
      }
    }
    if (input.current) input.current.value = "";
  }

  const matches = plate.trim().length >= 2 ? targets.filter((t) => `${t.display} ${t.buyer}`.toLowerCase().includes(plate.trim().toLowerCase())).slice(0, 6) : [];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>1. Which car?</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-full max-w-xs space-y-1.5"><Label htmlFor="plate">Plate number</Label>
              <Input id="plate" value={plate} onChange={(e) => { setPlate(e.target.value.toUpperCase()); setView(null); setConfirmed(false); setError(null); }} onKeyDown={(e) => { if (e.key === "Enter") void find(); }} placeholder="NKF 4771" className="font-mono uppercase" autoComplete="off" /></div>
            <Button type="button" disabled={looking || plate.trim().length < 5} onClick={find}>{looking && <Loader2 className="animate-spin" />} Find the car</Button>
          </div>
          {matches.length > 0 && !view && (
            <div className="flex flex-wrap gap-1.5">{matches.map((t) => <button key={t.plate} type="button" className="rounded-full border px-3 py-1 text-sm hover:bg-muted" onClick={() => setPlate(t.display)}>{t.display} · {t.buyer}</button>)}</div>
          )}
          {error && <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{error}</p>}
          {view && (
            <div className="space-y-3 rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">Is this the car?</p>
              <p className="text-lg font-medium">{view.carName}</p>
              <p className="text-sm">Plate <b className="font-mono">{view.display}</b> · Buyer <b>{view.buyer}</b> · Deal {view.dealNo}</p>
              {confirmed ? <p className="flex items-center gap-2 text-sm text-emerald-800 dark:text-emerald-300"><Check className="size-4" /> Confirmed. Photos you take go into this car&apos;s folder.</p>
                : <div className="flex flex-wrap gap-2"><Button onClick={() => setConfirmed(true)}>Yes, this is the car</Button><Button variant="outline" onClick={() => { setView(null); setPlate(""); }}>No, search again</Button></div>}
            </div>
          )}
        </CardContent>
      </Card>

      {view && confirmed && (
        <Card>
          <CardHeader><CardTitle>2. The photos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
              {view.needs.map((n) => (
                <li key={n.key} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span className={n.present ? "text-emerald-700" : "text-amber-700"} aria-hidden>{n.present ? <Check className="size-4" /> : <X className="size-4" />}</span>
                  <span className="flex-1">{n.label}</span><span className={n.present ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}>{n.present ? "In the folder" : "Still needed"}</span>
                </li>
              ))}
            </ul>
            <input ref={input} type="file" accept="image/*" multiple capture="environment" className="sr-only" id="doc-photos" onChange={(e) => void send(e.target.files)} />
            <Button type="button" size="lg" onClick={() => input.current?.click()}><Camera /> Take or choose photos</Button>
            <p className="text-xs text-muted-foreground">One photo for each document. Keep the whole page in the picture, flat and well lit, so it can be read.</p>
            {photos.length > 0 && (
              <ul className="space-y-2" aria-live="polite">
                {photos.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="space-y-1 rounded-lg border p-3 text-sm">
                    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{p.name}</span>
                      {p.state === "sending" ? <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Filing and reading…</span>
                        : p.state === "error" ? <span className="text-destructive">Not saved</span> : <span className="text-emerald-800 dark:text-emerald-300">Saved ✓</span>}</div>
                    {p.state === "done" && <p className="text-muted-foreground">{p.types.some((t) => t !== "other") ? `Recognised as: ${p.types.filter((t) => t !== "other").map((t) => DOC_LABELS[t as DocType] ?? t).join(" and ")}` : "Not recognised. It is in the folder and Documentation will check it."}</p>}
                    {p.flags.map((f) => <p key={f} className="text-amber-800 dark:text-amber-300">{f}</p>)}
                    {p.message && <p className={p.state === "error" ? "text-destructive" : "text-muted-foreground"}>{p.message}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
