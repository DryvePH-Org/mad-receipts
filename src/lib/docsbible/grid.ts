// The Docs Bible table: its columns (same names and order as the sheet), who may edit which, and the checking of an edit. Pure.
import { dateOf, PAPER_VALUES, plateKey, text } from "./normalize";

export type ColKind = "plate" | "text" | "paper" | "classification" | "date" | "sale_status" | "vehicle_status" | "complete" | "remarks";
export interface Col {
  key: string; label: string; letter: string; kind: ColKind; width: number;
  /** "papers": Documentation and Admin; "admin": Admin only; null: computed, nobody types it */
  edit: "papers" | "admin" | null;
}

/** Same order and names as the sheet (letters are where they were in the Google Sheet, to help the move). */
export const COLUMNS: Col[] = [
  { key: "plate_display", label: "PLATE NO.", letter: "L", kind: "plate", width: 110, edit: null },
  { key: "category", label: "CATEGORY", letter: "C", kind: "text", width: 110, edit: "admin" },
  { key: "body_type", label: "BODY TYPE", letter: "D", kind: "text", width: 100, edit: "admin" },
  { key: "year_model", label: "YM", letter: "E", kind: "text", width: 56, edit: "admin" },
  { key: "make", label: "MAKE", letter: "F", kind: "text", width: 110, edit: "admin" },
  { key: "model_variant", label: "MODEL VARIANT", letter: "G", kind: "text", width: 190, edit: "admin" },
  { key: "color", label: "COLOR", letter: "H", kind: "text", width: 110, edit: "admin" },
  { key: "mileage", label: "MILEAGE", letter: "I", kind: "text", width: 90, edit: "admin" },
  { key: "trans", label: "TRANS", letter: "J", kind: "text", width: 60, edit: "admin" },
  { key: "fuel", label: "FUEL", letter: "K", kind: "text", width: 90, edit: "admin" },
  { key: "cs_no", label: "CS NO", letter: "M", kind: "text", width: 90, edit: "admin" },
  { key: "sale_status", label: "STATUS", letter: "N", kind: "sale_status", width: 110, edit: "admin" },
  { key: "arrival_date", label: "DATE ARRIVAL", letter: "O", kind: "date", width: 110, edit: "admin" },
  { key: "encumbrance", label: "ENCUMBRANCE", letter: "P", kind: "text", width: 130, edit: "admin" },
  { key: "mo_file", label: "MO FILE", letter: "Q", kind: "text", width: 120, edit: "admin" },
  { key: "reg_owner_name", label: "REG OWNER NAME", letter: "R", kind: "text", width: 200, edit: "admin" },
  { key: "buying_source", label: "BUYING SOURCE", letter: "S", kind: "text", width: 110, edit: "admin" },
  { key: "awarded_to", label: "AWARDED TO", letter: "T", kind: "text", width: 130, edit: "admin" },
  { key: "spare_key", label: "SPARE KEY", letter: "U", kind: "text", width: 120, edit: "admin" },
  { key: "vehicle_status", label: "VEHICLE STATUS", letter: "W", kind: "vehicle_status", width: 140, edit: "admin" },
  { key: "classification", label: "CLASSIFICATION", letter: "X", kind: "classification", width: 160, edit: "papers" },
  { key: "bank_source", label: "BANK/ SOURCE", letter: "Y", kind: "text", width: 120, edit: "admin" },
  { key: "renewal", label: "RENEWAL", letter: "Z", kind: "text", width: 110, edit: "admin" },
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
  { key: "other_docs", label: "OTHER DOCS ATTACHED", letter: "AM", kind: "text", width: 190, edit: "papers" },
  { key: "paper_status", label: "PAPER STATUS", letter: "AN", kind: "text", width: 130, edit: "papers" },
  { key: "remarks_1", label: "REMARKS I", letter: "AO", kind: "remarks", width: 260, edit: "papers" },
  { key: "remarks_2", label: "REMARKS II", letter: "AP", kind: "remarks", width: 220, edit: "papers" },
];
export const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));

