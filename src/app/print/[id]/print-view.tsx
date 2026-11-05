"use client";

import { useState } from "react";
import { ReceiptPaper, LAYOUTS, type PaperLayout } from "@/components/receipt/receipt-paper";
import { Button } from "@/components/ui/button";
import type { AppSettings } from "@/lib/deal/settings";
import type { FormState } from "@/lib/deal/types";

/** The printable copies of one receipt, with the layout and number of copies the staff pick. */
export function PrintView({ state, company, copyNames, unapproved, backHref }: { state: FormState; company: AppSettings["company"]; copyNames: string[]; unapproved: boolean; backHref: string }) {
  const [layout, setLayout] = useState<PaperLayout>("form");
  const [copies, setCopies] = useState(3);
  const [names, setNames] = useState<string[]>([]);
  const nameOf = (i: number) => names[i]?.trim() || copyNames[i % copyNames.length] || `Copy ${i + 1}`;
  const page = LAYOUTS.find((l) => l.id === layout)!.page;

  return (
    <div className="min-h-svh bg-neutral-200 print:bg-white">
      <style>{`@page { size: ${page}; margin: 0; } @media print { .print-sheet { break-after: page; } .print-sheet:last-child { break-after: auto; } .paper { box-shadow: none !important; } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }`}</style>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background px-4 py-2.5 text-sm print:hidden">
        <strong>Print</strong>
        <div className="flex gap-1">{LAYOUTS.map((l) => <Button key={l.id} size="sm" variant={layout === l.id ? "default" : "outline"} onClick={() => setLayout(l.id)} title={l.size}>{l.name}</Button>)}</div>
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
      <div className="grid justify-center gap-8 py-8 print:block print:p-0">
        {Array.from({ length: copies }, (_, i) => <div key={i} className="print-sheet"><ReceiptPaper state={state} company={company} layout={layout} copy={nameOf(i)} unapproved={unapproved} /></div>)}
      </div>
    </div>
  );
}
