import "server-only";
import { manilaToday } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { backupName, exportHeader, exportRow, toCsv } from "./export";
import { COLUMNS } from "./grid";
import { docsDb } from "./review-server";

const BUCKET = "docs-backups";
const KEEP_DAYS = 30;

/** Every current car, in the order of the old sheet (its row number), as CSV text. */
export async function buildExport(): Promise<{ csv: string; count: number; name: string }> {
  const db = docsDb();
  const [units, comp] = await Promise.all([
    db.from("docs_units").select("*").is("archived_at", null).order("source_row", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }).limit(20000),
    db.from("docs_complete").select("id, complete_docs").limit(20000),
  ]);
  if (units.error) throw new Error(`Could not read the register: ${units.error.message}`);
  const complete = new Map((comp.data ?? []).map((c) => [c.id as string, c.complete_docs as string | null]));
  const rows = (units.data ?? []).map((u: Record<string, unknown>) => {
    const values: Record<string, string | null> = {};
    for (const c of COLUMNS) values[c.key] = (u[c.key] as string | null) ?? null;
    return exportRow(values, complete.get(u.id as string) ?? null);
  });
  return { csv: toCsv([exportHeader(), ...rows]), count: rows.length, name: backupName(manilaToday()) };
}

export interface SavedCopy { name: string; at: string | null; size: number | null }

export async function listSavedCopies(): Promise<SavedCopy[]> {
  const { data } = await createAdminClient().storage.from(BUCKET).list("", { limit: 200, sortBy: { column: "name", order: "desc" } });
  return (data ?? []).filter((f) => f.name.endsWith(".csv")).map((f) => ({ name: f.name, at: f.created_at ?? null, size: (f.metadata as { size?: number } | null)?.size ?? null }));
}

/** One saved copy a day: written if today's is not there yet, and copies older than 30 days are removed. Safe to call every few minutes. */
export async function saveDailyCopy(): Promise<{ saved: boolean; name: string; count?: number; removed: number }> {
  const store = createAdminClient().storage.from(BUCKET);
  const name = backupName(manilaToday());
  const have = await listSavedCopies();
  let removed = 0;
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const old = have.filter((f) => (/docs-bible-(\d{4}-\d{2}-\d{2})\.csv/.exec(f.name)?.[1] ?? "9999") < cutoff).map((f) => f.name);
  if (old.length) { await store.remove(old); removed = old.length; }
  if (have.some((f) => f.name === name)) return { saved: false, name, removed };
  const { csv, count } = await buildExport();
  if (count === 0) return { saved: false, name, removed }; // never overwrite a good copy with an empty one
  const { error } = await store.upload(name, new Blob([csv], { type: "text/csv" }), { contentType: "text/csv", upsert: false });
  if (error) throw new Error(`Could not save the copy: ${error.message}`);
  return { saved: true, name, count, removed };
}

export async function savedCopyUrl(name: string): Promise<string | null> {
  if (!/^docs-bible-\d{4}-\d{2}-\d{2}\.csv$/.test(name)) return null;
  const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrl(name, 120, { download: name });
  return data?.signedUrl ?? null;
}
