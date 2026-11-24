"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { History, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PAPER_VALUES } from "@/lib/docsbible/normalize";
import { canEditColumn, COLUMNS, EMPTY_GRID_FILTER, filterRows, GRID_CLASSIFICATIONS, STOCK_STATE_VALUES, VIEWS, type Col, type GridFilter, type GridRow, type ViewKey } from "@/lib/docsbible/grid";
import { editsPapers, isAdmin, type Role } from "@/lib/roles";
import type { HistoryRow } from "@/lib/docsbible/grid-server";
import { historyAction, saveCellAction } from "./actions";

const CHIP: Record<string, string> = {
  "Yes": "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200", "No": "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200",
  "To follow": "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200", "N/A": "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-300",
  "COMPLETE": "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200", "NOT YET": "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
};
const choicesOf = (c: Col): readonly string[] | null => c.kind === "paper" ? PAPER_VALUES : c.kind === "classification" ? GRID_CLASSIFICATIONS : c.kind === "stock_state" ? STOCK_STATE_VALUES : null;

export function DocsGrid({ initial, role }: { initial: GridRow[]; role: Role }) {
  const [rows, setRows] = useState(initial);
  const [view, setView] = useState<ViewKey>("checklist");
  const [f, setF] = useState<GridFilter>(EMPTY_GRID_FILTER);
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [remarks, setRemarks] = useState<{ row: GridRow; col: Col } | null>(null);
  const [history, setHistory] = useState<{ row: GridRow; list: HistoryRow[] | null } | null>(null);
  const [, start] = useTransition();

  const cols = useMemo(() => { const keys = new Set<string>(VIEWS[view].keys); return COLUMNS.filter((c) => keys.has(c.key)); }, [view]);
  const shown = useMemo(() => filterRows(rows, f), [rows, f]);
  const editable = (c: Col) => canEditColumn(role, c);

  /** Saves one cell; the table shows the new value at once and can take it back with Undo. */
  function save(row: GridRow, col: Col, value: string, undo = true) {
    const before = row.values[col.key] ?? null;
    setEditing(null);
    if ((value.trim() || null) === before) return;
    start(async () => {
      const r = await saveCellAction(row.id, col.key, value, before);
      if (!r.ok) { toast.error(r.message ?? "Could not save."); return; }
      setRows((all) => all.map((x) => (x.id === row.id ? { ...x, values: { ...x.values, [col.key]: r.value ?? null } } : x)));
      if (undo) toast.success(`${row.values.plate_display} · ${col.label} saved`, { action: { label: "Undo", onClick: () => start(async () => { const u = await saveCellAction(row.id, col.key, before ?? "", r.value ?? null); if (u.ok) { setRows((all) => all.map((x) => (x.id === row.id ? { ...x, values: { ...x.values, [col.key]: before } } : x))); toast.success("Put back."); } else toast.error(u.message ?? "Could not undo."); }) } });
    });
  }

  async function openHistory(row: GridRow) { setHistory({ row, list: null }); setHistory({ row, list: await historyAction(row.id) }); }

  const cell = (row: GridRow, col: Col) => {
    const v = col.key === "complete_docs" ? row.complete : row.values[col.key];
    const can = editable(col);
    const isEditing = editing?.id === row.id && editing.key === col.key;
    const choices = choicesOf(col);
    if (col.kind === "plate") return (
      <div className="flex items-center gap-1.5">
        <button type="button" className="font-mono text-xs font-medium underline-offset-2 hover:underline" onClick={() => openHistory(row)} title="History of this car">{v}</button>
        {row.decisions > 0 && <Link href="/data-check?tab=move" title="Needs a decision" className="text-amber-600"><TriangleAlert className="size-3.5" aria-label="Needs a decision" /></Link>}
      </div>
    );
    if (col.kind === "complete") return v ? <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CHIP[v] ?? ""}`}>{v}</span> : <span className="text-muted-foreground">—</span>;
    if (isEditing && choices) return (
      <NativeSelect autoFocus aria-label={col.label} className="h-7 text-xs" value={v ?? ""} onChange={(e) => save(row, col, e.target.value)} onBlur={() => setEditing(null)} onKeyDown={(e) => e.key === "Escape" && setEditing(null)}>
        {col.kind !== "classification" && <option value="">(empty)</option>}{choices.map((c) => <option key={c} value={c}>{c}</option>)}
      </NativeSelect>
    );
    if (isEditing) return <Input autoFocus aria-label={col.label} className="h-7 text-xs" defaultValue={v ?? ""} onBlur={(e) => save(row, col, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }} />;
    const shownText = v ?? "";
    const body = col.kind === "paper" && v ? <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${CHIP[v] ?? ""}`}>{v}</span>
      : col.kind === "classification" && v === "Not classified (legacy)" ? <span className="text-muted-foreground italic">Not classified</span>
      : col.kind === "remarks" ? <span className="block max-w-full truncate">{shownText.split("\n")[0]}</span>
      : <span className="block max-w-full truncate">{shownText}</span>;
    if (!can) return body;
    return (
      <button type="button" aria-label={`${col.label} of ${row.values.plate_display}`} className="block h-full min-h-6 w-full rounded text-left outline-offset-2 hover:bg-primary/5 focus-visible:outline-2"
        onClick={() => (col.kind === "remarks" ? setRemarks({ row, col }) : setEditing({ id: row.id, key: col.key }))}>{body || <span className="text-muted-foreground/50">·</span>}</button>
    );
  };

  const filterSelect = (label: string, value: string, set: (v: string) => void, options: [string, string][]) => (
    <NativeSelect aria-label={label} className="w-40" value={value} onChange={(e) => set(e.target.value)}><option value="">{label}: all</option>{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</NativeSelect>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden /><Input aria-label="Search" className="w-64 pl-8" placeholder="Search plate, car, owner, remarks" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div>
        {filterSelect("Classification", f.classification, (v) => setF({ ...f, classification: v }), [...GRID_CLASSIFICATIONS, "Not classified (legacy)"].map((c) => [c, c]))}
        {filterSelect("Complete", f.complete, (v) => setF({ ...f, complete: v }), [["COMPLETE", "COMPLETE"], ["NOT YET", "NOT YET"], ["NONE", "Not classified"]])}
        {filterSelect("State", f.state, (v) => setF({ ...f, state: v }), STOCK_STATE_VALUES.map((s) => [s, s]))}
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.needsDecision} onChange={(e) => setF({ ...f, needsDecision: e.target.checked })} /> Needs a decision</label>
        <span className="ml-auto text-sm text-muted-foreground">{shown.length} of {rows.length} cars</span>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Columns shown">
        {(Object.keys(VIEWS) as ViewKey[]).map((k) => <Button key={k} role="tab" aria-selected={view === k} size="sm" variant={view === k ? "default" : "outline"} onClick={() => setView(k)}>{VIEWS[k].label}</Button>)}
        <span className="ml-auto flex flex-wrap gap-1.5 text-[11px]">{["Yes", "No", "To follow", "N/A"].map((x) => <span key={x} className={`rounded px-1.5 py-0.5 font-medium ${CHIP[x]}`}>{x}</span>)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{isAdmin(role) ? "Click any cell to change it." : editsPapers(role) ? "Click a paper cell (classification, the papers, remarks) to change it. The other columns are read only." : "You can look at everything here; you cannot change it."} Every change is saved at once and kept in the car&apos;s history (click the plate).</p>

      <div className="max-h-[70svh] overflow-auto rounded-xl ring-1 ring-foreground/10">
        <table className="border-separate border-spacing-0 text-sm" style={{ minWidth: cols.reduce((n, c) => n + c.width, 0) }}>
          <thead>
            <tr>{cols.map((c, i) => <th key={c.key} title={c.letter === "AQ" || c.letter === "AR" || c.letter === "AS" ? "New in MAD" : `Column ${c.letter} in the old sheet`} style={{ minWidth: c.width, maxWidth: c.width }} className={`sticky top-0 border-b bg-muted px-2 py-2 text-left text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase ${i === 0 ? "left-0 z-30 border-r" : "z-20"}`}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-8 text-center text-muted-foreground">No car matches.</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} className="group">
                {cols.map((c, i) => <td key={c.key} style={{ minWidth: c.width, maxWidth: c.width }} className={`border-b px-2 py-1 align-middle text-xs group-hover:bg-muted/40 ${i === 0 ? "sticky left-0 z-10 border-r bg-background" : ""}`}>{cell(r, c)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RemarksDialog target={remarks} onClose={() => setRemarks(null)} onSave={(row, col, v) => { save(row, col, v); setRemarks(null); }} />
      <ResponsiveDialog open={!!history} onOpenChange={(o) => !o && setHistory(null)} title={history ? `History of ${history.row.values.plate_display}` : ""} description="Every change to this car: who, when, from what to what.">
        <div className="max-h-[60svh] space-y-2 overflow-auto text-sm">
          {history?.list === null && <p className="text-muted-foreground">Loading…</p>}
          {history?.list?.length === 0 && <p className="text-muted-foreground">No changes yet.</p>}
          {history?.list?.map((h, i) => (
            <div key={i} className="rounded-lg border p-2.5">
              <p className="flex flex-wrap items-center gap-2 font-medium"><History className="size-3.5" aria-hidden />{h.field}<span className="text-xs font-normal text-muted-foreground">{new Date(h.at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })} · {h.actor ?? (h.source === "import" ? "moved from the Google Sheet" : h.source)}</span></p>
              <p className="mt-1 break-words text-xs"><span className="text-muted-foreground">{h.before ?? "(empty)"}</span> → <b>{h.after ?? "(empty)"}</b></p>
            </div>
          ))}
        </div>
      </ResponsiveDialog>
    </div>
  );
}

function RemarksDialog({ target, onClose, onSave }: { target: { row: GridRow; col: Col } | null; onClose: () => void; onSave: (row: GridRow, col: Col, v: string) => void }) {
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null);
  const key = target ? `${target.row.id}:${target.col.key}` : "";
  const textNow = draft?.key === key ? draft.text : target?.row.values[target.col.key] ?? "";
  return (
    <ResponsiveDialog open={!!target} onOpenChange={(o) => { if (!o) { setDraft(null); onClose(); } }} title={target ? `${target.col.label} · ${target.row.values.plate_display}` : ""} description="Type the note. A new line is fine.">
      <div className="space-y-3">
        <textarea aria-label="Remarks" className="min-h-40 w-full rounded-lg border bg-background p-2 text-sm" value={textNow} onChange={(e) => setDraft({ key, text: e.target.value })} />
        <div className="flex gap-2"><Button onClick={() => { if (target) onSave(target.row, target.col, textNow); setDraft(null); }}>Save</Button><Button variant="ghost" onClick={() => { setDraft(null); onClose(); }}>Cancel</Button></div>
      </div>
    </ResponsiveDialog>
  );
}