export const VIEWS = {
  checklist: { label: "Checklist", keys: ["plate_display", "make", "model_variant", "vehicle_status", "classification", "complete_docs", "cr", "or_receipt", "deed", "sellers_id", "sec_cert", "sec_ids", "boards_reso", "encumbered", "chattel", "promissory", "stencil"] },
  handoff: { label: "Handoff", keys: ["plate_display", "make", "model_variant", "sale_status", "vehicle_status", "complete_docs", "paper_status", "remarks_1", "remarks_2"] },
  everything: { label: "Everything (like the sheet)", keys: COLUMNS.map((c) => c.key) },
} as const;
export type ViewKey = keyof typeof VIEWS;

export const SALE_STATUSES = ["Sold", "Onhand", "Reserved", "Not For Sale"] as const;
export const VEHICLE_STATUSES = ["SOLD", "AVAILABLE", "SHIPPED TO CEB", "NOT FOR SALE"] as const;
export const GRID_CLASSIFICATIONS = ["Clean", "Repo (bank)", "Encumbered (Indiv)"] as const;

export type Role = "sales" | "admin" | "approver" | "documentation";
/** The owner's rule: Documentation edits the paper columns, Admin everything, Sales and Approver only read. */
export const canEditColumn = (role: Role, col: Col): boolean => col.edit === "admin" ? role === "admin" : col.edit === "papers" ? role === "admin" || role === "documentation" : false;

/** What the cell becomes, or why the typing is refused. An empty cell is allowed (null) except where the database needs a value. */
export function checkEdit(col: Col, raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = raw.trim();
  switch (col.kind) {
    case "paper": return v === "" ? { ok: true, value: null } : (PAPER_VALUES as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false, error: "Choose Yes, No, To follow or N/A." };
    case "classification": return (GRID_CLASSIFICATIONS as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false, error: "Choose Clean, Repo (bank) or Encumbered (Indiv)." };
    case "sale_status": return v === "" ? { ok: true, value: null } : (SALE_STATUSES as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false, error: "Choose Sold, Onhand, Reserved or Not For Sale." };
    case "vehicle_status": return v === "" ? { ok: true, value: null } : (VEHICLE_STATUSES as readonly string[]).includes(v) ? { ok: true, value: v } : { ok: false, error: "Choose one of the vehicle statuses." };
    case "date": { if (v === "") return { ok: true, value: null }; const d = dateOf(v); return d.value ? { ok: true, value: d.value } : { ok: false, error: "Type a real date, like 2026-07-10." }; }
    case "remarks": return v.length > 4000 ? { ok: false, error: "That is too long (4000 letters at most)." } : { ok: true, value: raw.trim() === "" ? null : raw.replace(/\r\n/g, "\n").trim() };
    case "text": { const t = text(v); return t !== null && t.length > 300 ? { ok: false, error: "That is too long (300 letters at most)." } : { ok: true, value: t }; }
    default: return { ok: false, error: "This column cannot be typed in." };
  }
}

export const looksLikePlate = (q: string) => plateKey(q).length >= 3;

export interface GridRow { id: string; values: Record<string, string | null>; complete: string | null; decisions: number }

export interface GridFilter { q: string; classification: string; complete: string; vehicle: string; needsDecision: boolean }
export const EMPTY_GRID_FILTER: GridFilter = { q: "", classification: "", complete: "", vehicle: "", needsDecision: false };

export function filterRows(rows: GridRow[], f: GridFilter): GridRow[] {
  const q = f.q.trim().toLowerCase(), qp = plateKey(f.q);
  return rows.filter((r) => {
    if (f.classification && r.values.classification !== f.classification) return false;
    if (f.complete && (r.complete ?? "") !== (f.complete === "NONE" ? "" : f.complete)) return false;
    if (f.vehicle && r.values.vehicle_status !== f.vehicle) return false;
    if (f.needsDecision && r.decisions === 0) return false;
    if (!q) return true;
    if (qp && plateKey(r.values.plate_display).includes(qp)) return true;
    return ["make", "model_variant", "color", "reg_owner_name", "remarks_1", "remarks_2", "paper_status", "other_docs"].some((k) => (r.values[k] ?? "").toLowerCase().includes(q));
  });
}
