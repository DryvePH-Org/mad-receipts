"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Pill, type Tone } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { Hold, Purchase } from "@/lib/dashboard/buy";
import { waitingFor, type Alert, type Pending, type Sale } from "@/lib/dashboard/sell";
import { daysBetween, formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { names, peso } from "./parts";

// The lists on the dashboards, each with a search box and filters. Wide tables on a laptop, cards on a phone.

const sub = "text-xs font-normal text-muted-foreground";
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const upper = (list: string[]) => list.map((n) => n.toUpperCase());

interface Filter<T> { id: string; label: string; all: string; options: string[]; pick: (row: T) => string[] }
interface Column<T> { head: string; cell: (row: T) => ReactNode; right?: boolean }

interface Detail<T> { title: (row: T) => string; body: (row: T) => ReactNode }

function Board<T>({ rows, search, filters, columns, card, empty, note, extra, detail }: {
  rows: T[]; search: (row: T) => string; filters: Filter<T>[]; columns: Column<T>[]; card: (row: T) => ReactNode; empty: string; note?: (shown: T[]) => ReactNode; extra?: ReactNode; detail?: Detail<T>;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<T | null>(null);
  const opener = (r: T) => (detail ? { role: "button" as const, tabIndex: 0, onClick: () => setOpen(r), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(r); } }, "aria-label": `Details: ${detail.title(r)}` } : {});
  const [picked, setPicked] = useState<Record<string, string>>({});
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      const hay = search(r).toLowerCase();
      return words.every((w) => hay.includes(w)) && filters.every((f) => !picked[f.id] || f.pick(r).includes(picked[f.id]));
    });
  }, [rows, q, picked, filters, search]);
  const active = q.trim() !== "" || Object.values(picked).some(Boolean);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search unit, plate, buyer, salesman…" aria-label="Search" className="pl-8" /></div>
        {filters.map((f) => (
          <div key={f.id} className="w-full sm:w-44"><NativeSelect aria-label={f.label} value={picked[f.id] ?? ""} onChange={(e) => setPicked({ ...picked, [f.id]: e.target.value })}>
            <option value="">{f.all}</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </NativeSelect></div>
        ))}
        {extra}
        {active && <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground underline" onClick={() => { setQ(""); setPicked({}); }}><X className="size-3.5" aria-hidden /> Clear</button>}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">Showing {shown.length} of {rows.length}{note?.(shown)}</p>
      {shown.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{rows.length === 0 ? empty : "Nothing matches. Clear the search or a filter."}</p> : (
        <>
          <ul className="space-y-2 lg:hidden">{shown.map((r, i) => <li key={i} {...opener(r)} className={cn("rounded-xl p-3 ring-1 ring-foreground/10", detail && "cursor-pointer hover:bg-muted/50")}>{card(r)}</li>)}</ul>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase"><tr>{columns.map((c) => <th key={c.head} className={cn("px-2 py-2 font-medium", c.right && "text-right")}>{c.head}</th>)}</tr></thead>
              <tbody>{shown.map((r, i) => <tr key={i} {...opener(r)} className={cn("border-t align-top", detail && "cursor-pointer hover:bg-muted/50")}>{columns.map((c, j) => <td key={c.head} className={cn("px-2 py-2.5", j === 0 && "font-medium", c.right && "text-right tabular-nums")}>{c.cell(r)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </>
      )}
      {detail && <ResponsiveDialog open={open !== null} onOpenChange={(o) => { if (!o) setOpen(null); }} title={open ? detail.title(open) : "Details"} className="sm:max-w-xl">{open && detail.body(open)}</ResponsiveDialog>}
    </div>
  );
}

/** A list of label and value lines. Empty values are left out. */
function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="divide-y text-sm">
      {items.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== "—").map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-1.5"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium break-words">{v}</dd></div>)}
    </dl>
  );
}

function SheetLink({ href }: { href: string | null }) {
  return href ? <a href={href} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm underline"><ExternalLink className="size-3.5" aria-hidden /> Open this row in the sheet</a> : null;
}

