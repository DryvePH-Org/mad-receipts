"use client";

import { useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";

/* eslint-disable @next/next/no-img-element -- signed Storage URLs, not static assets */

/** Receipt photo; tap to open full size (scroll and pinch to zoom). `thumbnail` shows a small square. */
export function PhotoViewer({ url, thumbnail = false }: { url: string; thumbnail?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          thumbnail
            ? "block size-20 shrink-0 overflow-hidden rounded-md border"
            : "relative block w-full overflow-hidden rounded-lg border"
        }
        aria-label="Open photo full size"
      >
        <img
          src={url}
          alt="Receipt photo"
          loading={thumbnail ? "lazy" : undefined}
          className={thumbnail ? "size-full bg-muted object-cover" : "max-h-[45vh] w-full bg-muted object-contain"}
        />
        {!thumbnail && (
          <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-xs font-medium">
            <ZoomIn className="size-4" /> Tap to zoom
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 overflow-auto bg-black" role="dialog" aria-label="Receipt photo">
          <img src={url} alt="Receipt photo, full size" className="max-w-none" style={{ width: "200%" }} />
          <Button
            type="button"
            variant="secondary"
            size="icon-lg"
            onClick={() => setOpen(false)}
            className="fixed top-4 right-4"
            aria-label="Close photo"
          >
            <X />
          </Button>
        </div>
      )}
    </>
  );
}
