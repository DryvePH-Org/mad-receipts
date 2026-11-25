"use client";

import { useRouter } from "next/navigation";
import { Check, Download, X } from "lucide-react";
import { prepareImage } from "../upload-photos";
import { UploadDropzone, useUploadQueue } from "./bulk-upload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DOC_LABELS, type DocType } from "@/lib/docs/types";

/** One line of the after-sale checklist. The AR line has no photo: it is the receipt saved in the app. */
export interface OutItem { key: string; label: string; present: boolean; files: { id: string; name: string; note: string | null; by?: string | null; at?: string }[] }

/**
 * The OUT documents, after the sale: one place to upload the buyer's ID and the deed (photos, in any order) and the checklist of what is in. The AR is not
 * uploaded here: it is the receipt saved in New receipt, which also makes the sale.
 */
export function SoldUploadCard({ plate, items, buyer, canUpload = true }: { plate: string; items: OutItem[]; buyer: string | null; canUpload?: boolean }) {
  const router = useRouter();
  // any number of photos: each is prepared, sent and read in turn, and falls into the list below
  const queue = useUploadQueue({
    concurrency: 2,
    process: async (original) => {
      const file = await prepareImage(original);
      const body = new FormData();
      body.set("plate", plate);
      body.set("file", file, "photo.jpg");
      const res = await fetch("/api/docs/upload", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { result?: { types: string[]; flags: string[]; readStatus: string }; error?: string };
      if (!res.ok || !json.result) throw new Error(json.error ?? "The upload failed. Try again.");
      return { types: json.result.types, flags: json.result.flags, message: json.result.readStatus === "pending" ? "The bot is reading it; it appears in the list in a minute." : json.result.readStatus === "failed" ? "Saved in the folder. It could not be read, so Buying will check it." : undefined };
    },
    onFinished: () => router.refresh(),
  });

  const have = items.filter((i) => i.present).length;
  return (
    <Card id="sold-upload">
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">After-sale documents
        <span className="text-sm font-normal text-muted-foreground">{have} of {items.length} in</span></CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">{buyer ? <>Buyer <b className="text-foreground">{buyer}</b>. </> : <>No sale is recorded yet: it is made when the AR is saved in New receipt. </>}The AR is the receipt saved in New receipt (it is on the list when it is saved). Here, take a photo of each other paper (the buyer&apos;s ID and the deed); it goes into this car&apos;s folder, is read, and falls into the list below.</p>
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
        {canUpload && (
          <>
            <UploadDropzone queue={queue} label="photos of the documents" inputId="doc-photos" lines={(i) => (
              <p className="text-muted-foreground">{i.types?.some((t) => t !== "other") ? `Recognised as: ${i.types.filter((t) => t !== "other").map((t) => DOC_LABELS[t as DocType] ?? t).join(" and ")}` : "Not recognised. It is in the folder; Buying will check what it is."}</p>
            )} />
            <p className="text-xs text-muted-foreground">One photo for each document, in any order. Keep the whole page in the picture, flat and well lit, so it can be read.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
