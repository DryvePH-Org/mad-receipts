"use client";

import { PrintShell } from "@/components/receipt/print-shell";
import { ReceiptPaper } from "@/components/receipt/receipt-paper";
import type { AppSettings } from "@/lib/deal/settings";
import type { FormState } from "@/lib/deal/types";

/** The printable copies of one receipt. */
export function PrintView({ state, company, print, copyNames, backHref }: { state: FormState; company: AppSettings["company"]; print: AppSettings["print"]; copyNames: string[]; backHref: string }) {
  return (
    <PrintShell print={print} copyNames={copyNames} backHref={backHref} backLabel="Back to the deal"
      paper={(copy, paper, onFit) => <ReceiptPaper state={state} company={company} print={print} paper={paper} copy={copy} onFit={onFit} />} />
  );
}
