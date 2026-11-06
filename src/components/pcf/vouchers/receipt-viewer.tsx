"use client";

import { useState } from "react";
import { Expand, ImageOff, ZoomIn, ZoomOut } from "lucide-react";

import { ResponsiveDialog } from "@/components/pcf/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ReceiptViewer({
  url,
  noReceiptReason,
}: {
  url: string | null;
  noReceiptReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  if (!url) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <ImageOff className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No receipt attached</p>
        {noReceiptReason ? (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Reason: {noReceiptReason}
          </p>
        ) : (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            A receipt or a no-receipt reason is needed before cash is released.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full overflow-hidden rounded-xl border border-border bg-muted/30"
        aria-label="View receipt"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Receipt"
          className="h-56 w-full object-cover sm:h-72"
        />
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 pt-8 text-sm font-medium text-white">
          <Expand className="size-4" />
          Tap to zoom
        </span>
      </button>

      <ResponsiveDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setZoomed(false);
        }}
        title="Receipt"
        description={
          zoomed
            ? "Drag to pan. Tap the image to zoom out."
            : "Tap the image to zoom in."
        }
        className="sm:max-w-4xl"
      >
        <div
          className={cn(
            "rounded-lg bg-muted/40",
            zoomed ? "max-h-[70svh] overflow-auto" : "flex justify-center",
          )}
        >
          <button
            type="button"
            onClick={() => setZoomed((value) => !value)}
            className={cn("block", zoomed ? "cursor-zoom-out" : "cursor-zoom-in")}
            aria-label={zoomed ? "Zoom out" : "Zoom in"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Receipt"
              className={cn(
                "rounded-lg",
                zoomed ? "max-w-none" : "max-h-[70svh] w-auto max-w-full",
              )}
            />
          </button>
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setZoomed((value) => !value)}
          >
            {zoomed ? <ZoomOut /> : <ZoomIn />}
            {zoomed ? "Fit to screen" : "Zoom in"}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}
