"use client";

import { PrintShell } from "@/components/receipt/print-shell";
import { ReceiptPaper } from "@/components/receipt/receipt-paper";
import type { AppSettings } from "@/lib/deal/settings";
import type { FormState } from "@/lib/deal/types";

/** The printable copies of one receipt. */
export function PrintView({ state, company, print, copyNames, unapproved, backHref }: { state: FormState; company: AppSettings["company"]; print: AppSettings["print"]; copyNames: string[]; unapproved: boolean; backHref: string }) {
  return (
    <PrintShell print={print} copyNames={copyNames} backHref={backHref} backLabel="Back to the deal"
      notice={unapproved ? <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800">Not approved yet (copies print without any stamp)</span> : null}
      paper={(copy, paper, onFit) => <ReceiptPaper state={state} company={company} print={print} paper={paper} copy={copy} onFit={onFit} />} />
  );
}
