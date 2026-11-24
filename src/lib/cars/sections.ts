// One car, one record, the same sections and the same names everywhere: the car page, Car Inventory and the table of Car documents all read this list.
// A field has ONE name here (the sheet's old header is only kept for the CSV export). Pure.

export type SectionId = "identity" | "registration" | "buying" | "papers" | "status" | "notes";

/** What each box is called on every screen. */
export const FIELD_NAME: Record<string, string> = {
  plate_display: "Plate", category: "Category", year_model: "Model (year)", make: "Brand", model_variant: "Make", color: "Color", body_type: "Body type", trans: "Transmission",
  fuel: "Fuel", mileage: "Mileage", spare_key: "Spare key",
  reg_owner_name: "Registered owner", mo_file: "LTO office (MO file)", cs_no: "CS no.", chassis_no: "Chassis no.", engine_no: "Engine no.", or_expiry: "OR expires",
  arrival_date: "Arrived", buying_source: "Buying source", awarded_to: "Awarded to", classification: "Case", bank_source: "Bank or source", encumbrance: "Encumbered to",
  complete_docs: "Papers complete?", cr: "CR", or_receipt: "OR", deed: "Deed of sale", sellers_id: "Seller's ID", sec_cert: "SEC certificate", sec_ids: "SEC IDs", boards_reso: "Board resolution",
  encumbered: "Encumbered papers", chattel: "Chattel", promissory: "Promissory note", stencil: "Stencil", papers_with: "Papers kept by", registry_of_deeds: "Registry of deeds",
  paper_status: "Paper status",
  stock_state: "State", list_price: "Price", target_price: "Target", reprice: "Reprice", retarget: "Re-target", location: "Location", tools: "Tools", stock_note: "Note on the state",
  remarks: "Remarks",
};

export interface Section { id: SectionId; title: string; keys: string[] }

/** The order a car is told in: who it is, its registration, how it was bought, its papers, where it stands, and the notes. */
export const SECTIONS: Section[] = [
  { id: "identity", title: "Who the car is", keys: ["plate_display", "category", "year_model", "make", "model_variant", "color", "body_type", "trans", "fuel", "mileage", "spare_key"] },
  { id: "registration", title: "Registration", keys: ["reg_owner_name", "mo_file", "cs_no", "chassis_no", "engine_no", "or_expiry"] },
  { id: "buying", title: "Buying and case", keys: ["arrival_date", "buying_source", "awarded_to", "classification", "bank_source", "encumbrance"] },
  { id: "papers", title: "Papers", keys: ["complete_docs", "cr", "or_receipt", "deed", "sellers_id", "sec_cert", "sec_ids", "boards_reso", "encumbered", "chattel", "promissory", "stencil", "papers_with", "registry_of_deeds", "paper_status"] },
  { id: "status", title: "Status and price", keys: ["stock_state", "list_price", "target_price", "reprice", "retarget", "location", "tools", "stock_note"] },
  { id: "notes", title: "Notes", keys: ["remarks"] },
];

export const SECTION_TITLE: Record<SectionId, string> = Object.fromEntries(SECTIONS.map((s) => [s.id, s.title])) as Record<SectionId, string>;
const ORDER = new Map<string, { section: SectionId; index: number }>();
SECTIONS.forEach((s, si) => s.keys.forEach((k, ki) => ORDER.set(k, { section: s.id, index: si * 100 + ki })));

export const sectionOf = (key: string): SectionId | null => ORDER.get(key)?.section ?? null;
/** The keys in the order of the sections (a key the list does not know goes last, in the order it came). */
export const inSectionOrder = <T extends { key: string }>(items: T[]): T[] => [...items].sort((a, b) => (ORDER.get(a.key)?.index ?? 9999) - (ORDER.get(b.key)?.index ?? 9999));
