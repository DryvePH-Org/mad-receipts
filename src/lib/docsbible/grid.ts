// The Docs Bible table: its columns (same names and order as the sheet), who may edit which, and the checking of an edit. Pure.
import { FIELD_NAME } from "@/lib/cars/sections";
import { FIELD_BY_KEY, type FieldKey } from "@/lib/cars/standards";
import { editsPapers, isAdmin, type Role } from "@/lib/roles";
import { dateOf, PAPER_VALUES, plateKey, text } from "./normalize";

export type ColKind = "plate" | "text" | "paper" | "classification" | "date" | "stock_state" | "complete" | "remarks";
export interface Col {
  /** the one name of the box on every screen (see cars/sections.ts); `label` is the old sheet's header, kept for the CSV export */
  name: string;
  key: string; label: string; letter: string; kind: ColKind; width: number;
  /** "papers": Buying and the Admins; "admin": the Admins only; null: computed, nobody types it */
  edit: "papers" | "admin" | null;
}

/** Same order and names as the sheet (letters are where they were in the Google Sheet, to help the move). */
const RAW_COLUMNS: Omit<Col, "name">[] = [
  { key: "plate_display", label: "PLATE NO.", letter: "L", kind: "plate", width: 110, edit: null },
  { key: "category", label: "CATEGORY", letter: "C", kind: "text", width: 110, edit: "papers" },
  { key: "body_type", label: "BODY TYPE", letter: "D", kind: "text", width: 100, edit: "admin" },
  { key: "year_model", label: "YM", letter: "E", kind: "text", width: 56, edit: "admin" },
  { key: "make", label: "MAKE", letter: "F", kind: "text", width: 110, edit: "admin" },
  { key: "model_variant", label: "MODEL VARIANT", letter: "G", kind: "text", width: 190, edit: "admin" },
  { key: "color", label: "COLOR", letter: "H", kind: "text", width: 110, edit: "admin" },
  { key: "mileage", label: "MILEAGE", letter: "I", kind: "text", width: 90, edit: "admin" },
  { key: "trans", label: "TRANS", letter: "J", kind: "text", width: 60, edit: "admin" },
  { key: "fuel", label: "FUEL", letter: "K", kind: "text", width: 90, edit: "admin" },
  { key: "cs_no", label: "CS NO", letter: "M", kind: "text", width: 90, edit: "papers" },
  { key: "arrival_date", label: "DATE ARRIVAL", letter: "O", kind: "date", width: 110, edit: "papers" },
  { key: "encumbrance", label: "ENCUMBRANCE", letter: "P", kind: "text", width: 130, edit: "papers" },
  { key: "mo_file", label: "MO FILE", letter: "Q", kind: "text", width: 120, edit: "papers" },
  { key: "reg_owner_name", label: "REG OWNER NAME", letter: "R", kind: "text", width: 200, edit: "papers" },
  { key: "buying_source", label: "BUYING SOURCE", letter: "S", kind: "text", width: 110, edit: "papers" },
  { key: "awarded_to", label: "AWARDED TO", letter: "T", kind: "text", width: 130, edit: "papers" },
  { key: "spare_key", label: "SPARE KEY", letter: "U", kind: "text", width: 120, edit: "papers" },
  { key: "classification", label: "CLASSIFICATION", letter: "X", kind: "classification", width: 160, edit: "papers" },
  { key: "bank_source", label: "BANK/ SOURCE", letter: "Y", kind: "text", width: 120, edit: "papers" },
  { key: "or_expiry", label: "OR EXPIRY", letter: "Z", kind: "date", width: 110, edit: "papers" },
  { key: "complete_docs", label: "COMPLETE DOCS?", letter: "AA", kind: "complete", width: 130, edit: null },
  { key: "cr", label: "CR", letter: "AB", kind: "paper", width: 84, edit: "papers" },
  { key: "or_receipt", label: "OR", letter: "AC", kind: "paper", width: 84, edit: "papers" },
  { key: "deed", label: "DEED OF SALE", letter: "AD", kind: "paper", width: 96, edit: "papers" },
  { key: "sellers_id", label: "SELLER'S ID", letter: "AE", kind: "paper", width: 90, edit: "papers" },
  { key: "sec_cert", label: "SEC CERT", letter: "AF", kind: "paper", width: 84, edit: "papers" },
  { key: "sec_ids", label: "SEC ID'S", letter: "AG", kind: "paper", width: 84, edit: "papers" },
  { key: "boards_reso", label: "BOARDS RESO", letter: "AH", kind: "paper", width: 96, edit: "papers" },
  { key: "encumbered", label: "ENCUMBERED", letter: "AI", kind: "paper", width: 96, edit: "papers" },
  { key: "chattel", label: "CHATTEL", letter: "AJ", kind: "paper", width: 84, edit: "papers" },
  { key: "promissory", label: "PROMISSORY", letter: "AK", kind: "paper", width: 96, edit: "papers" },
  { key: "stencil", label: "STENCIL", letter: "AL", kind: "paper", width: 84, edit: "papers" },
  { key: "paper_status", label: "PAPER STATUS", letter: "AN", kind: "text", width: 130, edit: "papers" },
  { key: "remarks", label: "REMARKS", letter: "AO", kind: "remarks", width: 300, edit: "papers" },
  // new in MAD (they were in the old REMARKS register): where the original papers are, and the registry of deeds
  { key: "papers_with", label: "PAPERS WITH", letter: "AQ", kind: "text", width: 150, edit: "papers" },
  { key: "registry_of_deeds", label: "REGISTRY OF DEEDS", letter: "AR", kind: "text", width: 150, edit: "papers" },
  // the one status of the car
  { key: "stock_state", label: "STATE", letter: "AS", kind: "stock_state", width: 130, edit: "admin" },
];
export const COLUMNS: Col[] = RAW_COLUMNS.map((c) => ({ ...c, name: FIELD_NAME[c.key] ?? c.label }));
export const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));