const unitOf = (s: Sale) => <div>{s.unit || "Unit not written"}{s.transmission && <span className={sub}> {s.transmission}</span>}<p className={sub}><span className="font-mono">{s.plate}</span>{s.buyer && ` · ${s.buyer}`}</p></div>;
const peopleOf = (s: Sale) => <div>{names(s.salesman)}<p className={sub}>Marketing: {names(s.marketing)}</p></div>;
const howOf = (s: Sale) => <div>{s.kind}<p className={sub}>{s.source || "No source"}</p></div>;
const kinds = (rows: Sale[]) => ["Cash", "Financing", "Trade-in"].filter((k) => rows.some((r) => kindMatches(r, k)));
const kindMatches = (s: Sale, k: string) => (k === "Cash" ? s.kind.startsWith("Cash") : k === "Financing" ? s.kind.startsWith("Financing") : s.kind.includes("trade-in"));
const sellerOptions = (rows: Sale[]) => [...new Set(rows.flatMap((r) => upper(r.salesman)))].sort();

function SaleDetails({ s }: { s: Sale | Pending }) {
  const owes = s.balance ?? 0;
  const dated = (amount: number | null, date: string) => (amount ? `${peso(amount)}${date ? ` on ${date}` : ""}` : "");
  const pend = "alert" in s ? s : null;
  return (
    <div className="space-y-4">
      <Facts items={[
        ["Plate", s.plate], ["Buyer", s.buyer], ["Contact", s.contact], ["Status in the sheet", s.status],
        ["Salesman", names(s.salesman)], ["Marketing", names(s.marketing)], ["Transaction", s.kind], ["Source", s.source],
        ["Released", s.releaseDate ? formatDate(s.releaseDate) : ""],
        ...(pend ? [["Waiting for", waitingFor(s).label], ["Deadline", pend.due ? `${formatDate(pend.due)} (${pend.dueSource})` : "None"]] as [string, ReactNode][] : []),
        ["Note", s.note],
      ]} />
      <div>
        <h4 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Money</h4>
        <Facts items={[
          ["Listing price", s.listingPrice ? peso(s.listingPrice) : ""], ["Target price", s.targetPrice ? peso(s.targetPrice) : ""], ["Selling price", s.agreedPrice ? peso(s.agreedPrice) : ""],
          ["Paid at reservation", dated(s.reservation, s.reservationDate)], ["Partial payment", dated(s.partial, s.partialDate)], ["Full payment", dated(s.full, s.fullDate)],
          [`Loan from ${s.financingFirm || "the lender"}`, s.financingAmount ? peso(s.financingAmount) : ""], [`Trade-in${s.tradeInUnit ? `: ${s.tradeInUnit}` : ""}`, s.tradeInAmount ? peso(s.tradeInAmount) : ""],
          [owes < 0 ? "Overpaid by" : "Buyer still owes", s.balance === null ? "" : peso(Math.abs(owes))],
        ]} />
      </div>
      {s.history.length > 1 && (
        <div>
          <h4 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Every row for this car and buyer</h4>
          <ol className="space-y-1 text-sm">{s.history.map((h) => <li key={`${h.tab}${h.row}`} className="flex justify-between gap-3"><span>{h.status || "No status"}{h.releaseDate ? ` · released ${formatDate(h.releaseDate)}` : h.reservationDate ? ` · reserved ${h.reservationDate}` : ""}</span><span className="text-xs text-muted-foreground">{h.tab.replace(/_Sold$/, "")} row {h.row}</span></li>)}</ol>
          <p className="mt-1 text-xs text-muted-foreground">The newest row is the one that counts.</p>
        </div>
      )}
      <SheetLink href={s.link} />
    </div>
  );
}
const saleDetail: Detail<Sale> = { title: (s) => `${s.unit || "Unit"} · ${s.plate}`, body: (s) => <SaleDetails s={s} /> };

// ---------------- sell: pending sales ----------------

const ALERT: Record<Alert, [Tone, string]> = { overdue: ["red", "Overdue"], "due-today": ["amber", "Due today"], soon: ["amber", "Due soon"], none: ["grey", "On time"] };
const alertPill = (s: Pending) => <Pill tone={ALERT[s.alert][0]}>{s.alert === "overdue" ? `Overdue ${s.daysLate} ${s.daysLate === 1 ? "day" : "days"}` : s.due ? ALERT[s.alert][1] : "No deadline"}</Pill>;

