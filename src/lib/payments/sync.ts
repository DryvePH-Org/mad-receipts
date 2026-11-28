import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrivateSheet, PASSBOOK_SHEET_ID, privateRows, privateTabs } from "@/lib/dashboard/sheets";
import { selectAll } from "@/lib/supabase/select-all";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBankTab, parseSalesTab } from "./parse";
import { dueTabs, wantedTabs } from "./plan";
import type { Line, Pay } from "./summary";

// Copies the tabs of the 2026 Sales Passbook Monitoring sheet into MAD (sheet to MAD only; nothing is ever written to the sheet). Tabs are copied a few at a time, the first copy
// of the whole year fills in by itself over a few runs; after that only the current month is copied, once a day. The Super Admin's refresh button copies every tab.

const db = (): SupabaseClient => createAdminClient() as unknown as SupabaseClient;

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Scheduled runs ask Apps Script nothing while everything is copied and the current month was copied less than a day ago (a restart asks once more). */
let quietUntil = 0;

export async function syncPaymentSheets(opts: { maxTabs?: number; force?: boolean; today?: string; now?: number } = {}): Promise<{ copied: { tab: string; rows: number }[]; failed: { tab: string; error: string }[]; skipped?: string }> {
  if (!isPrivateSheet(PASSBOOK_SHEET_ID)) return { copied: [], failed: [], skipped: "the Google Apps Script bridge is not set up for this sheet" };
  if (!opts.force && Date.now() < quietUntil) return { copied: [], failed: [] };
  const client = db(), now = opts.now ?? Date.now(), today = opts.today ?? new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
  const { data: stateRows } = await client.from("sheet_sync_tabs").select("tab, synced_at");
  const state = new Map((stateRows ?? []).map((r) => [String(r.tab), { synced_at: (r.synced_at as string | null) ?? null }]));
  const tabs = await privateTabs(PASSBOOK_SHEET_ID);
  const all = dueTabs(wantedTabs(tabs.map((t) => t.name)), state, today, now, opts.force);
  const due = all.slice(0, opts.maxTabs ?? 3);
  if (!opts.force && all.length === 0) quietUntil = Date.now() + 60 * 60_000; // nothing due: look again in an hour (the current month turns due once a day)
  const copied: { tab: string; rows: number }[] = [], failed: { tab: string; error: string }[] = [];
  for (const w of due) {
    try {
      const rows = await privateRows(PASSBOOK_SHEET_ID, w.tab);
      const stamp = new Date(now).toISOString();
      if (w.kind === "bank") {
        const lines = parseBankTab(rows, w.tab);
        await client.from("sheet_bank_lines").delete().eq("tab", w.tab);
        for (const part of chunk(lines, 400)) {
          const { error } = await client.from("sheet_bank_lines").insert(part.map((l) => ({ tab: l.tab, row_no: l.row, account: l.account, line_date: l.date, tc: l.tc, ref: l.ref, particulars: l.particulars, plate_no: l.plate, debit: l.debit, credit: l.credit, balance: l.balance, remarks: l.remarks, txn_type: l.type, mode: l.mode, note: l.note, synced_at: stamp })));
          if (error) throw new Error(error.message);
        }
        copied.push({ tab: w.tab, rows: lines.length });
      } else {
        const pays = parseSalesTab(rows, w.tab);
        await client.from("sheet_sale_payments").delete().eq("tab", w.tab);
        for (const part of chunk(pays, 400)) {
          const { error } = await client.from("sheet_sale_payments").insert(part.map((p) => ({ tab: p.tab, row_no: p.row, stage: p.stage, buyer: p.buyer, plate_no: p.plate, sale_type: p.saleType, agreed_price: p.agreedPrice, bank: p.bank, pay_date: p.date, amount: p.amount, ar_no: p.arNo, synced_at: stamp })));
          if (error) throw new Error(error.message);
        }
        copied.push({ tab: w.tab, rows: pays.length });
      }
      await client.from("sheet_sync_tabs").upsert({ tab: w.tab, kind: w.kind, rows_copied: copied[copied.length - 1].rows, synced_at: stamp, error: null }, { onConflict: "tab" });
    } catch (e) {
      const error = (e instanceof Error ? e.message : "unknown").slice(0, 300);
      failed.push({ tab: w.tab, error });
      await client.from("sheet_sync_tabs").upsert({ tab: w.tab, kind: w.kind, error, synced_at: state.get(w.tab)?.synced_at ?? null }, { onConflict: "tab" });
    }
  }
  return { copied, failed };
}

/** Everything the Payments tab needs, read from MAD's own copy (fast). */
export async function loadPaymentsData(): Promise<{ lines: Line[]; pays: (Pay & { bank: string })[]; synced: { tabs: number; latest: string | null; failing: number } }> {
  const client = db();
  const [lines, pays, { data: state }] = await Promise.all([
    selectAll<{ tab: string; row_no: number; account: string; line_date: string; debit: number | string | null; credit: number | string | null; balance: number | string | null; txn_type: string; mode: string; plate_no: string }>((from, to) => client.from("sheet_bank_lines").select("tab, row_no, account, line_date, debit, credit, balance, txn_type, mode, plate_no").order("line_date").order("tab").order("row_no").range(from, to) as unknown as PromiseLike<{ data: never[] | null; error: { message: string } | null }>),
    selectAll<{ tab: string; row_no: number; stage: string; buyer: string; plate_no: string; bank: string; pay_date: string | null; amount: number | string; ar_no: string }>((from, to) => client.from("sheet_sale_payments").select("tab, row_no, stage, buyer, plate_no, bank, pay_date, amount, ar_no").order("tab").order("row_no").range(from, to) as unknown as PromiseLike<{ data: never[] | null; error: { message: string } | null }>),
    client.from("sheet_sync_tabs").select("tab, synced_at, error"),
  ]);
  const n = (v: number | string | null) => (v === null ? null : Number(v));
  const synced = (state ?? []).map((s) => s.synced_at as string | null).filter((x): x is string => !!x).sort();
  return {
    lines: lines.map((l) => ({ account: l.account, date: l.line_date, debit: n(l.debit), credit: n(l.credit), balance: n(l.balance), type: l.txn_type, mode: l.mode as Line["mode"], plate: l.plate_no, row: l.row_no, tab: l.tab })),
    pays: pays.map((p) => ({ stage: p.stage as Pay["stage"], bank: p.bank, amount: Number(p.amount), arNo: p.ar_no, date: p.pay_date, buyer: p.buyer, plate: p.plate_no, tab: p.tab, row: p.row_no })),
    synced: { tabs: (state ?? []).length, latest: synced[synced.length - 1] ?? null, failing: (state ?? []).filter((s) => !!s.error).length },
  };
}
