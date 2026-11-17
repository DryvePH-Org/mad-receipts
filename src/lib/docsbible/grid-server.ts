import "server-only";
import { COLUMN_BY_KEY, canEditColumn, checkEdit, COLUMNS, type GridRow, type Role } from "./grid";
import { docsDb } from "./review-server";

export interface HistoryRow { field: string; before: string | null; after: string | null; actor: string | null; source: string; at: string }

export async function loadGrid(): Promise<GridRow[]> {
  const db = docsDb();
  const [units, complete, open] = await Promise.all([
    db.from("docs_units_current").select("*").order("arrival_date", { ascending: false, nullsFirst: false }).limit(5000),
    db.from("docs_complete").select("id, complete_docs").limit(5000),
    db.from("docs_review_items").select("unit_id, plate_no").eq("status", "open").limit(5000),
  ]);
  if (units.error) throw new Error(`Could not read the register: ${units.error.message}`);
  const comp = new Map((complete.data ?? []).map((c) => [c.id as string, c.complete_docs as string | null]));
  const decisions = new Map<string, number>();
  for (const i of open.data ?? []) { const k = (i.plate_no as string | null) ?? ""; if (k) decisions.set(k, (decisions.get(k) ?? 0) + 1); }
  return (units.data ?? []).map((u: Record<string, unknown>) => {
    const values: Record<string, string | null> = {};
    for (const c of COLUMNS) if (c.key !== "complete_docs") values[c.key] = (u[c.key] as string | null) ?? null;
    return { id: u.id as string, values, complete: comp.get(u.id as string) ?? null, decisions: decisions.get(u.plate_no as string) ?? 0 };
  });
}

/**
 * One cell edited. The database change is conditional on the cell still holding what the person saw (`expected`), so two people
 * editing the same cell never overwrite each other silently. The history entry is written by the database itself.
 */
export async function saveCell(role: Role, actor: string, unitId: string, key: string, raw: string, expected: string | null): Promise<{ ok: true; value: string | null } | { ok: false; message: string }> {
  const col = COLUMN_BY_KEY.get(key);
  if (!col || !col.edit) return { ok: false, message: "This column cannot be edited." };
  if (!canEditColumn(role, col)) return { ok: false, message: role === "admin" ? "This column cannot be edited." : "You can look at this column; Documentation edits the paper columns and Admin the rest." };
  const checked = checkEdit(col, raw);
  if (!checked.ok) return { ok: false, message: checked.error };
  const db = docsDb();
  let q = db.from("docs_units").update({ [key]: checked.value, updated_by: actor, last_change_source: "app" }).eq("id", unitId).is("archived_at", null);
  q = expected === null ? q.is(key, null) : q.eq(key, expected);
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
  return (data ?? []).map((h) => ({ field: COLUMN_BY_KEY.get(h.field as string)?.label ?? String(h.field), before: h.before_value as string | null, after: h.after_value as string | null, actor: h.actor ? name.get(h.actor as string) ?? "Someone" : null, source: h.source as string, at: h.at as string }));
}
