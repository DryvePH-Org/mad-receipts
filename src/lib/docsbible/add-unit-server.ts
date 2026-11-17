import "server-only";
import { manilaToday } from "@/lib/dates";
import { plateKey } from "./normalize";
import { checkNewUnit, type UnitDetailsInput } from "./add-unit";
import { docsDb } from "./review-server";

export type UnitStatus = { exists: false } | { exists: true; id: string; name: string; arrival: string | null };

/** Is this plate already a car of the register? (The latest arrival that was not removed.) */
export async function unitStatus(plate: string): Promise<UnitStatus> {
  const key = plateKey(plate);
  const { data } = await docsDb().from("docs_units_current").select("id, make, model_variant, year_model, color, arrival_date").eq("plate_no", key).maybeSingle();
  if (!data) return { exists: false };
  return { exists: true, id: data.id as string, name: [data.year_model, data.make, data.model_variant, data.color].filter(Boolean).join(" ") || key, arrival: (data.arrival_date as string | null) ?? null };
}

/** The values staff type most, for the form's suggestions (makes, colors, body types), most used first. */
export async function loadSuggestions(): Promise<{ makes: string[]; colors: string[]; models: string[] }> {
  const { data } = await docsDb().from("docs_units_current").select("make, color, model_variant").limit(5000);
  const top = (key: "make" | "color" | "model_variant", n: number) => {
    const c = new Map<string, number>();
    for (const r of data ?? []) { const v = (r[key] as string | null)?.trim(); if (v) c.set(v, (c.get(v) ?? 0) + 1); }
    return [...c].sort((a, b) => b[1] - a[1]).slice(0, n).map(([v]) => v);
  };
  return { makes: top("make", 60), colors: top("color", 40), models: top("model_variant", 80) };
}

export type AddUnitResult = { ok: true; id: string; plate: string } | { ok: false; message: string; errors?: Record<string, string>; exists?: { id: string; name: string } };

/**
 * A new car enters the register. The plate is checked first: a plate that is already a car is not added twice unless the person says it
 * arrived again (a second arrival, which keeps the earlier row). The row starts "not classified": the case is chosen on the car's page.
 */
export async function addUnit(plateTyped: string, details: UnitDetailsInput, actor: string, secondArrival: boolean): Promise<AddUnitResult> {
  const key = plateKey(plateTyped);
  if (key.length < 5) return { ok: false, message: "Type the whole plate number, like NKF 4771." };
  const checked = checkNewUnit(details, manilaToday());
  if (!checked.ok) return { ok: false, message: "Some details are missing or wrong.", errors: checked.errors };
  const status = await unitStatus(key);
  if (status.exists && !secondArrival) return { ok: false, message: `${key} is already in the Docs Bible (${status.name}).`, exists: { id: status.id, name: status.name } };
  const r = await docsDb().from("docs_units").insert({
    plate_no: key, plate_display: plateTyped.trim().toUpperCase().replace(/\s+/g, " "), ...checked.fields, arrival_raw: checked.fields.arrival_date,
    source: "app", last_change_source: "add", created_by: actor, updated_by: actor,
  }).select("id").single();
  if (r.error) return { ok: false, message: `Could not add the car: ${r.error.message}` };
  return { ok: true, id: r.data.id as string, plate: key };
}
