"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { halfOf, isPaper, MM, PAPERS, type PaperKey } from "@/lib/paper";
import { ReceiptPaper } from "@/components/receipt/receipt-paper";
import { MIN_FIT } from "@/components/receipt/fit-box";
import { Button } from "@/components/ui/button";
import type { AppSettings } from "@/lib/deal/settings";
import type { FormState } from "@/lib/deal/types";

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

/** The printable copies of one receipt: the half page, two to an A4 sheet (or one per half sheet), and as many copies as staff pick. */
export function PrintView({ state, company, print, copyNames, unapproved, backHref }: { state: FormState; company: AppSettings["company"]; print: AppSettings["print"]; copyNames: string[]; unapproved: boolean; backHref: string }) {
  const [copies, setCopies] = useState(print.defaultCopies);
  const [perSheet, setPerSheet] = useState(print.perSheet);
  // each computer remembers the paper its printer uses
  const saved = useSyncExternalStore(subscribePaper, readPaper, () => null);
  const paperKey: PaperKey = saved ?? print.paper;
  const choosePaper = (k: PaperKey) => { try { localStorage.setItem(PAPER_KEY, k); } catch { /* private window: not remembered */ } window.dispatchEvent(new Event(PAPER_EVENT)); };
  const sheet = PAPERS[paperKey], half = halfOf(paperKey);
  const [names, setNames] = useState<string[]>([]);
  const [small, setSmall] = useState(false); // the writing had to shrink a lot to fit
  const nameOf = (i: number) => names[i]?.trim() || copyNames[i % copyNames.length] || `Copy ${i + 1}`;

  const page = perSheet === "two" ? `${sheet.w}mm ${sheet.h}mm` : `${half.w}mm ${half.h}mm`;
  const paper = (i: number) => <ReceiptPaper state={state} company={company} print={print} paper={paperKey} copy={nameOf(i)} unapproved={unapproved} onFit={(s) => setSmall(s < MIN_FIT)} />;
  const twoUp = perSheet === "two";
  const sheets = twoUp ? Array.from({ length: Math.ceil(copies / 2) }, (_, k) => [k * 2, k * 2 + 1].filter((i) => i < copies)) : Array.from({ length: copies }, (_, i) => [i]);

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
        <div className="flex gap-1" role="group" aria-label="Half pages on the sheet">
          <Button size="sm" variant={perSheet === "two" ? "default" : "outline"} onClick={() => setPerSheet("two")} title="Two receipts on one sheet. Cut in the middle.">2 per sheet</Button>
          <Button size="sm" variant={perSheet === "one" ? "default" : "outline"} onClick={() => setPerSheet("one")} title="One receipt on each half sheet of paper">1 per half sheet</Button>
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Copies">
          <Button size="icon-sm" variant="outline" onClick={() => setCopies((c) => Math.max(1, c - 1))} aria-label="Fewer copies">−</Button>
          <span className="min-w-20 text-center font-medium">{copies} {copies === 1 ? "copy" : "copies"}</span>
          <Button size="icon-sm" variant="outline" onClick={() => setCopies((c) => Math.min(10, c + 1))} aria-label="More copies">+</Button>
        </div>
        <details className="relative"><summary className="cursor-pointer rounded-lg border px-2.5 py-1 font-medium">Copy names</summary>
          <div className="absolute z-20 mt-1 w-72 space-y-1.5 rounded-lg border bg-background p-3 shadow-lg">{Array.from({ length: copies }, (_, i) => <input key={i} value={names[i] ?? ""} placeholder={nameOf(i)} onChange={(e) => { const n = [...names]; n[i] = e.target.value; setNames(n); }} className="h-8 w-full rounded-md border px-2 text-sm" aria-label={`Name of copy ${i + 1}`} />)}</div>
        </details>
        {unapproved && <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800">Not approved yet: copies are marked UNAPPROVED</span>}
        <div className="ml-auto flex gap-2"><Button variant="outline" nativeButton={false} render={<a href={backHref} />}>Back to the deal</Button><Button onClick={() => window.print()}>Print {copies} {copies === 1 ? "copy" : "copies"}</Button></div>
      </div>
      {small && <p role="status" className="bg-amber-50 px-4 py-2 text-sm text-amber-950 print:hidden">This receipt has a lot on it, so the writing is printed smaller to fit the half page. Everything is still on the paper.</p>}
      <div className="grid justify-center gap-8 py-8 print:block print:p-0">
        {sheets.map((idx, k) => (
          <div key={k} className="print-sheet">
            <ScaleToFit widthMm={sheet.w} heightMm={twoUp ? sheet.h + 0.3 : half.h}>
              {twoUp ? (
                <div className="print-a4 bg-white shadow-lg print:shadow-none" style={{ ["--pw" as string]: `${half.w}mm`, ["--ph" as string]: `${half.h}mm` }}>
                  {idx.map((i, j) => <div key={i} className="contents">{j > 0 && <div className="cut" />}{paper(i)}</div>)}
                </div>
              ) : paper(idx[0])}
            </ScaleToFit>
          </div>
        ))}
      </div>
    </div>
  );
}
