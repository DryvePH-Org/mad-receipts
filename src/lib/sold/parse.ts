// Reading the SOLD INFORMATION workbook (2026): the small rules that turn what staff typed into clean values.
// Pure functions, no network, so every rule is tested. The import script and, later, the app use the same ones.

export const normPlate = (s: unknown): string => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Null when the plate looks like a plate; otherwise what is wrong with it. */
export function plateProblem(raw: unknown): string | null {
  const p = normPlate(raw);
  if (!p) return "no plate";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())) return "a date was typed where the plate goes";
  if (!/^[A-Z]{1,3}\d{2,4}[A-Z]?$/.test(p)) return "does not look like a plate";
  return null;
}

/** A Philippine mobile number as 09XXXXXXXXX. The sheet kept numbers as numbers, so the leading 0 is gone. */
export function cleanPhone(raw: unknown): { value: string | null; problem?: string } {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return { value: null };
  if (/^09\d{9}$/.test(digits)) return { value: digits };
  if (/^9\d{9}$/.test(digits)) return { value: `0${digits}` };
  if (/^639\d{9}$/.test(digits)) return { value: `0${digits.slice(2)}` };
  return { value: String(raw).trim(), problem: "the number is not 10 or 11 digits: kept as typed" };
}

export interface SoldDate { date: string | null; precision: "day" | "none"; problem?: string }

/** "2026-03-31", "10/12/2026" (month first) and the typo "7/132026". Only the year asked for is accepted without a flag. */
export function parseSoldDate(raw: unknown, year = 2026): SoldDate {
  const t = String(raw ?? "").trim();
  if (!t) return { date: null, precision: "none" };
  let y: number, m: number, d: number;
  let hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (hit) { y = +hit[1]; m = +hit[2]; d = +hit[3]; }
  else if ((hit = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) { m = +hit[1]; d = +hit[2]; y = +hit[3]; }
  else if ((hit = /^(\d{1,2})\/(\d{1,2})(\d{4})$/.exec(t))) { m = +hit[1]; d = +hit[2]; y = +hit[3]; } // 7/132026: the second slash is missing
  else return { date: null, precision: "none", problem: `the date "${t}" cannot be read` };
  if (m < 1 || m > 12 || d < 1 || d > 31) return { date: null, precision: "none", problem: `the date "${t}" is not a real date` };
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (y !== year) return { date: iso, precision: "day", problem: `the year is ${y}, not ${year}: check it` };
  return { date: iso, precision: "day" };
}

const SELLERS: Record<string, string> = { DAVID: "DAVID", ELLA: "ELLA", ELLLA: "ELLA", SWEET: "SWEET", JESSA: "JESSA" };
/** The sales person's name as the team writes it; a blank or unknown name is kept as typed so it can be looked at. */
export function salesperson(raw: unknown): { name: string | null; problem?: string } {
  const t = String(raw ?? "").trim().toUpperCase();
  if (!t || t === "NONE") return { name: null };
  return SELLERS[t] ? { name: SELLERS[t] } : { name: t, problem: `an unknown sales name "${t}"` };
}

export type TransferStage = "in_process" | "transferred" | "released" | "delivered" | "unknown" | "cancelled";
export const STAGE_LABEL: Record<TransferStage, string> = { in_process: "In process at LTO", transferred: "Transferred, with MAD", released: "Released (to the buyer or the financing company)", delivered: "Delivered and confirmed", unknown: "Not known: check", cancelled: "Cancelled (the deal was cancelled)" };

/**
 * The stage the team kept as the row's color: white = in process, yellow = transferred, red = released, green = delivered.
 * A row with no color falls back to the liaison's status.
 */
export function stageOf(color: string | null | undefined, liaisonStatus?: string | null): TransferStage {
  switch (color) {
    case "white": return "in_process";
    case "yellow": return "transferred";
    case "red": case "brown": return "released";
    case "green": return "delivered";
  }
  return /ONGOING|PENDING/i.test(liaisonStatus ?? "") ? "in_process" : "unknown";
}

const FINANCERS = ["GDFI", "SAFC", "BDO", "BPI", "ASIALINK"];
/** The financing company named in the notes, if any. */
export function financingOf(...texts: (string | null | undefined)[]): string | null {
  const all = texts.filter(Boolean).join(" ").toUpperCase();
  return FINANCERS.find((f) => new RegExp(`\\b${f}\\b`).test(all)) ?? null;
}

/** Where the original documents are, read from the notes: "ORIG DOCS ON HAND", "ORIG DOCS AT S' JEP FOR TRANSFER". */
export function originalsAt(...texts: (string | null | undefined)[]): string | null {
  const all = texts.filter(Boolean).join(" ").toUpperCase();
  const at = /ORIG(?:INAL)? DOCS? AT (?:SIR |S['’]? ?)([A-Z]+)/.exec(all);
  if (at) return `with ${at[1].charAt(0)}${at[1].slice(1).toLowerCase()}`;
  if (/ORIG(?:INAL)?\s+DOCS?\s+(?:ON ?\s?H?AND|ONHAND|ON BHAND)/.test(all) || /ORIGINAL ON HAND/.test(all)) return "on hand at MAD";
  return null;
}

/** The liaison named in the notes ("ORIG DOCS AT S' JEP", "LTO - SUBMITTED TO JEP"), for a row where the liaison column is empty. */
export function liaisonIn(...texts: (string | null | undefined)[]): string | null {
  const all = texts.filter(Boolean).join(" ").toUpperCase();
  const names = ["JEP", "LEO"].filter((n) => new RegExp(`\\b${n}\\b`).test(all));
  return names.length === 1 ? names[0] : null;
}

/** MAD keeps the model year as two digits. */
export function yearModel(raw: unknown): string | null {
  const n = Number(String(raw ?? "").replace(/\D/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(n >= 1000 ? n % 100 : n).padStart(2, "0");
}

const letters = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "");
export function edit(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** A make spelled like one MAD already knows ("MERCEDES BENZ" → "MERCEDES-BENZ", "MITSUBIHSI" → "MITSUBISHI"); anything else is kept as typed. */
export function fixMake(raw: unknown, known: readonly string[]): string {
  const t = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!t) return "";
  const own = known.find((k) => letters(k) === letters(t));
  if (own) return own;
  const near = known.filter((k) => edit(letters(k), letters(t)) <= 2).sort((a, b) => edit(letters(a), letters(t)) - edit(letters(b), letters(t)))[0];
  return near ?? t;
}

/** MAD's fuel words: GAS, DSL, GAS - HYBRID, ELECTRIC. */
export function fuelOf(raw: unknown): string | null {
  const t = String(raw ?? "").trim().toUpperCase();
  if (!t) return null;
  if (/^ELEC/.test(t)) return "ELECTRIC";
  if (/HYB/.test(t)) return "GAS - HYBRID";
  if (/^D/.test(t)) return "DSL";
  if (/^G/.test(t)) return "GAS";
  return t;
}

/** Two spellings of the same CR office: "LA LOMA" and "LA LOMA DISTRICT OFFICE". */
export const officeKey = (s: unknown): string => String(s ?? "").toUpperCase().replace(/DISTRICT OFFICE|DISTRICT|OFFICE|\bDO\b|NEW REGISTRATION UNIT/g, "").replace(/[^A-Z]/g, "");
export const looksLikeOffice = (s: unknown): boolean => /DISTRICT|OFFICE|\bNRU\b|\bNCR\b|REGISTRATION UNIT/.test(String(s ?? "").toUpperCase());
