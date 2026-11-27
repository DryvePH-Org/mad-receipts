"use client";

import { useRouter } from "next/navigation";
import { DOC_LABELS, type DocType } from "@/lib/docs/types";
import { prepareImage } from "../upload-photos";
import { UploadDropzone, useUploadQueue } from "./bulk-upload";

const PDF_OR_IMAGE = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf";

/** The OUT documents: any number of photos (the buyer's ID, the deed signed with the buyer, the physical AR). Each is filed in the car's folder as an OUT photo and read by the OUT scanner. */
export function OutUploader({ plate }: { plate: string }) {
  const router = useRouter();
  const queue = useUploadQueue({
    concurrency: 2,
    process: async (original) => {
      const file = await prepareImage(original);
      const body = new FormData();
      body.set("plate", plate); body.set("file", file, "photo.jpg");
      const res = await fetch("/api/docs/upload", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { result?: { types: string[]; flags: string[]; readStatus: string }; error?: string };
      if (!res.ok || !json.result) throw new Error(json.error ?? "The upload failed. Try again.");
      return { types: json.result.types, flags: json.result.flags, message: json.result.readStatus === "pending" ? "Saved. The OUT scanner reads it in a minute and puts it in the list." : undefined };
    },
    onFinished: () => router.refresh(),
  });
  return (
    <div className="space-y-2">
      <UploadDropzone queue={queue} label="the buyer's ID, the deed and the AR" inputId="doc-photos" lines={(i) => (i.types?.some((t) => t !== "other") ? <p className="text-muted-foreground">Recognised as: {i.types.filter((t) => t !== "other").map((t) => DOC_LABELS[t as DocType] ?? t).join(" and ")}</p> : <p className="text-muted-foreground">Not recognised. It is in the folder; you can say what it is in the list.</p>)} />
      <p className="text-xs text-muted-foreground">Three photos: the buyer&apos;s ID, the deed of sale signed with the buyer, and the physical AR. Any order: the scanner puts each in its place. Keep the whole page in the picture, flat and well lit.</p>
    </div>
  );
}

/** The papers back from the transfer: any number of photos or PDFs (OR, CR, PNP clearance, macro-etching). The transfer scanner puts each in its place. */
export function TransferUploader({ plate }: { plate: string }) {
  const router = useRouter();
  const queue = useUploadQueue({
    concurrency: 2,
    process: async (original) => {
      const out = await prepareImage(original);
      const body = new FormData();
      body.set("plate", plate); body.set("file", out, original.name); body.set("tag", "Other"); body.set("kind", "transfer");
      const res = await fetch("/api/docs/archive", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "The upload failed. Try again.");
      return { message: "Saved. The transfer scanner reads it in a minute and puts it in the list." };
    },
    onFinished: () => router.refresh(),
  });
  return (
    <div className="space-y-2">
      <UploadDropzone queue={queue} accept={PDF_OR_IMAGE} label="the papers that came back (OR, CR, PNP clearance, macro-etching)" inputId="transfer-photos" />
      <p className="text-xs text-muted-foreground">Drop all four papers together, photos or PDFs, in any order. Each is read and placed in the list; you review it and approve.</p>
    </div>
  );
}
