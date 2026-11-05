"use client";

import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { FileText, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProofFile } from "@/lib/deal/types";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;

/** Attach proof (a photo of the cash or check, a bank receipt, a screenshot). Files go straight to private storage. */
export function ProofBox({ id, userId, files, onChange, label, hint, need }: {
  id: string; userId: string; files: ProofFile[]; onChange: (files: ProofFile[]) => void; label: string; hint: string; need: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    const added: ProofFile[] = [];
    try {
      for (const original of Array.from(list)) {
        const isImage = original.type.startsWith("image/"), isPdf = original.type === "application/pdf";
        if (!isImage && !isPdf) throw new Error("Attach a photo, a screenshot or a PDF.");
        if (original.size > 40 * 1024 * 1024) throw new Error("That file is too large.");
        const file = isImage ? await imageCompression(original, { maxWidthOrHeight: 1800, initialQuality: 0.8, maxSizeMB: 1.5, fileType: "image/jpeg", useWebWorker: true }) : original;
        if (file.size > MAX_BYTES) throw new Error("That file is too large (10 MB at most).");
        const safe = original.name.replace(/[^\w.-]+/g, "_").slice(-60) || "proof";
        const path = `${userId}/${crypto.randomUUID()}-${safe}`;
        const { error: upErr } = await createClient().storage.from("payment-proofs").upload(path, file, { contentType: file.type || "image/jpeg" });
        if (upErr) throw new Error("Could not upload the file. Check the connection and try again.");
        added.push({ path, filename: original.name, mime: file.type || "image/jpeg", size: file.size, previewUrl: isImage ? URL.createObjectURL(file) : undefined });
      }
      onChange([...files, ...added]);
    } catch (e) {
      if (added.length) onChange([...files, ...added]);
      setError(e instanceof Error ? e.message : "Could not attach the file.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div id={id} tabIndex={-1} className={cn("rounded-lg border border-dashed p-2.5", need ? "border-destructive bg-destructive/5" : "border-ring/60")}>
      <div className="flex flex-wrap items-center gap-3">
        <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => void add(e.target.files)} />
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Loader2 className="animate-spin" /> : <Plus />}{label}</Button>
        <span className="text-xs text-muted-foreground">{hint}</span>
        <span className={cn("ml-auto text-xs font-medium", files.length ? "text-emerald-700" : need ? "text-destructive" : "text-muted-foreground")}>{files.length ? `✓ ${files.length} attached` : need ? "Required" : ""}</span>
      </div>
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={f.path} className="relative w-24 overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10">
              {f.previewUrl ? // eslint-disable-next-line @next/next/no-img-element
              <img src={f.previewUrl} alt="" className="h-16 w-full object-cover" /> : <span className="grid h-16 place-items-center text-muted-foreground"><FileText className="size-5" aria-hidden /></span>}
              <p className="truncate px-1.5 py-0.5 text-[11px]" title={f.filename}>{f.filename}</p>
              <button type="button" aria-label={`Remove ${f.filename}`} onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/65 text-white"><X className="size-3" aria-hidden /></button>
            </div>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
