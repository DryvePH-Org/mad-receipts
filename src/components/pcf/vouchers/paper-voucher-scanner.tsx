"use client";

import { useEffect, useRef } from "react";
import { Camera, FileScan, ImagePlus } from "lucide-react";

import { ScanProgress } from "@/components/pcf/vouchers/scan-progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Quick path: photograph the signed paper petty cash voucher and the form is
// filled from it. The photo is only read, never stored.
export function PaperVoucherScanner({
  onPick,
  scanning,
  disabled,
  highlight,
  cooldown = 0,
}: {
  onPick: (file: File) => void;
  scanning: File | null;
  disabled?: boolean;
  highlight?: boolean;
  // Seconds before another scan is allowed (the reading service is rate limited).
  cooldown?: number;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlight) card.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight]);

  function take(list: FileList | null) {
    const picked = list?.[0];
    if (picked?.type.startsWith("image/")) onPick(picked);
  }

  return (
    <div
      ref={card}
      className={cn(
        "space-y-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4",
        highlight && "ring-2 ring-primary",
      )}
    >
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="paper-voucher-camera"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="paper-voucher-file"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
      {scanning ? (
        <ScanProgress file={scanning} label="Reading your paper voucher..." />
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileScan className="size-5" />
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Have the paper voucher?</p>
              <p className="text-xs text-muted-foreground">
                Take a photo of it and the form fills itself, one line per
                particular. Check it before saving.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => cameraInput.current?.click()}
            >
              <Camera />
              {cooldown > 0 ? `Scan again in ${cooldown}s` : "Scan paper voucher"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus />
              Choose image
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
