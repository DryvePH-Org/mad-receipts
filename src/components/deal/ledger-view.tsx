import { CircleAlert, CircleCheck } from "lucide-react";
import type { Ledger, LedgerRow } from "@/lib/deal/math";
import { formatPeso } from "@/lib/rules/money";
import { cn } from "@/lib/utils";

const BAR = { owe: "bg-primary text-primary-foreground", ok: "bg-emerald-700 text-white", bad: "bg-destructive text-white", we: "bg-amber-700 text-white" } as const;

function Row({ row }: { row: LedgerRow }) {
  const amount = `${row.kind === "less" ? "− " : ""}${formatPeso(row.amount)}`;
  return (
    <div className={cn("flex items-start justify-between gap-6 border-t px-4 py-2.5 first:border-t-0", row.kind === "sub" && "bg-muted font-semibold", row.kind === "total" && BAR[(row.tone as keyof typeof BAR) ?? "owe"], row.tone === "we" && row.kind === "sub" && "text-amber-800")}>
      <div className="min-w-0">
        <p className={cn(row.kind !== "sub" && row.kind !== "total" && "font-medium")}>{row.label}</p>
        {row.detail && <p className={cn("text-xs", row.kind === "total" ? "text-white/70" : "text-muted-foreground")}>{row.detail}</p>}
        {row.note && <p className={cn("text-xs font-normal", row.kind === "total" ? "text-white/70" : "text-muted-foreground")}>{row.note}</p>}
      </div>
      <p className={cn("shrink-0 tabular-nums whitespace-nowrap", row.kind === "less" && "text-muted-foreground", row.kind === "total" && "text-xl font-semibold")}>{amount}</p>
    </div>
  );
}

/** The line-by-line working-out: price, trade-in, loan, what is due, what was received, the balance. */
export function LedgerView({ ledger, stage, showInfo = true, showProof = true }: { ledger: Ledger; stage?: "deal"; showInfo?: boolean; showProof?: boolean }) {
  const rows = stage ? ledger.rows.filter((r) => r.stage === stage) : ledger.rows;
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
      {rows.map((r, i) => <Row key={i} row={r} />)}
      {showProof && (
        <p className={cn("flex items-center gap-2 border-t px-4 py-2 text-xs", ledger.proves ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-300")}>
          {ledger.proves ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleAlert className="size-3.5" aria-hidden />}
          {ledger.proves ? "Adds up" : "Does not add up"}: {ledger.proof}
        </p>
      )}
      {showInfo && ledger.info.map((x) => (
        <p key={x.label} className="border-t border-dashed px-4 py-2.5 text-sm"><b className="font-medium">{x.label}:</b> <span className="text-muted-foreground">{x.text}</span></p>
      ))}
    </div>
  );
}

/** Who pays for the price: the buyer in cash, the trade-in car and the lender. */
export function SourcesView({ rows, total, proves }: { rows: { label: string; note: string; amount: number }[]; total: number; proves: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
      {rows.map((r) => (
        <div key={r.label} className="flex items-start justify-between gap-6 border-t px-4 py-2.5 first:border-t-0">
          <div><p className="font-medium">{r.amount < 0 ? "We pay the buyer" : r.label}</p><p className="text-xs text-muted-foreground">{r.note}</p></div>
          <p className="tabular-nums">{formatPeso(Math.abs(r.amount))}</p>
        </div>
      ))}
      <div className="flex items-center justify-between border-t bg-muted px-4 py-2.5 font-semibold"><span>Agreed price</span><span className="tabular-nums">{formatPeso(total)}</span></div>
      <p className={cn("flex items-center gap-2 border-t px-4 py-2 text-xs", proves ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-800")}>
        {proves ? <CircleCheck className="size-3.5" aria-hidden /> : <CircleAlert className="size-3.5" aria-hidden />}{proves ? "Adds up to the agreed price" : "Does not add up to the agreed price"}
      </p>
    </div>
  );
}
