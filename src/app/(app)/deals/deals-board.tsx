"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { DealStatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatPeso } from "@/lib/rules/money";
import { formatDate } from "@/lib/dates";
import { STATUS_LABELS, STATUS_ORDER, relativeDay, type DealStatusKey } from "@/lib/deal/status";

export interface BoardDeal {
  id: string;
  /** where the row opens (the car's Sale and transfer tab) */
  href: string;
  dealNo: string;
  unitName: string;
  plates: string;
  buyerName: string;
  createdByName: string;
  saleType: "cash" | "financing";
  institution: string | null;
  price: number;
  received: number;
  balance: number;
  dueDate: string | null;
  dueText: string | null;
  status: DealStatusKey;
  receiptCount: number;
  searchText: string;
}

const FILTERS: ("all" | DealStatusKey)[] = ["all", "open", "soon", "overdue", "lender", "settled", "cancelled"];

export function DealsBoard({ deals, today }: { deals: BoardDeal[]; today: string }) {
  const [filter, setFilter] = useState<"all" | DealStatusKey>("all");
  const [q, setQ] = useState("");
  const count = (f: "all" | DealStatusKey) => (f === "all" ? deals.length : deals.filter((d) => d.status === f).length);
  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return deals
      .filter((d) => (filter === "all" || d.status === filter) && words.every((w) => d.searchText.includes(w)))
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
  }, [deals, filter, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search buyer, plate, car, receipt no. or salesperson" className="pl-8" aria-label="Search deals" />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
              className={cn("rounded-full border px-3 py-1 text-sm font-medium transition-colors", filter === f ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {f === "all" ? "All" : STATUS_LABELS[f]} <span className="text-xs opacity-70">{count(f)}</span>
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border p-10 text-center text-muted-foreground">No deals match. Try another word or filter.</p>
      ) : (
        <>
        <ul className="space-y-3 lg:hidden">
          {rows.map((d) => (
            <li key={d.id}>
              <Link href={d.href} className="block space-y-3 rounded-xl p-4 ring-1 ring-foreground/10 active:bg-muted/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-medium break-words">{d.unitName}</p><p className="font-mono text-xs text-muted-foreground">{d.plates}</p></div>
                  <DealStatusBadge status={d.status} />
                </div>
                <p className="text-sm">{d.buyerName} <span className="text-muted-foreground">· {d.saleType === "financing" ? `Financing${d.institution ? `, ${d.institution}` : ""}` : "Cash"} · {d.createdByName}</span></p>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Price</dt><dd className="tabular-nums">{formatPeso(d.price)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Received</dt><dd className="tabular-nums">{formatPeso(d.received)}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Balance</dt><dd className={cn("font-semibold tabular-nums", d.status === "overdue" && "text-destructive")}>{d.status === "cancelled" ? "—" : formatPeso(Math.max(0, d.balance))}</dd></div>
                </dl>
                <p className="text-xs text-muted-foreground">
                  {d.status === "cancelled" || d.balance <= 0 ? "" : d.dueDate ? <span className={d.status === "overdue" ? "text-destructive" : ""}>Due {formatDate(d.dueDate)} · {relativeDay(d.dueDate, today)} · </span> : d.dueText ? `${d.dueText} · ` : ""}
                  {d.receiptCount} {d.receiptCount === 1 ? "receipt" : "receipts"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-xl ring-1 ring-foreground/10 lg:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>{["Car", "Buyer", "Sale", "Price", "Received", "Balance", "Due", "Status", "Receipts"].map((h, i) => <th key={h} className={cn("px-4 py-2.5 font-medium", i >= 3 && i <= 5 && "text-right")}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-3"><Link href={d.href} className="font-medium underline-offset-2 hover:underline">{d.unitName}</Link><p className="font-mono text-xs text-muted-foreground">{d.plates}</p></td>
                  <td className="px-4 py-3">{d.buyerName}<p className="text-xs text-muted-foreground">{d.createdByName}</p></td>
                  <td className="px-4 py-3">{d.saleType === "financing" ? <>Financing<p className="text-xs text-muted-foreground">{d.institution}</p></> : "Cash"}</td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatPeso(d.price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatPeso(d.received)}</td>
                  <td className={cn("px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap", d.status === "overdue" && "text-destructive")}>{d.status === "cancelled" ? "—" : formatPeso(Math.max(0, d.balance))}</td>
                  <td className="px-4 py-3">
                    {d.status === "cancelled" || d.balance <= 0 ? "—" : d.dueDate ? <>{formatDate(d.dueDate)}<p className={cn("text-xs", d.status === "overdue" ? "text-destructive" : "text-muted-foreground")}>{relativeDay(d.dueDate, today)}</p></> : (d.dueText ?? "No date")}
                  </td>
                  <td className="px-4 py-3"><DealStatusBadge status={d.status} /></td>
                  <td className="px-4 py-3">{d.receiptCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
