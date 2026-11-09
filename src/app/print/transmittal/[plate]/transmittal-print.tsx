"use client";

import { PrintShell } from "@/components/receipt/print-shell";
import { TransmittalPaper } from "@/components/receipt/transmittal-paper";
import type { TransmittalData } from "@/lib/docs/transmittal";
import type { AppSettings } from "@/lib/deal/settings";

const COPIES = ["Receiver's copy", "Office copy", "File copy"];

/** The printable transmittal: the half page, on the paper the printer uses. */
export function TransmittalPrint({ data, print, backHref }: { data: TransmittalData; print: AppSettings["print"]; backHref: string }) {
  return <PrintShell print={print} copyNames={COPIES} defaultCopies={2} backHref={backHref} backLabel="Back to the transmittal" paper={(copy, paper, onFit) => <TransmittalPaper data={data} paper={paper} copy={copy} onFit={onFit} />} />;
}
