import { fullYear } from "@/lib/inventory/year";

// One format for every detail of a car, so whoever updates the list never has to guess how to write something.
// Each field says how it is typed (a pick list or a free value), how what was typed is tidied up, and how it is shown.
// The storage keeps the convention the register always had (the year as two digits, capitals, AT/MT...), the screens show it plainly (2019, 45,000 km).

export const BODY_TYPES = ["SUV", "SEDAN", "MPV", "HATCHBACK", "PICK-UP", "VAN"] as const;
export const TRANSMISSIONS = ["AT", "MT", "CVT"] as const;
export const FUELS = ["GAS", "DIESEL", "GAS - HYBRID", "ELECTRIC", "PH EV"] as const;
export const BUYING_SOURCES = ["DO", "BANK"] as const;
export const SPARE_KEYS = ["W/SPAREKEY", "W/O SPAREKEY", "N/A"] as const;

export type Checked = { ok: true; value: string | null } | { ok: false; error: string };

const squash = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const blank = (v: unknown) => squash(v) === "";
const upper = (v: unknown) => squash(v).toUpperCase();

/** A value from a closed list, accepting the ways people write it. Returns null when it is not one of them. */
function fromList(raw: unknown, list: readonly string[], synonyms: Record<string, string> = {}): string | null {
  const k = upper(raw).replace(/\s*-\s*/g, " - ");
  if (list.includes(k)) return k;
  const key = k.replace(/[^A-Z0-9]/g, "");
  for (const item of list) if (item.replace(/[^A-Z0-9]/g, "") === key) return item;
  return synonyms[key] ?? null;
}

export function checkBody(raw: unknown): Checked {
  if (blank(raw)) return { ok: true, value: null };
  const v = fromList(raw, BODY_TYPES, { PICKUP: "PICK-UP", HATCH: "HATCHBACK", HB: "HATCHBACK", CROSSOVER: "SUV", UV: "SUV", AUV: "MPV", MINIVAN: "VAN" });
  return v ? { ok: true, value: v } : { ok: false, error: `Choose one: ${BODY_TYPES.join(", ")}.` };
}

export function checkTrans(raw: unknown): Checked {
  if (blank(raw)) return { ok: true, value: null };
  const v = fromList(raw, TRANSMISSIONS, { AUTOMATIC: "AT", AUTO: "AT", MANUAL: "MT", ATM: "AT", MTM: "MT" });
  return v ? { ok: true, value: v } : { ok: false, error: `Choose one: ${TRANSMISSIONS.join(", ")}.` };
}

export function checkFuel(raw: unknown): Checked {
  if (blank(raw)) return { ok: true, value: null };
  const v = fromList(raw, FUELS, { DSL: "DIESEL", GASOLINE: "GAS", PETROL: "GAS", UNLEADED: "GAS", HYBRID: "GAS - HYBRID", GASHYBRID: "GAS - HYBRID", EV: "ELECTRIC", PHEV: "PH EV", PLUGINHYBRID: "PH EV" });
  return v ? { ok: true, value: v } : { ok: false, error: `Choose one: ${FUELS.join(", ")}.` };
}

export function checkBuyingSource(raw: unknown): Checked {
  if (blank(raw)) return { ok: true, value: null };
  const v = fromList(raw, BUYING_SOURCES, { DIRECTOWNER: "DO" });
  return v ? { ok: true, value: v } : { ok: false, error: `Choose one: ${BUYING_SOURCES.join(", ")}.` };
}

export function checkSpareKey(raw: unknown): Checked {
  if (blank(raw)) return { ok: true, value: null };
  const v = fromList(raw, SPARE_KEYS, { NOSPAREKEY: "W/O SPAREKEY", WOSPAREKEY: "W/O SPAREKEY", NOSPARE: "W/O SPAREKEY", WITHSPAREKEY: "W/SPAREKEY", WSPAREKEY: "W/SPAREKEY", WSPARE: "W/SPAREKEY", YES: "W/SPAREKEY", NO: "W/O SPAREKEY", NA: "N/A" });
  return v ? { ok: true, value: v } : { ok: false, error: `Choose one: With spare key, Without spare key, or N/A.` };
}

/** The year as the register keeps it: two digits. "2019", "19" and " 2019 " all become "19". */
export function checkYear(raw: unknown): Checked {
  if (blank(raw)) return { ok: true, value: null };
  const d = squash(raw).replace(/\D/g, "");
  if (d.length === 2) return { ok: true, value: d };
  if (d.length === 4 && /^(19|20)\d\d$/.test(d)) return { ok: true, value: d.slice(2) };
  return { ok: false, error: "Type the model year like 2019." };
}