/** What the buyer paid, what the lender pays, and what the buyer still owes: each in plain English. */
function Money({ s }: { s: Sale }) {
  const owes = s.balance ?? 0;
  const line = (label: string, value: string, strong = false) => <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className={cn("tabular-nums", strong && "font-medium")}>{value}</dd></div>;
  return (
    <dl className="min-w-52 space-y-0.5 text-xs font-normal">
      {line("Selling price", peso(s.agreedPrice ?? s.listingPrice), true)}
      {(s.reservation ?? 0) > 0 && line("Paid at reservation", peso(s.reservation))}
      {(s.financingAmount ?? 0) > 0 && line(`Loan from ${s.financingFirm || "the lender"}`, peso(s.financingAmount))}
      {line(owes < 0 ? "Overpaid by" : "Buyer still owes", peso(Math.abs(owes)), owes > 0)}
    </dl>
  );
}

export function PendingBoard({ rows }: { rows: Pending[] }) {
  const filters: Filter<Pending>[] = [
    { id: "who", label: "Salesman", all: "All salesmen", options: sellerOptions(rows), pick: (r) => upper(r.salesman) },
    { id: "alert", label: "Deadline", all: "Any deadline", options: ["Overdue", "Due today", "Due soon", "On time or no deadline"], pick: (r) => [r.alert === "overdue" ? "Overdue" : r.alert === "due-today" ? "Due today" : r.alert === "soon" ? "Due soon" : "On time or no deadline"] },
    { id: "kind", label: "Transaction", all: "Any transaction", options: kinds(rows), pick: (r) => ["Cash", "Financing", "Trade-in"].filter((k) => kindMatches(r, k)) },
  ];
  const deadline = (s: Pending) => <div className="space-y-0.5">{alertPill(s)}{s.due && <p className={sub}>{formatDate(s.due)} · {s.dueSource === "cleaning date" ? "cleaning date" : "reserved + days"}</p>}{s.daysOpen !== null && <p className={sub}>Reserved {s.daysOpen} days ago</p>}</div>;
  return (
    <Board rows={rows} detail={saleDetail as Detail<Pending>} search={(r) => `${r.unit} ${r.plate} ${r.buyer} ${r.salesman.join(" ")} ${r.marketing.join(" ")} ${r.source} ${r.kind}`} filters={filters} empty="No pending sales."
      columns={[
        { head: "Unit, plate and buyer", cell: unitOf }, { head: "Deadline", cell: deadline }, { head: "Money", cell: (s) => <Money s={s} /> },
        { head: "Waiting for", cell: (s) => <span className="font-normal">{waitingFor(s).label}</span> }, { head: "Salesman and marketing", cell: peopleOf }, { head: "Transaction and source", cell: howOf },
      ]}
      card={(s) => <div className="space-y-2"><div className="flex items-start justify-between gap-2">{unitOf(s)}{alertPill(s)}</div><Money s={s} /><p className="text-sm">{waitingFor(s).label}</p><div className="flex flex-wrap justify-between gap-2 text-sm">{peopleOf(s)}{howOf(s)}</div>{s.due && <p className={sub}>Deadline {formatDate(s.due)} · {s.dueSource}</p>}</div>} />
  );
}

// ---------------- sell: released sales ----------------

