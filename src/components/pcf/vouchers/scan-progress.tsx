"use client";

import { useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";

// Shows the photo being read: a bright line sweeps over it, with a label.
export function ScanProgress({ file, label }: { file: File; label: string }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3"
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="size-full object-cover opacity-80" />
        <span className="pcf-scan-line absolute inset-x-0 h-[3px] bg-primary shadow-[0_0_12px_2px] shadow-primary" />
      </div>
      <div className="space-y-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Loader2 className="size-4 animate-spin" />
          {label}
        </p>
        <p className="text-xs text-muted-foreground">
          This takes a few seconds. You can review everything afterwards.
        </p>
      </div>
    </div>
  );
}
