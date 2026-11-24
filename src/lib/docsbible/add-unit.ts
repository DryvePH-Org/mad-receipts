// A new car enters the Docs Bible through the "Add a car" form: its details, then its document photos. Pure rules: what the form asks for
// and how what was typed becomes the register row. The same words and formats the old sheet used (2-digit year, AT/MT, DO/BANK...).
import { checkBody, checkBuyingSource, checkFuel, checkMileage, checkSpareKey, checkTrans } from "@/lib/cars/standards";
import { dateOf, text } from "./normalize";

export interface UnitDetailsInput {
  make: string; model_variant: string; year_model: string; color: string;
  body_type?: string; trans?: string; fuel?: string; mileage?: string; category?: string; reg_owner_name?: string; buying_source?: string;
  spare_key?: string; cs_no?: string; mo_file?: string; awarded_to?: string; encumbrance?: string; arrival_date?: string;
}

export const REQUIRED_DETAILS: { key: keyof UnitDetailsInput; label: string }[] = [
  { key: "make", label: "Brand" }, { key: "model_variant", label: "Make" }, { key: "year_model", label: "Model (year)" }, { key: "color", label: "Color" },
];
export { BODY_TYPES, BUYING_SOURCES, FUELS, SPARE_KEYS, TRANSMISSIONS } from "@/lib/cars/standards";

const upper = (v: string | undefined, max = 120) => { const t = text(v); return t === null ? null : t.toUpperCase().slice(0, max); };

/** "2019" and "19" both become "19", the way the sheet keeps the year. */
export function yearModel(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 2) return d;
  if (d.length === 4 && /^(19|20)\d\d$/.test(d)) return d.slice(2);
  return null;
}

export type CheckedUnit = { ok: true; fields: Record<string, string | null> } | { ok: false; errors: Record<string, string> };

/** What the form typed becomes the register row's columns, or the list of what is missing or wrong. Today is the arrival date unless one is typed. */
export function checkNewUnit(input: UnitDetailsInput, today: string): CheckedUnit {
  const errors: Record<string, string> = {};
  for (const r of REQUIRED_DETAILS) if (text(input[r.key]) === null) errors[r.key] = `Type the ${r.label.toLowerCase()}.`;
  const year = yearModel(input.year_model ?? "");
  if (text(input.year_model) !== null && year === null) errors.year_model = "Type the model year like 2019.";
  const arrival = text(input.arrival_date) === null ? { value: today } : dateOf(input.arrival_date);
  if (!arrival.value) errors.arrival_date = "Type a real date, like 2026-11-18.";
  const body = checkBody(input.body_type), trans = checkTrans(input.trans), fuel = checkFuel(input.fuel), mileage = checkMileage(input.mileage), source = checkBuyingSource(input.buying_source), spare = checkSpareKey(input.spare_key);
  for (const [k, c] of [["body_type", body], ["trans", trans], ["fuel", fuel], ["mileage", mileage], ["buying_source", source], ["spare_key", spare]] as const) if (!c.ok) errors[k] = c.error;
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    fields: {
      make: upper(input.make), model_variant: upper(input.model_variant, 160), year_model: year, color: upper(input.color), body_type: body.ok ? body.value : null, trans: trans.ok ? trans.value : null, fuel: fuel.ok ? fuel.value : null,
      mileage: mileage.ok ? mileage.value : null, category: upper(input.category) ?? "NORMAL", reg_owner_name: upper(input.reg_owner_name, 160), buying_source: source.ok ? source.value : null,
      spare_key: spare.ok ? spare.value : null, cs_no: upper(input.cs_no, 40), mo_file: upper(input.mo_file), awarded_to: upper(input.awarded_to), encumbrance: upper(input.encumbrance),
      arrival_date: arrival.value, sale_status: "Onhand", vehicle_status: "AVAILABLE",
    },
  };
}