export function ReleasedBoard({ rows, defaultMonth }: { rows: Sale[]; defaultMonth: string }) {
  const months = [...new Set(rows.map((r) => r.releaseDate!.slice(0, 7)))].sort().reverse();
  const [month, setMonth] = useState(months.includes(defaultMonth) ? defaultMonth : months[0] ?? "");
  const inMonth = useMemo(() => (month === "all" ? rows : rows.filter((r) => r.releaseDate!.startsWith(month))), [rows, month]);
  const filters: Filter<Sale>[] = [
    { id: "who", label: "Salesman", all: "All salesmen", options: sellerOptions(rows), pick: (r) => upper(r.salesman) },
    { id: "kind", label: "Transaction", all: "Any transaction", options: kinds(rows), pick: (r) => ["Cash", "Financing", "Trade-in"].filter((k) => kindMatches(r, k)) },
  ];
  const picker = (
    <div className="w-full sm:w-48"><NativeSelect aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
      {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}<option value="all">All months</option>
    </NativeSelect></div>
  );
  return (
    <Board rows={inMonth} detail={saleDetail} search={(r) => `${r.unit} ${r.plate} ${r.buyer} ${r.salesman.join(" ")} ${r.marketing.join(" ")} ${r.source} ${r.kind}`} filters={filters} extra={picker} empty="Nothing was released in this month."
      note={(shown) => ` · ${peso(shown.reduce((n, s) => n + (s.agreedPrice ?? 0), 0))} in selling price`}
      columns={[
        { head: "Unit, plate and buyer", cell: unitOf }, { head: "Released", cell: (s) => (s.releaseDate ? formatDate(s.releaseDate) : "—") }, { head: "Selling price", cell: (s) => peso(s.agreedPrice ?? s.listingPrice), right: true },
        { head: "Salesman and marketing", cell: peopleOf }, { head: "Transaction and source", cell: howOf },
      ]}
      card={(s) => <div className="space-y-1.5"><div className="flex items-start justify-between gap-2">{unitOf(s)}<b className="tabular-nums">{peso(s.agreedPrice ?? s.listingPrice)}</b></div><p className={sub}>Released {s.releaseDate ? formatDate(s.releaseDate) : "—"}</p><div className="flex flex-wrap justify-between gap-2 text-sm">{peopleOf(s)}{howOf(s)}</div></div>} />
  );
}

// ---------------- buy ----------------

const holdDetail: Detail<Hold> = {
  title: (h) => `${h.unit || "Unit"} · ${h.plate}`,
  body: (h) => <div><Facts items={[["Purchaser", names(h.purchaser)], ["Hold amount", h.holdAmount ? peso(h.holdAmount) : ""], ["Held since", h.since ? formatDate(h.since) : ""], ["Date of release", h.out ? formatDate(h.out) : "Not out yet"], ["Agreed price", h.agreedPrice ? peso(h.agreedPrice) : ""], ["Bank", h.bank], ["Bank payoff", h.payoff ? peso(h.payoff) : ""], ["Balance to the seller", h.balanceToClient ? peso(h.balanceToClient) : ""], ["Lacking", h.lacking], ["Remarks", h.remarks]]} /><SheetLink href={h.link} /></div>,
};

const purchaseDetail: Detail<Purchase> = {
  title: (p) => `${p.unit || "Unit"} · ${p.plate}`,
  body: (p) => <div><Facts items={[["Bought on", p.date ? formatDate(p.date) : ""], ["Amount", p.price !== null ? peso(p.price) : p.priceText], ["Agent fee", p.agentFee ? peso(p.agentFee) : ""], ["Bought by", names(p.team)], ["Appraised by", names([p.appraiser].filter(Boolean))], ["Source", p.source], ["Bank", p.bank], ["Payoff", p.payoff], ["Hold amount", p.hold ? peso(p.hold) : ""], ["Color", p.color], ["Mileage", p.mileage], ["Fuel", p.fuel], ["Transmission", p.transmission], ["Reservation", p.reservation], ["Month tab", p.tab]]} /><SheetLink href={p.link} /></div>,
};

