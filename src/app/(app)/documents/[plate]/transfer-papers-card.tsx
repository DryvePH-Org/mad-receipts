"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Download, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { AskDialog } from "@/components/shared/ask-dialog";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { placeFiles, TRANSFER_PAPERS, TRANSFER_TAGS, transferProgress } from "@/lib/docs/transfer-papers";
import { deleteArchiveFileAction } from "../actions";
import { prepareImage } from "../upload-photos";

export interface TransferPaperFile { id: string; name: string; tag: string; addedAt: string; by: string | null }

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf";
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/**
 * The papers handed to the new owner when the transfer is done: OR, CR, PNP clearance and macro-etching. Each is a digital copy kept in the car's Drive folder.
 * One tap on a paper adds its photos at once (many at a time); or drop everything together and each file starts with the paper it most likely is
 * (its name, else the next paper that has nothing yet), to be changed before saving.
 */
export function TransferPapersCard({ plate, files, canEdit, isAdmin, folderLinked, backAtMad }: { plate: string; files: TransferPaperFile[]; canEdit: boolean; isAdmin: boolean; folderLinked: boolean; backAtMad: boolean }) {
  const router = useRouter();
  const bulk = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<{ file: File; tag: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<{ name: string; ok: boolean; text: string }[]>([]);
  const progress = transferProgress(files.map((f) => f.tag));
  const covered = new Set(files.map((f) => f.tag));

  /** Sends the files one after the other; the ones that fail stay to be sent again. */
  async function send(items: { file: File; tag: string }[]): Promise<{ file: File; tag: string }[]> {
    setBusy(true); setLines([]);
    const failed: { file: File; tag: string }[] = [];
    let saved = 0;
    for (const it of items) {
      try {
        const out = await prepareImage(it.file);
        const body = new FormData();
        body.set("plate", plate); body.set("file", out, it.file.name); body.set("tag", it.tag); body.set("kind", "transfer");
        const res = await fetch("/api/docs/archive", { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) throw new Error(json.error ?? "The upload failed. Try again.");
        saved++; setLines((l) => [...l, { name: it.file.name, ok: true, text: `Saved as ${it.tag} ✓` }]);
      } catch (e) { failed.push(it); setLines((l) => [...l, { name: it.file.name, ok: false, text: e instanceof Error ? e.message : "The upload failed." }]); }
    }
    setBusy(false);
    if (saved) toast.success(`${saved} ${saved === 1 ? "paper" : "papers"} added.`);
    router.refresh();
    return failed;
  }

  // one paper's own button: its photos go straight in, as that paper
  const addTo = async (tag: string, list: FileList | null) => { if (!list?.length) return; const picked = Array.from(list); setStaged(await send(picked.map((file) => ({ file, tag })))); };
  // everything together: each file starts with the paper it most likely is
  const stage = (list: FileList | null) => {
    if (!list?.length) return;
    const picked = Array.from(list).slice(0, 40); // copied at once: the box is emptied right after
    const tags = placeFiles([...staged.map((s) => s.file.name), ...picked.map((f) => f.name)], covered).slice(staged.length);
    setStaged((x) => [...x, ...picked.map((file, i) => ({ file, tag: tags[i] }))]);
    if (bulk.current) bulk.current.value = "";
  };

  if (!folderLinked) return <Card id="new-owner-papers"><CardHeader><CardTitle>Documents for the new owner</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">This car has no document folder in Drive yet. Link its folder in Documents first; the papers are kept in it.</p></CardContent></Card>;

  return (
    <Card id="new-owner-papers">
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Documents for the new owner <Pill tone={progress.have === progress.total ? "emerald" : "amber"}>{progress.have} of {progress.total}</Pill></CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">When Sir Jep gives the originals back, add a copy of each paper that goes to the buyer. The copies are kept in the car&apos;s Drive folder.</p>
        {backAtMad && progress.missing.length > 0 && <p className="rounded-lg bg-amber-50 p-3 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100" role="status">The originals are back, but there is no copy yet of: {progress.missing.join(", ")}.</p>}
        <ul className="divide-y rounded-lg ring-1 ring-foreground/10" aria-label="Documents for the new owner">
          {TRANSFER_PAPERS.map((p) => {
            const mine = files.filter((f) => f.tag === p.key);
            return (
              <li key={p.key} className="space-y-2 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`grid size-5 place-items-center rounded-full ${mine.length ? "bg-emerald-600 text-white" : "border"}`} aria-hidden>{mine.length ? <Check className="size-3.5" /> : null}</span>
                  <span className="font-medium">{p.label}</span><span className="text-xs text-muted-foreground">{p.long}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{mine.length ? `${mine.length} ${mine.length === 1 ? "copy" : "copies"}` : "Not yet"}</span>
                  {canEdit && <>
                    <input id={`np-${p.key}`} type="file" accept={ACCEPT} multiple className="sr-only" aria-label={`Add photos of the ${p.label}`} onChange={(e) => { const l = e.target.files; void addTo(p.key, l).then(() => { e.target.value = ""; }); }} />
                    <Button type="button" size="sm" variant={mine.length ? "outline" : "default"} disabled={busy} onClick={() => document.getElementById(`np-${p.key}`)?.click()}><Plus /> {mine.length ? "Add more" : "Add"}</Button>
                  </>}
                </div>
                {mine.map((f) => <PaperRow key={f.id} f={f} isAdmin={isAdmin} />)}
              </li>
            );
          })}
          {files.filter((f) => !TRANSFER_PAPERS.some((p) => p.key === f.tag)).length > 0 && (
            <li className="space-y-2 px-3 py-3"><p className="font-medium">Other papers</p>{files.filter((f) => !TRANSFER_PAPERS.some((p) => p.key === f.tag)).map((f) => <PaperRow key={f.id} f={f} isAdmin={isAdmin} />)}</li>
          )}
        </ul>

        {canEdit && (
          <div className="space-y-3 rounded-lg border-2 border-dashed border-muted-foreground/30 p-3" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); stage(e.dataTransfer.files); }}>
            <p className="text-center text-muted-foreground">Have them all? Drop every photo here, or choose them together. Each starts as the paper it most likely is: change any that is wrong, then save.</p>
            <input ref={bulk} id="np-bulk" type="file" accept={ACCEPT} multiple className="sr-only" aria-label="Photos of the papers for the new owner" onChange={(e) => stage(e.target.files)} />
            <div className="text-center"><Button type="button" variant="outline" disabled={busy} onClick={() => bulk.current?.click()}><Upload /> Choose photos or PDFs</Button></div>
            {staged.length > 0 && (
              <ul className="space-y-2" aria-label="Papers to save">
                {staged.map((s, i) => (
                  <li key={`${s.file.name}-${i}`} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs">{s.file.name}</span>
                    <NativeSelect aria-label={`What is ${s.file.name}`} className="w-44" value={s.tag} disabled={busy} onChange={(e) => setStaged((x) => x.map((y, j) => (j === i ? { ...y, tag: e.target.value } : y)))}>{TRANSFER_TAGS.map((t) => <option key={t}>{t}</option>)}</NativeSelect>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Leave out ${s.file.name}`} disabled={busy} onClick={() => setStaged((x) => x.filter((_, j) => j !== i))}><Trash2 /></Button>
                  </li>
                ))}
                <li className="flex justify-end"><Button type="button" disabled={busy} onClick={() => void send(staged).then(setStaged)}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} Save {staged.length} {staged.length === 1 ? "paper" : "papers"}</Button></li>
              </ul>
            )}
            {lines.length > 0 && <ul className="space-y-0.5 text-xs" aria-live="polite">{lines.map((l, i) => <li key={i} className={l.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}>{l.name}: {l.text}</li>)}</ul>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PaperRow({ f, isAdmin }: { f: TransferPaperFile; isAdmin: boolean }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  return (
    <div className="flex items-center gap-3 pl-7">
      <a href={`/api/docs/file/${f.id}`} target="_blank" rel="noreferrer" aria-label={`Open ${f.name}`} className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/docs/file/${f.id}`} alt="" loading="lazy" className="size-12 object-cover" />
      </a>
      <div className="min-w-0 flex-1"><p className="truncate text-xs">{f.name}</p><p className="text-xs text-muted-foreground">{f.by ? `Added by ${f.by}` : "Added"} · {when(f.addedAt)}</p></div>
      <a href={`/api/docs/file/${f.id}?download=1`} download className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm hover:bg-muted"><Download className="size-4" aria-hidden /> Download</a>
      {isAdmin && <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${f.name}`} onClick={() => setAsk(true)}><Trash2 /></Button>}
      <AskDialog open={ask} onOpenChange={setAsk} title="Remove this paper?" description="It leaves the list and goes to the Drive trash, where it stays for 30 days." fields={[]} confirm="Remove" danger
        onConfirm={async () => { const r = await deleteArchiveFileAction(f.id); if (!r.ok) return r.message; toast.success(r.message); router.refresh(); }} />
    </div>
  );
}
