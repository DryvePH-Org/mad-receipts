"use client";

import { useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";

const MIN = 1, MAX = 8;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * A photo to look at closely: pinch with two fingers, scroll the wheel, press + and −, or double-tap to zoom; drag to move around a zoomed photo.
 * Only the view changes. `rotation` turns it upright the way the reader found it; the file itself is never touched.
 */
export function ImageViewer({ open, onOpenChange, src, name, rotation = 0, description }: { open: boolean; onOpenChange: (open: boolean) => void; src: string; name: string; rotation?: number; description?: string }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={name} description={description} className="sm:max-w-4xl">
      {open && <Stage src={src} name={name} rotation={rotation} />}
    </ResponsiveDialog>
  );
}

function Stage({ src, name, rotation }: { src: string; name: string; rotation: number }) {
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [touching, setTouching] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; z: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  /** Zoom around a point of the picture area, so what is under the finger or the cursor stays there. */
  const zoomTo = (next: number, cx?: number, cy?: number) => setView((v) => {
    const z = clamp(next, MIN, MAX);
    if (z === 1) return { z: 1, x: 0, y: 0 };
    const r = box.current?.getBoundingClientRect();
    const px = cx !== undefined && r ? cx - r.left - r.width / 2 : 0, py = cy !== undefined && r ? cy - r.top - r.height / 2 : 0;
    const k = z / v.z;
    return { z, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
  });

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setTouching(true);
    if (pointers.current.size === 2) { const [a, b] = [...pointers.current.values()]; pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: view.z }; }
  };
  const move = (e: React.PointerEvent) => {
    const last = pointers.current.get(e.pointerId);
    if (!last) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      zoomTo(pinch.current.z * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (pointers.current.size === 1 && view.z > 1) {
      const dx = e.clientX - last.x, dy = e.clientY - last.y;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };
  const up = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; if (pointers.current.size === 0) setTouching(false); };

  return (
    <div className="space-y-2">
      <div
        ref={box}
        className={`relative h-[65svh] touch-none overflow-hidden rounded-lg bg-muted select-none ${view.z > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        onWheel={(e) => zoomTo(view.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY)}
        onDoubleClick={(e) => (view.z > 1 ? zoomTo(1) : zoomTo(2.5, e.clientX, e.clientY))}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} draggable={false} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z}) rotate(${rotation}deg)`, transformOrigin: "center", transition: touching ? "none" : "transform 120ms" }} />
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button type="button" size="icon-sm" variant="outline" aria-label="Zoom out" disabled={view.z <= MIN} onClick={() => zoomTo(view.z / 1.5)}><Minus /></Button>
        <span className="w-14 text-center text-xs text-muted-foreground tabular-nums" aria-live="polite">{Math.round(view.z * 100)}%</span>
        <Button type="button" size="icon-sm" variant="outline" aria-label="Zoom in" disabled={view.z >= MAX} onClick={() => zoomTo(view.z * 1.5)}><Plus /></Button>
        <Button type="button" size="sm" variant="ghost" disabled={view.z === 1} onClick={() => zoomTo(1)}><Maximize2 /> Fit</Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">Pinch, scroll or double-tap to zoom. Drag to move.</p>
    </div>
  );
}
