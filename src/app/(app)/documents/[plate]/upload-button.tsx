"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DOC_LABELS, type DocType } from "@/lib/docs/types";
import { newPhotoStates, uploadPhotos, type PhotoState } from "../upload-photos";

/** Choose photos and they go straight into this car's Drive folder; the scan starts when the last one is in. */
export function UploadButton({ plate, botScans }: { plate: string; botScans: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<PhotoState[]>([]);

  async function send(files: FileList | null) {
    if (!files?.length) return;
    const batch = newPhotoStates(Array.from(files));
    setBusy(true); setList(batch.map((b) => b.state));
    const saved = await uploadPhotos(plate, batch, (id, patch) => setList((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x))));
    if (input.current) input.current.value = "";
    setBusy(false);
    if (saved) toast.success(`${saved} ${saved === 1 ? "photo" : "photos"} put in the car's folder.${botScans ? " The bot is scanning them." : ""}`); else toast.error("No photo could be saved.");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input ref={input} type="file" accept="image/*" multiple className="sr-only" id="car-upload" onChange={(e) => void send(e.target.files)} />
      <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="animate-spin" /> : <Camera />} Upload documents</Button>
      {list.length > 0 && (
        <ul className="w-full max-w-sm space-y-1 text-xs" aria-live="polite">
          {list.map((p) => <li key={p.id} className="flex items-center gap-2 rounded border px-2 py-1"><span className="min-w-0 flex-1 truncate">{p.name}</span>{p.state === "sending" ? <Loader2 className="size-3 animate-spin" aria-label="Sending" /> : p.state === "error" ? <span className="text-destructive" title={p.message}>Not saved</span> : <span className="text-emerald-800 dark:text-emerald-300" title={p.types.map((t) => DOC_LABELS[t as DocType] ?? t).join(", ")}>Saved ✓</span>}</li>)}
        </ul>
      )}
    </div>
  );
}
