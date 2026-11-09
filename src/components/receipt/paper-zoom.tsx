"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";

/** A "View larger" button: the paper in a big box, at a size that is easy to read, so every detail can be checked. */
export function PaperZoom({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { const el = wrap.current; if (el) setScale(Math.min(1.4, (el.clientWidth - 8) / width)); }, 60);
    return () => clearTimeout(t);
  }, [open, width]);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}><Maximize2 /> View larger</Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Preview" description="The receipt as it prints, at a readable size." className="sm:max-w-5xl">
        <div ref={wrap} className="overflow-auto rounded-lg bg-neutral-200 p-1">
          <div style={{ width: width * scale, height: height * scale }}>
            <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}