/** Make, model and color: capitals, one space between words. Only letters, digits and the usual punctuation. */
export function checkWords(label: string, max: number) {
  return (raw: unknown): Checked => {
    if (blank(raw)) return { ok: true, value: null };
    const v = upper(raw).replace(/[^A-Z0-9 .,/&()+'"\-]/g, "");
    if (v.length === 0) return { ok: false, error: `Type the ${label}.` };
    return v.length > max ? { ok: false, error: `The ${label} is too long (${max} letters at most).` } : { ok: true, value: v };
  };
}

/**
 * The mileage as a whole number of kilometres, written "45,000 KM". Understands 45000, 45,000, 45000 KMS, 45K, 45T and 45 THOUSAND (T and K mean thousands).
 * A bare number is kilometres as typed (484 is 484 KM: a new car has few km); type 45K for 45,000.
 */
export function checkMileage(raw: unknown): Checked {
  if (blank(raw)) return { ok: true, value: null };
  const s = upper(raw).replace(/KMS?\.?|KILOMETERS?|KILOMETRES?/g, "").replace(/\s+/g, "");
  const m = /^(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(T|K|THOUSAND)?$/.exec(s);
  if (!m) return { ok: false, error: "Type the mileage in km, like 45000." };
  let n = Number(m[1].replace(/,/g, ""));
  if (m[2]) n *= 1000;
  n = Math.round(n);
  return n > 999_999 ? { ok: false, error: "That mileage looks too high. Check it." } : { ok: true, value: `${n.toLocaleString("en-US")} KM` };
}

export type FieldKey = "year_model" | "make" | "model_variant" | "color" | "body_type" | "trans" | "fuel" | "mileage" | "spare_key" | "buying_source";

export interface FieldStandard {
  key: FieldKey;
  label: string;
  /** a pick list when the field has a closed set of values */
  options?: readonly string[];
  /** a short example of what to type */
  hint: string;
  check: (raw: unknown) => Checked;
  /** how the stored value reads on screen */
  show: (stored: string | null | undefined) => string;
}

const plain = (v: string | null | undefined) => (v && v.trim() ? v.trim() : "—");

export const FIELDS: FieldStandard[] = [
  // the company's words: the Brand is TOYOTA, the Make is VIOS 1.3 E, the Model is the year model (2019)
  { key: "year_model", label: "Model (year)", hint: "2019", check: checkYear, show: (v) => (v ? fullYear(v) : "—") },
  { key: "make", label: "Brand", hint: "TOYOTA", check: checkWords("brand", 40), show: plain },
  { key: "model_variant", label: "Make", hint: "VIOS 1.3 E", check: checkWords("make", 80), show: plain },
  { key: "color", label: "Color", hint: "WHITE PEARL", check: checkWords("color", 40), show: plain },
  { key: "body_type", label: "Body type", options: BODY_TYPES, hint: "SUV", check: checkBody, show: plain },
  { key: "trans", label: "Transmission", options: TRANSMISSIONS, hint: "AT", check: checkTrans, show: plain },
  { key: "fuel", label: "Fuel", options: FUELS, hint: "GAS", check: checkFuel, show: plain },
  { key: "mileage", label: "Mileage", hint: "45000", check: checkMileage, show: plain },
  { key: "spare_key", label: "Spare key", options: SPARE_KEYS, hint: "W/SPAREKEY", check: checkSpareKey, show: (v) => (v === "W/SPAREKEY" ? "With spare key" : v === "W/O SPAREKEY" ? "Without spare key" : plain(v)) },
  { key: "buying_source", label: "Buying source", options: BUYING_SOURCES, hint: "DO", check: checkBuyingSource, show: plain },
];
export const FIELD_BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));
export type DetailKey = Exclude<FieldKey, "buying_source">;
export const DETAIL_FIELDS: DetailKey[] = ["year_model", "make", "model_variant", "color", "body_type", "trans", "fuel", "mileage", "spare_key"];

/** Whether a stored value already follows the standard, and if not what it should become (null: a person has to choose). */
export function tidyOf(key: FieldKey, stored: string | null | undefined): { fits: true } | { fits: false; suggestion: string | null; reason: string } {
  const std = FIELD_BY_KEY.get(key)!;
  if (blank(stored)) return { fits: true };
  const c = std.check(stored);
  if (!c.ok) return { fits: false, suggestion: null, reason: c.error };
  if (c.value === squash(stored)) return { fits: true };
  return { fits: false, suggestion: c.value, reason: `Written ${std.hint ? "the standard way" : "differently"}.` };
}

/** A plate as it is written everywhere: capitals, three letters then a space then the digits (NKF 4771). Any other shape is only tidied (capitals, one space). */
export function formatPlate(raw: unknown): string {
  const t = squash(raw).toUpperCase().replace(/[^A-Z0-9 ]/g, "");
  const m = /^([A-Z]{3})\s?(\d{3,4})$/.exec(t);
  return m ? `${m[1]} ${m[2]}` : t;
}
