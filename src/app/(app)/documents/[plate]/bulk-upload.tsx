"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, CircleAlert, FolderUp, Loader2, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IMAGE_ACCEPT } from "../upload-photos";

export interface QueueResult { message?: string; types?: string[]; flags?: string[] }
export interface QueueItem { id: number; file: File; preview: string | null; status: "queued" | "working" | "done" | "error"; message?: string; types?: string[]; flags?: string[] }

const MAX_FILES = 60;
let counter = 0;
const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * A queue of files sent one or two at a time: any number of files can be added (a whole folder of photos), each is prepared and sent in turn, and
 * every file says how it went. A failed one can be sent again; nothing is lost when one fails. `process` sends one file and says what came of it.
 */
export function useUploadQueue({ process, concurrency = 2, onFinished }: { process: (file: File) => Promise<QueueResult>; concurrency?: number; onFinished?: (saved: number, failed: number) => void }) {
  // the queue lives in a ref (one truth, no surprises when React renders twice); the state is a copy for the screen
  const queue = useRef<QueueItem[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const running = useRef(0);
  const batch = useRef({ active: false, saved: 0 });
  const processRef = useRef(process);
  const finishedRef = useRef(onFinished);
  useEffect(() => { processRef.current = process; finishedRef.current = onFinished; });
  const sync = () => setItems(queue.current.slice());
  const update = (id: number, p: Partial<QueueItem>) => { queue.current = queue.current.map((x) => (x.id === id ? { ...x, ...p } : x)); sync(); };
  // the pictures made for the small previews are released when the screen closes
  useEffect(() => () => queue.current.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)), []);

  const pump = useCallback(() => {
    while (running.current < concurrency) {
      const next = queue.current.find((i) => i.status === "queued");
      if (!next) break;
      running.current++;
      update(next.id, { status: "working" });
      void (async () => {
        try {
          const r = await processRef.current(next.file);
          batch.current.saved++;
          update(next.id, { status: "done", message: r.message, types: r.types, flags: r.flags });
        } catch (e) {
          update(next.id, { status: "error", message: e instanceof Error ? e.message : "The upload failed." });
        } finally {
          running.current--;
          pump();
        }
      })();
    }
    // the whole batch is settled: tell the screen once (it refreshes, and the scan of the batch starts)
    if (running.current === 0 && batch.current.active && !queue.current.some((i) => i.status === "queued" || i.status === "working")) {
      const { saved } = batch.current;
      batch.current = { active: false, saved: 0 };
      finishedRef.current?.(saved, queue.current.filter((i) => i.status === "error").length);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concurrency]);

  const add = useCallback((files: File[]) => {
    const have = new Set(queue.current.map((i) => `${i.file.name}|${i.file.size}`));
    const fresh: QueueItem[] = [];
    for (const file of files.slice(0, Math.max(0, MAX_FILES - queue.current.length))) {
      const key = `${file.name}|${file.size}`;
      if (have.has(key)) continue; // the same file twice
      have.add(key);
      fresh.push({ id: ++counter, file, preview: file.type.startsWith("image/") && !/hei[cf]$/i.test(file.type) ? URL.createObjectURL(file) : null, status: "queued" });
    }
    if (!fresh.length) return;
    queue.current = [...queue.current, ...fresh];
    batch.current.active = true;
    sync();
    pump();
  }, [pump]);

  const retry = useCallback(() => { queue.current = queue.current.map((i) => (i.status === "error" ? { ...i, status: "queued" as const, message: undefined } : i)); batch.current.active = true; sync(); pump(); }, [pump]);
  const retryOne = useCallback((id: number) => { update(id, { status: "queued", message: undefined }); batch.current.active = true; pump(); }, [pump]); // eslint-disable-line react-hooks/exhaustive-deps
  const clearFinished = useCallback(() => { queue.current.filter((i) => i.status === "done").forEach((i) => i.preview && URL.revokeObjectURL(i.preview)); queue.current = queue.current.filter((i) => i.status !== "done"); sync(); }, []);
  const busy = items.some((i) => i.status === "queued" || i.status === "working");
  return { items, add, retry, retryOne, clearFinished, busy, max: MAX_FILES };
}

/**
 * Where files are added: drop them on the box, choose any number of them, or take a photo (on a phone). Under it, the queue: a small picture, the name and size,
 * and how each one is going, with a progress bar for the whole batch.
 */
export function UploadDropzone({ queue, accept = IMAGE_ACCEPT, label = "photos", inputId, lines }: {
  queue: ReturnType<typeof useUploadQueue>; accept?: string; label?: string; inputId?: string;
  /** what to say under a file that was saved (what it was read as, the warnings) */
  lines?: (i: QueueItem) => React.ReactNode;
}) {
  const choose = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const { items } = queue;
  const done = items.filter((i) => i.status === "done").length, failed = items.filter((i) => i.status === "error").length;
  const take = (list: FileList | null) => { if (list?.length) queue.add(Array.from(list)); };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-5 text-center transition ${over ? "border-primary bg-primary/5" : "border-muted-foreground/30"}`}
      >
        <FolderUp className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm"><b className="font-medium">Drop {label} here</b><span className="text-muted-foreground"> or choose as many as you like (up to {queue.max} at a time).</span></p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <input ref={choose} id={inputId} type="file" accept={accept} multiple className="sr-only" aria-label={`Choose ${label}`} onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
          <Button type="button" size="lg" onClick={() => choose.current?.click()}><FolderUp /> Choose files</Button>
          <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Take a photo" onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
          <Button type="button" size="lg" variant="outline" className="hidden pointer-coarse:inline-flex" onClick={() => camera.current?.click()}><Camera /> Take a photo</Button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span role="status" aria-live="polite" className="font-medium">{queue.busy ? `Saving… ${done} of ${items.length}` : failed ? `${done} saved, ${failed} did not go through` : `All ${done} saved`}</span>
            <span className="ml-auto flex gap-2">
              {failed > 0 && !queue.busy && <Button size="sm" variant="outline" onClick={queue.retry}><RotateCw /> Send the {failed} again</Button>}
              {done > 0 && !queue.busy && <Button size="sm" variant="ghost" onClick={queue.clearFinished}>Clear the saved ones</Button>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done + failed}><div className={`h-full transition-all ${failed ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${Math.round(((done + failed) / items.length) * 100)}%` }} /></div>
          <ul className="space-y-2" aria-label="Upload queue">
            {items.map((i) => (
              <li key={i.id} className="flex items-start gap-3 rounded-lg border p-2.5 text-sm">
                <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded bg-muted text-xs text-muted-foreground">
                  {i.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.preview} alt="" className="size-11 object-cover" />
                  ) : "PDF"}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{i.file.name}</span><span className="shrink-0 text-xs text-muted-foreground">{kb(i.file.size)}</span></p>
                  {i.status === "queued" && <p className="text-muted-foreground">Waiting…</p>}
                  {i.status === "working" && <p className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Filing and reading…</p>}
                  {i.status === "done" && <><p className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300"><Check className="size-3.5" aria-hidden /> Saved ✓</p>{lines?.(i)}{i.message && <p className="text-muted-foreground">{i.message}</p>}</>}
                  {i.status === "error" && <p className="flex flex-wrap items-center gap-x-2 text-destructive"><X className="size-3.5" aria-hidden /> Not saved<span className="text-xs">{i.message}</span> <button type="button" className="text-xs underline underline-offset-2" onClick={() => queue.retryOne(i.id)}>Try again</button></p>}
                  {i.flags?.map((f) => <p key={f} className="flex gap-1.5 text-amber-800 dark:text-amber-300"><CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />{f}</p>)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
