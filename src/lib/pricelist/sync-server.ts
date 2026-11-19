import "server-only";
import { docsDb } from "@/lib/docsbible/review-server";
import type { SyncField } from "./import";
import { planSettle, type Choice } from "./sync";

export interface SyncRow { id: string; plate: string; car: string; field: SyncField; listValue: string | null; docsValue: string | null; message: string; status: "open" | "settled"; decision: string | null; settledAt: string | null; sourceRow: number | null }

/** The price list check, with each car's name. Open ones first. */
export async function loadSyncItems(): Promise<SyncRow[]> {
  const db = docsDb();
  const { data, error } = await db.from("car_sync_items").select("id, unit_id, plate_no, field, list_value, docs_value, message, status, decision, settled_at, source_row").order("created_at").limit(3000);
  if (error) throw new Error(`Could not read the price list check: ${error.message}`);
  const ids = [...new Set((data ?? []).map((i) => i.unit_id as string | null).filter((x): x is string => !!x))];
  const { data: units } = ids.length ? await db.from("docs_units").select("id, plate_display, year_model, make, model_variant, color").in("id", ids).limit(3000) : { data: [] };
  const car = new Map((units ?? []).map((u) => [u.id as string, `${[u.year_model, u.make, u.model_variant, u.color].filter(Boolean).join(" ")}`]));
  const plate = new Map((units ?? []).map((u) => [u.id as string, (u.plate_display as string | null) ?? ""]));
  return (data ?? []).map((i) => ({
    id: i.id as string, plate: (i.unit_id ? plate.get(i.unit_id as string) : null) || (i.plate_no as string) || "", car: (i.unit_id ? car.get(i.unit_id as string) : "") || "", field: i.field as SyncField,
    listValue: i.list_value as string | null, docsValue: i.docs_value as string | null, message: i.message as string, status: i.status as "open" | "settled", decision: i.decision as string | null,
    settledAt: i.settled_at as string | null, sourceRow: i.source_row as number | null,
  })).sort((a, b) => (a.status === b.status ? a.plate.localeCompare(b.plate) : a.status === "open" ? -1 : 1));
}

export async function countOpenSyncItems(): Promise<number> {
  const { count, error } = await docsDb().from("car_sync_items").select("id", { count: "exact", head: true }).eq("status", "open");
  return error ? 0 : count ?? 0;
}

/** Settles one item: copies the price list's value into the Docs Bible, keeps the Docs Bible's, or only notes it. Saves who and when. */
export async function settleSyncItem(id: string, choice: Choice, actor: string): Promise<{ ok: true; decision: string } | { ok: false; error: string }> {
  const db = docsDb();
  const { data: item } = await db.from("car_sync_items").select("id, unit_id, field, list_value, docs_value, status").eq("id", id).maybeSingle();
  if (!item) return { ok: false, error: "That item was not found." };
  if (item.status !== "open") return { ok: false, error: "Someone already settled this one." };
  const plan = planSettle(item.field as SyncField, choice, { listValue: item.list_value as string | null, docsValue: item.docs_value as string | null });
  if ("error" in plan) return { ok: false, error: plan.error };
  if (plan.docsPatch) {
    if (!item.unit_id) return { ok: false, error: "This item has no car in the Docs Bible." };
    const { error } = await db.from("docs_units").update({ ...plan.docsPatch, last_change_source: "pricelist", updated_by: actor }).eq("id", item.unit_id);
    if (error) return { ok: false, error: `Could not change the Docs Bible: ${error.message}` };
  }
  if (plan.clearOverride && item.unit_id) await db.from("car_stock").update({ [plan.clearOverride]: null, updated_by: actor }).eq("unit_id", item.unit_id);
  const { error } = await db.from("car_sync_items").update({ status: "settled", decision: plan.decision, settled_by: actor, settled_at: new Date().toISOString() }).eq("id", id).eq("status", "open");
  if (error) return { ok: false, error: `Could not save the decision: ${error.message}` };
  return { ok: true, decision: plan.decision };
}
