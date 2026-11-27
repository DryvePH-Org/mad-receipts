import "server-only";
import { isAdmin } from "@/lib/roles";
import { COLUMN_BY_KEY, canEditColumn, checkEdit, COLUMNS, type GridRow, type Role } from "./grid";
import { completeOf, finishMarks, PAPER_COLUMNS } from "./marks";
import { docsDb } from "./review-server";
import { selectAll } from "@/lib/supabase/select-all";

export interface HistoryRow { field: string; before: string | null; after: string | null; actor: string | null; source: string; at: string }

const GRID_SELECT = ["id", "plate_no", "arrival_date", ...COLUMNS.filter((c) => c.key !== "complete_docs").map((c) => c.key)].filter((k, i, a) => a.indexOf(k) === i).join(", ");

export async function loadGrid(): Promise<GridRow[]> {
  const db = docsDb();
  const [units, files, open] = await Promise.all([
    // only the columns the table shows (the rest of the row, import leftovers included, is more than half of it)
    db.from("docs_units_current").select(GRID_SELECT).order("arrival_date", { ascending: false, nullsFirst: false }).limit(5000),
    selectAll<{ plate_no: string; doc_types: string[] | null }>((from, to) => db.from("folder_files").select("plate_no, doc_types").is("archive", null).order("id").range(from, to) as unknown as PromiseLike<{ data: { plate_no: string; doc_types: string[] | null }[] | null; error: { message: string } | null }>).then((data) => ({ data })),
    db.from("docs_review_items").select("unit_id, plate_no").eq("status", "open").limit(5000),
  ]);
  if (units.error) throw new Error(`Could not read the register: ${units.error.message}`);
  const found = new Map<string, string[]>();
  for (const f of files.data ?? []) found.set(f.plate_no as string, [...(found.get(f.plate_no as string) ?? []), ...((f.doc_types as string[] | null) ?? [])]);
  const decisions = new Map<string, number>();
  for (const i of open.data ?? []) { const k = (i.plate_no as string | null) ?? ""; if (k) decisions.set(k, (decisions.get(k) ?? 0) + 1); }
  return ((units.data ?? []) as unknown as Record<string, unknown>[]).map((u) => {
    const values: Record<string, string | null> = {};
    for (const c of COLUMNS) if (c.key !== "complete_docs") values[c.key] = (u[c.key] as string | null) ?? null;
    const marks = finishMarks(values, found.get(u.plate_no as string) ?? []);
    return { id: u.id as string, values: marks, complete: completeOf(marks), decisions: decisions.get(u.plate_no as string) ?? 0 };
  });
}

/** One car's current row of the register (null when the car is not in it). */
export async function loadRegisterRow(plate: string): Promise<GridRow | null> {
  const db = docsDb();
  const { data: u } = await db.from("docs_units_current").select("*").eq("plate_no", plate).maybeSingle();
  if (!u) return null;
  const [{ data: files }, { count }] = await Promise.all([db.from("folder_files").select("doc_types").eq("plate_no", plate).is("archive", null), db.from("docs_review_items").select("id", { count: "exact", head: true }).eq("plate_no", plate).eq("status", "open")]);
  const values: Record<string, string | null> = {};
  for (const col of COLUMNS) if (col.key !== "complete_docs") values[col.key] = ((u as Record<string, unknown>)[col.key] as string | null) ?? null;
  const marks = finishMarks(values, (files ?? []).flatMap((f) => (f.doc_types as string[] | null) ?? []));
  return { id: u.id as string, values: marks, complete: completeOf(marks), decisions: count ?? 0 };
}

/**
 * One cell edited. The database change is conditional on the cell still holding what the person saw (`expected`), so two people
 * editing the same cell never overwrite each other silently. The history entry is written by the database itself.
 */
export async function saveCell(role: Role, actor: string, unitId: string, key: string, raw: string, expected: string | null): Promise<{ ok: true; value: string | null } | { ok: false; message: string }> {
  const col = COLUMN_BY_KEY.get(key);
  if (!col || !col.edit) return { ok: false, message: "This column cannot be edited." };
  if (!canEditColumn(role, col)) return { ok: false, message: isAdmin(role) ? "This column cannot be edited." : "You can look at this column; the paper columns are edited by the people who handle the papers, and the rest by an Admin." };
  const checked = checkEdit(col, raw);
  if (!checked.ok) return { ok: false, message: checked.error };
  const db = docsDb();
  let q = db.from("docs_units").update({ [key]: checked.value, updated_by: actor, last_change_source: "app" }).eq("id", unitId).is("archived_at", null);
  // a paper box that shows No, N/A or Yes without anyone having chosen it is empty in the database: it still counts as what the person saw
  const derived = (PAPER_COLUMNS as readonly string[]).includes(key) && (expected === "No" || expected === "N/A" || expected === "Yes");
  q = expected === null ? q.is(key, null) : derived ? q.or(`${key}.is.null,${key}.eq.${expected}`) : q.eq(key, expected);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, message: `Could not save: ${error.message}` };
  if (!data?.length) return { ok: false, message: "Someone changed this cell a moment ago. The table was refreshed: look and try again." };
  return { ok: true, value: checked.value };
}

export async function loadHistory(unitId: string): Promise<HistoryRow[]> {
  const db = docsDb();
  const { data } = await db.from("docs_unit_history").select("field, before_value, after_value, actor, source, at").eq("unit_id", unitId).order("at", { ascending: false }).limit(200);
  const ids = [...new Set((data ?? []).map((h) => h.actor as string | null).filter((a): a is string => !!a))];
  const { data: people } = ids.length ? await db.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));
  return (data ?? []).map((h) => ({ field: COLUMN_BY_KEY.get(h.field as string)?.name ?? String(h.field), before: h.before_value as string | null, after: h.after_value as string | null, actor: h.actor ? name.get(h.actor as string) ?? "Someone" : null, source: h.source as string, at: h.at as string }));
}