export const VIEWS = {
  checklist: { label: "Checklist", keys: ["plate_display", "make", "model_variant", "stock_state", "classification", "complete_docs", "cr", "or_receipt", "deed", "sellers_id", "sec_cert", "sec_ids", "boards_reso", "encumbered", "chattel", "promissory", "stencil"] },
  handoff: { label: "Handoff", keys: ["plate_display", "make", "model_variant", "stock_state", "complete_docs", "paper_status", "remarks"] },
  everything: { label: "Everything", keys: COLUMNS.map((c) => c.key) },
} as const;
export type ViewKey = keyof typeof VIEWS;

export const STOCK_STATE_VALUES = ["Onhand", "Reserved", "Sold", "Not for sale", "For repair", "Sell as is", "Shipped to Cebu"] as const;
export const GRID_CLASSIFICATIONS = ["Clean", "Repo (bank)", "Encumbered (Indiv)"] as const;

export type { Role };
/** The owner's rule: Documentation has full control of the car's documents record (who the car is, its papers, OR date, spare key, arrival); the one STATE is Admin's here (Admin and Approver also change it in Car Inventory); Sales and Approver only read (the Approver changes prices in Car Inventory). */
export const canEditColumn = (role: Role, col: Col): boolean => col.edit === "admin" ? isAdmin(role) : col.edit === "papers" ? editsPapers(role) : false;

/** What the cell becomes, or why the typing is refused. An empty cell is allowed (null) except where the database needs a value. */
export function checkEdit(col: Col, raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = raw.trim();
  switch (col.kind) {
    case "paper": return v === "" ? { ok: true, value: null } : (PAPER_VALUES as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false, error: "Choose Yes, No, To follow or N/A." };
    case "classification": return (GRID_CLASSIFICATIONS as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false, error: "Choose Clean, Repo (bank) or Encumbered (Indiv)." };
    case "stock_state": return v === "" ? { ok: false, error: "A car always has a state." } : (STOCK_STATE_VALUES as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false, error: "Choose one of the states in the list." };
    case "date": { if (v === "") return { ok: true, value: null }; const d = dateOf(v); return d.value ? { ok: true, value: d.value } : { ok: false, error: "Type a real date, like 2026-07-10." }; }
    case "remarks": return v.length > 4000 ? { ok: false, error: "That is too long (4000 letters at most)." } : { ok: true, value: raw.trim() === "" ? null : raw.replace(/\r\n/g, "\n").trim() };
    case "text": {
      const std = FIELD_BY_KEY.get(col.key as FieldKey); // a detail of the car has one standard format
      if (std) { const c = std.check(raw); return c.ok ? { ok: true, value: c.value } : { ok: false, error: c.error }; }
      const t = text(v); return t !== null && t.length > 300 ? { ok: false, error: "That is too long (300 letters at most)." } : { ok: true, value: t }; }
    default: return { ok: false, error: "This column cannot be typed in." };
  }
}

export const looksLikePlate = (q: string) => plateKey(q).length >= 3;

export interface GridRow { id: string; values: Record<string, string | null>; complete: string | null; decisions: number }

export interface GridFilter { q: string; classification: string; complete: string; state: string; needsDecision: boolean }
export const EMPTY_GRID_FILTER: GridFilter = { q: "", classification: "", complete: "", state: "", needsDecision: false };

export function filterRows(rows: GridRow[], f: GridFilter): GridRow[] {
  const q = f.q.trim().toLowerCase(), qp = plateKey(f.q);
  return rows.filter((r) => {
    if (f.classification && r.values.classification !== f.classification) return false;
    if (f.complete && (r.complete ?? "") !== (f.complete === "NONE" ? "" : f.complete)) return false;
    if (f.state && r.values.stock_state !== f.state) return false;
    if (f.needsDecision && r.decisions === 0) return false;
    if (!q) return true;
    if (qp && plateKey(r.values.plate_display).includes(qp)) return true;
    return ["make", "model_variant", "color", "reg_owner_name", "remarks", "paper_status"].some((k) => (r.values[k] ?? "").toLowerCase().includes(q));
  });
}
