"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { halfOf, isPaper, MM, PAPERS, type PaperKey } from "@/lib/paper";
import { MIN_FIT } from "@/components/receipt/fit-box";
import { Button } from "@/components/ui/button";
import type { AppSettings } from "@/lib/deal/settings";

const PAPER_KEY = "mad-print-paper", PAPER_EVENT = "mad-paper";
const subscribePaper = (cb: () => void) => { window.addEventListener(PAPER_EVENT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(PAPER_EVENT, cb); window.removeEventListener("storage", cb); }; };
const readPaper = (): PaperKey | null => { try { const v = localStorage.getItem(PAPER_KEY); return isPaper(v) ? v : null; } catch { return null; } };

/** Shows a fixed-size sheet shrunk to fit a narrow screen (a phone), and at full size on paper. */
function ScaleToFit({ widthMm, heightMm, children }: { widthMm: number; heightMm: number; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const measure = () => setScale(Math.min(1, (document.documentElement.clientWidth - 24) / (widthMm * MM)));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [widthMm]);
  return (
    <div ref={box} className="scale-box mx-auto" style={{ width: widthMm * MM * scale, height: heightMm * MM * scale }}>
      <div className="scale-inner" style={{ width: `${widthMm}mm`, height: `${heightMm}mm`, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  );
}

/**
 * The printable copies of one half-page paper: two to a sheet (or one per half sheet), on the paper the printer uses, as many copies as staff pick.
 * `paper` draws one copy; it is given the copy's name, the chosen paper, and a function that hears how much it had to shrink.
 */
export function PrintShell({ print, copyNames, notice, backHref, backLabel = "Back", paper: drawPaper, defaultCopies }: { print: AppSettings["print"]; copyNames: string[]; notice?: React.ReactNode; backHref: string; backLabel?: string; defaultCopies?: number; paper: (copyName: string, paperKey: PaperKey, onFit: (scale: number) => void) => React.ReactNode }) {
  const [copies, setCopies] = useState(defaultCopies ?? print.defaultCopies);
  // each computer remembers the paper its printer uses
  const saved = useSyncExternalStore(subscribePaper, readPaper, () => null);
  const paperKey: PaperKey = saved ?? print.paper;
  const choosePaper = (k: PaperKey) => { try { localStorage.setItem(PAPER_KEY, k); } catch { /* private window: not remembered */ } window.dispatchEvent(new Event(PAPER_EVENT)); };
  const sheet = PAPERS[paperKey], half = halfOf(paperKey);
  const [names, setNames] = useState<string[]>([]);
  const [small, setSmall] = useState(false); // the writing had to shrink a lot to fit
  const nameOf = (i: number) => names[i]?.trim() || copyNames[i % copyNames.length] || `Copy ${i + 1}`;

  const page = `${sheet.w}mm ${sheet.h}mm`; // always the whole sheet: two copies on it, cut in the middle
  const paper = (i: number) => drawPaper(nameOf(i), paperKey, (s) => setSmall(s < MIN_FIT));
  // two copies to a sheet, always: three copies are one full sheet and a second sheet with one copy
  const sheets = Array.from({ length: Math.ceil(copies / 2) }, (_, k) => [k * 2, k * 2 + 1].filter((i) => i < copies));

  return (
    <div className="min-h-svh bg-neutral-200 print:bg-white">
      <style>{`@page { size: ${page}; margin: 0; }
        @media print {
          html, body { margin: 0 !important; background: #fff !important; }
          .print-sheet { break-after: page; break-inside: avoid; }
          .print-sheet:last-child { break-after: auto; }
          .paper { box-shadow: none !important; }
          .scale-box { width: auto !important; height: auto !important; }
          .scale-inner { transform: none !important; }
          * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }`}</style>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2.5 text-sm print:hidden">
        <strong>Print</strong>
        <label className="flex items-center gap-1.5">Paper <select aria-label="Paper" value={paperKey} onChange={(e) => choosePaper(e.target.value as PaperKey)} className="h-8 rounded-md border bg-background px-2 text-sm">{(Object.keys(PAPERS) as PaperKey[]).map((k) => <option key={k} value={k}>{PAPERS[k].name}</option>)}</select></label>
        <div className="flex items-center gap-1" role="group" aria-label="Copies">
          <Button size="icon-sm" variant="outline" onClick={() => setCopies((c) => Math.max(1, c - 1))} aria-label="Fewer copies">−</Button>
          <span className="min-w-20 text-center font-medium">{copies} {copies === 1 ? "copy" : "copies"}</span>
          <Button size="icon-sm" variant="outline" onClick={() => setCopies((c) => Math.min(10, c + 1))} aria-label="More copies">+</Button>
        </div>
        <details className="relative"><summary className="cursor-pointer rounded-lg border px-2.5 py-1 font-medium">Copy names</summary>
          <div className="absolute z-20 mt-1 w-72 space-y-1.5 rounded-lg border bg-background p-3 shadow-lg">{Array.from({ length: copies }, (_, i) => <input key={i} value={names[i] ?? ""} placeholder={nameOf(i)} onChange={(e) => { const n = [...names]; n[i] = e.target.value; setNames(n); }} className="h-8 w-full rounded-md border px-2 text-sm" aria-label={`Name of copy ${i + 1}`} />)}</div>
        </details>
        {notice}
        <div className="ml-auto flex gap-2"><Button variant="outline" nativeButton={false} render={<a href={backHref} />}>{backLabel}</Button><Button onClick={() => window.print()}>Print {copies} {copies === 1 ? "copy" : "copies"}</Button></div>
      </div>
      {small && <p role="status" className="bg-amber-50 px-4 py-2 text-sm text-amber-950 print:hidden">This receipt has a lot on it, so the writing is printed smaller to fit the half page. Everything is still on the paper.</p>}
      <div className="grid justify-center gap-8 py-8 print:block print:p-0">
        {sheets.map((idx, k) => (
          <div key={k} className="print-sheet">
            <ScaleToFit widthMm={sheet.w} heightMm={sheet.h + 0.3}>
              <div className="print-a4 bg-white shadow-lg print:shadow-none" style={{ ["--pw" as string]: `${half.w}mm`, ["--ph" as string]: `${half.h}mm` }}>
                {idx.map((i, j) => <div key={i} className="contents">{j > 0 && <div className="cut" />}{paper(i)}</div>)}
              </div>
            </ScaleToFit>
          </div>
        ))}
      </div>
    </div>
  );
}
