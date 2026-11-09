"use client";

import { useEffect, useRef, useState } from "react";
import { ReceiptPaper, LAYOUTS, type PaperLayout } from "@/components/receipt/receipt-paper";
import { MIN_FIT } from "@/components/receipt/fit-box";
import { Button } from "@/components/ui/button";
import type { AppSettings } from "@/lib/deal/settings";
import type { FormState } from "@/lib/deal/types";

const MM = 96 / 25.4; // pixels per millimetre on screen

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

/** The printable copies of one receipt, with the layout and number of copies the staff pick. */
export function PrintView({ state, company, print, copyNames, unapproved, backHref }: { state: FormState; company: AppSettings["company"]; print: AppSettings["print"]; copyNames: string[]; unapproved: boolean; backHref: string }) {
  const [layout, setLayout] = useState<PaperLayout>(print.defaultLayout);
  const [copies, setCopies] = useState(print.defaultCopies);
  const [perSheet, setPerSheet] = useState(print.perSheet);
  const [names, setNames] = useState<string[]>([]);
  const [tooFull, setTooFull] = useState(false); // the half page would have to print too small
  const [forceHalf, setForceHalf] = useState(false);
  const nameOf = (i: number) => names[i]?.trim() || copyNames[i % copyNames.length] || `Copy ${i + 1}`;

  // A receipt with a lot on it moves to the full page by itself, so nothing is ever cut off or printed too small to read.
  const effective: PaperLayout = layout === "ack" && tooFull && !forceHalf ? "form" : layout;
  const onFit = (s: number) => setTooFull(s < MIN_FIT);
  const page = effective === "ack" ? (perSheet === "two" ? "210mm 297mm" : "210mm 148mm") : LAYOUTS.find((l) => l.id === effective)!.page;
  const paper = (i: number) => <ReceiptPaper state={state} company={company} print={print} layout={effective} copy={nameOf(i)} unapproved={unapproved} onFit={effective === "ack" ? onFit : undefined} />;

  const twoUp = effective === "ack" && perSheet === "two";
  const sheets = twoUp ? Array.from({ length: Math.ceil(copies / 2) }, (_, k) => [k * 2, k * 2 + 1].filter((i) => i < copies)) : Array.from({ length: copies }, (_, i) => [i]);
  const sheetMm = effective === "ack" ? { w: 210, h: perSheet === "two" ? 297 : 148 } : effective === "form" ? { w: 210, h: 297 } : { w: 80, h: 320 };

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
        <div className="flex gap-1">{LAYOUTS.map((l) => <Button key={l.id} size="sm" variant={layout === l.id ? "default" : "outline"} onClick={() => { setLayout(l.id); setForceHalf(false); }} title={l.size}>{l.name}</Button>)}</div>
        {layout === "ack" && !tooFull && (
          <div className="flex gap-1" role="group" aria-label="Half pages on the sheet">
            <Button size="sm" variant={perSheet === "two" ? "secondary" : "outline"} onClick={() => setPerSheet("two")} title="Two receipts on one A4 sheet. Cut in the middle.">2 per A4 sheet</Button>
            <Button size="sm" variant={perSheet === "one" ? "secondary" : "outline"} onClick={() => setPerSheet("one")} title="One receipt on each sheet of half-page (A5) paper">1 per half sheet</Button>
          </div>
        )}
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
      {layout === "ack" && tooFull && (
        <div role="status" className="flex flex-wrap items-center gap-3 bg-amber-50 px-4 py-2 text-sm text-amber-950 print:hidden">
          <span>{forceHalf ? "This receipt has a lot on it, so the half page prints small." : "This receipt has a lot on it for half a page, so it is shown on a full A4 page to stay easy to read."}</span>
          <Button size="sm" variant="outline" onClick={() => setForceHalf(!forceHalf)}>{forceHalf ? "Use the full page" : "Use the half page anyway"}</Button>
        </div>
      )}
      <div className="grid justify-center gap-8 py-8 print:block print:p-0">
        {sheets.map((idx, k) => (
          <div key={k} className="print-sheet">
            <ScaleToFit widthMm={sheetMm.w} heightMm={twoUp ? 297 : effective === "ack" ? 148 : effective === "form" ? 297 : sheetMm.h}>
              {twoUp ? (
                <div className="print-a4 bg-white shadow-lg print:shadow-none">
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