export function HoldBoard({ rows, today }: { rows: Hold[]; today: string }) {
  const who = [...new Set(rows.flatMap((r) => upper(r.purchaser)))].sort();
  const banks = [...new Set(rows.map((r) => r.bank).filter(Boolean))].sort();
  const filters: Filter<Hold>[] = [
    { id: "who", label: "Purchaser", all: "All purchasers", options: who, pick: (r) => upper(r.purchaser) },
    { id: "bank", label: "Bank", all: "Any bank", options: banks, pick: (r) => [r.bank] },
  ];
  const age = (h: Hold) => (h.since ? <span>{formatDate(h.since)} <span className={sub}>({daysBetween(h.since, today)} days)</span></span> : "—");
  const unit = (h: Hold) => <div>{h.unit} <span className="font-mono text-xs text-muted-foreground">{h.plate}</span><p className={sub}>{[h.lacking && `Lacking: ${h.lacking}`, h.bank && `Bank: ${h.bank}`, h.remarks].filter(Boolean).join(" · ") || "No remarks"}</p></div>;
  return (
    <Board rows={rows} detail={holdDetail} search={(r) => `${r.unit} ${r.plate} ${r.purchaser.join(" ")} ${r.bank} ${r.lacking} ${r.remarks}`} filters={filters} empty="No holds waiting."
      columns={[{ head: "Unit and remarks", cell: unit }, { head: "Hold amount", cell: (h) => peso(h.holdAmount), right: true }, { head: "Purchaser", cell: (h) => names(h.purchaser) }, { head: "Held since", cell: age }, { head: "Date of release", cell: (h) => (h.out ? formatDate(h.out) : <Pill tone="amber">Not out yet</Pill>) }]}
      card={(h) => <div className="space-y-1.5"><div className="flex items-start justify-between gap-2">{unit(h)}<b className="tabular-nums">{peso(h.holdAmount)}</b></div><div className="flex flex-wrap justify-between gap-2 text-sm"><span>{names(h.purchaser)}</span>{age(h)}</div><div>{h.out ? <span className={sub}>Out {formatDate(h.out)}</span> : <Pill tone="amber">Not out yet</Pill>}</div></div>} />
  );
}

export function PurchasesBoard({ rows, defaultTab, tabs }: { rows: (Purchase & { monthLabel: string })[]; defaultTab: string; tabs: string[] }) {
  const [tab, setTab] = useState(tabs.includes(defaultTab) ? defaultTab : tabs[0] ?? "");
  const inTab = useMemo(() => (tab === "all" ? rows : rows.filter((r) => r.tab === tab)), [rows, tab]);
  const filters: Filter<Purchase & { monthLabel: string }>[] = [
    { id: "who", label: "Purchaser", all: "All purchasers", options: [...new Set(rows.flatMap((r) => upper(r.team)))].sort(), pick: (r) => upper(r.team) },
    { id: "app", label: "Appraiser", all: "All appraisers", options: [...new Set(rows.map((r) => r.appraiser).filter(Boolean))].sort(), pick: (r) => [r.appraiser] },
  ];
  const picker = (
    <div className="w-full sm:w-48"><NativeSelect aria-label="Month" value={tab} onChange={(e) => setTab(e.target.value)}>
      {tabs.map((t) => <option key={t} value={t}>{t}</option>)}<option value="all">All months</option>
    </NativeSelect></div>
  );
  const unit = (p: Purchase) => <div>{p.unit || "Unit not written"}<p className={sub}><span className="font-mono">{p.plate}</span> · {p.date ? formatDate(p.date) : "no date"}</p></div>;
  const how = (p: Purchase) => <div>{p.source || "No source"}<p className={sub}>{p.bank || "No bank noted"}</p></div>;
  return (
    <Board rows={inTab} detail={purchaseDetail} search={(r) => `${r.unit} ${r.plate} ${r.team.join(" ")} ${r.appraiser} ${r.source} ${r.bank}`} filters={filters} extra={picker} empty="No purchases in this month's tab."
      note={(shown) => ` · ${peso(shown.reduce((n, p) => n + (p.price ?? 0), 0))} bought`}
      columns={[{ head: "Unit, plate and date", cell: unit }, { head: "Amount", cell: (p) => (p.price !== null ? peso(p.price) : p.priceText || "—"), right: true }, { head: "Purchaser", cell: (p) => names(p.team) }, { head: "Appraiser", cell: (p) => names([p.appraiser].filter(Boolean)) }, { head: "Source and bank", cell: how }]}
      card={(p) => <div className="space-y-1.5"><div className="flex items-start justify-between gap-2">{unit(p)}<b className="tabular-nums">{p.price !== null ? peso(p.price) : p.priceText || "—"}</b></div><div className="flex flex-wrap justify-between gap-2 text-sm"><span>Bought by {names(p.team)}</span><span>Appraised by {names([p.appraiser].filter(Boolean))}</span></div>{how(p)}</div>} />
  );
}
