import { DETAIL_FIELDS, FIELD_BY_KEY, tidyOf, type DetailKey } from "./standards";

// "Tidy up": the values of the cars that do not follow the standard formats, each with the fix that is suggested. Nothing changes by itself:
// a person approves the fixes. Pure code; the reading and saving are in tidy-server.ts.

/** The fields where the old price list kept its own copy of what the car record says (the screens show the price list's copy first). */
export const LIST_COPY: Partial<Record<DetailKey, "list_model" | "list_color" | "list_mileage" | "list_fuel">> = { model_variant: "list_model", color: "list_color", mileage: "list_mileage", fuel: "list_fuel" };

export interface TidyRow {
  id: string; plate_no: string; plate_display: string | null;
  year_model: string | null; make: string | null; model_variant: string | null; color: string | null; body_type: string | null; trans: string | null; fuel: string | null; mileage: string | null; spare_key: string | null;
  list_model: string | null; list_color: string | null; list_mileage: string | null; list_fuel: string | null;
}

export interface TidyItem {
  unitId: string; plate: string; plateDisplay: string; car: string; field: DetailKey; label: string;
  /** what the screens show now */
  current: string;
  /** the fix; null when a person has to choose */
  suggestion: string | null;
  reason: string;
  options?: readonly string[];
}

const squash = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const same = (a: string | null | undefined, b: string | null | undefined) => squash(a).toUpperCase() === squash(b).toUpperCase();

export function findTidy(rows: TidyRow[]): TidyItem[] {
  const out: TidyItem[] = [];
  for (const r of rows) {
    const car = [r.year_model, r.make, r.model_variant].filter(Boolean).join(" ") || r.plate_no;
    for (const field of DETAIL_FIELDS) {
      const std = FIELD_BY_KEY.get(field)!;
      const listKey = LIST_COPY[field];
      const own = r[field], listed = listKey ? r[listKey] : null;
      // what the screens show: the price list's copy when there is one
      const shown = squash(listed) || squash(own);
      if (!shown) continue;
      const conflict = !!listKey && !!squash(listed) && !same(listed, own);
      const t = tidyOf(field, shown);
      if (t.fits && !conflict) continue;
      const base = { unitId: r.id, plate: r.plate_no, plateDisplay: r.plate_display ?? r.plate_no, car, field, label: std.label, current: shown, options: std.options };
      if (!t.fits) out.push({ ...base, suggestion: t.suggestion, reason: t.reason });
      else out.push({ ...base, suggestion: shown, reason: "The price list and the car record say different things. Keep the one shown here." });
    }
  }
  return out;
}
