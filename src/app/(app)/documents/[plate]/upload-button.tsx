"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { DOC_LABELS, type DocType } from "@/lib/docs/types";
import { finishAddAction } from "../actions";
import { prepareImage } from "../upload-photos";
import { UploadDropzone, useUploadQueue } from "./bulk-upload";

let n = 0;

/**
 * Upload the papers the car came with: drop or choose as many photos as you have (or take them on a phone). They go into this car's Drive folder one
 * after the other, and the scan starts when the last one is in.
 */
export function UploadButton({ plate, botScans }: { plate: string; botScans: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const queue = useUploadQueue({
    concurrency: 2,
    process: async (original) => {
      const file = await prepareImage(original);
      const body = new FormData();
      body.set("plate", plate);
      body.set("file", file, "photo.jpg");
      body.set("label", `doc${++n}`);
      const res = await fetch("/api/docs/add", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { result?: { types: string[]; flags: string[]; readStatus: string }; error?: string };
      if (!res.ok || !json.result) throw new Error(json.error ?? `The upload failed (error ${res.status}). Try again.`);
      return { types: json.result.types, flags: json.result.flags, message: json.result.readStatus === "failed" ? "Saved in the folder. It could not be read yet; it will be read again." : undefined };
    },
    onFinished: async (saved) => {
      if (saved > 0) { await finishAddAction(plate).catch(() => undefined); toast.success(`${saved} ${saved === 1 ? "photo" : "photos"} put in the car's folder.${botScans ? " The bot is scanning them." : ""}`); }
      router.refresh();
    },
  });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Camera /> Upload documents</Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} size="lg" title="Upload the IN documents" description="The papers the car came with: the OR, the CR, the seller's ID, the deed of sale, the stencil. One photo for each paper, or the OR and CR together.">
        <UploadDropzone queue={queue} label="photos of the papers" inputId="car-upload" lines={(i) => (
          <p className="text-muted-foreground">{i.types?.some((t) => t !== "other") ? `Read as: ${i.types.filter((t) => t !== "other").map((t) => DOC_LABELS[t as DocType] ?? t).join(", ")}` : "Not recognised yet. It is in the folder; you can say what it is on the Papers card."}</p>
        )} />
      </ResponsiveDialog>
    </>
  );
}
