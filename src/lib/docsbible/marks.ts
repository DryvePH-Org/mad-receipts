// The paper marks of a car (CR, OR, deed...): never empty. What a person chose always stays (Yes, No, To follow, N/A; also the Yes of the old sheet for
// a car with no photos). A box nobody has chosen starts as Yes when that paper is in the car's folder (found by the scan, or set as its type by a person),
// otherwise No when the car's case needs the paper and N/A when it does not. The photo is only the starting value. Pure.

export const PAPER_COLUMNS = ["cr", "or_receipt", "deed", "sellers_id", "sec_cert", "sec_ids", "boards_reso", "encumbered", "chattel", "promissory", "stencil"] as const;

/** The paper type of the folder photos (see DocType) and the box it makes Yes. */
export const TYPE_COLUMN: Record<string, string> = {
  official_receipt: "or_receipt", certificate_of_registration: "cr", deed_owner_to_dealer: "deed", owner_id: "sellers_id", representative_id: "sellers_id",
  chattel_cancellation: "chattel", promissory_note: "promissory", secretary_certificate: "sec_cert", secretary_id: "sec_ids", board_resolution: "boards_reso", stencil: "stencil",
};

/** The papers each classification needs (a car with no classification yet needs the four everyone needs). */
export const REQUIRED: Record<string, string[]> = {
  "Clean": ["cr", "or_receipt", "deed", "sellers_id"],
  "Repo (bank)": ["cr", "or_receipt", "deed", "sellers_id", "chattel", "sec_cert", "sec_ids"],
  "Encumbered (Indiv)": ["cr", "or_receipt", "deed", "sellers_id", "encumbered", "chattel"],
};
export const requiredFor = (classification: string | null | undefined): string[] => REQUIRED[classification ?? ""] ?? REQUIRED.Clean;

type Values = Record<string, string | null>;

/** The row with every paper box filled in by the rule above. `types` are the paper types found in the car's folder. */
export function finishMarks(values: Values, types: Iterable<string>): Values {
  const found = new Set<string>();
  for (const t of types) { const c = TYPE_COLUMN[t]; if (c) found.add(c); }
  const need = requiredFor(values.classification);
  const out = { ...values };
  for (const col of PAPER_COLUMNS) {
    const typed = (values[col] ?? "").trim();
    out[col] = typed || (found.has(col) ? "Yes" : need.includes(col) ? "No" : "N/A");
  }
  return out;
}

/** COMPLETE DOCS? as the register has always worked it out: null until the car has a classification. */
export function completeOf(v: Values): "COMPLETE" | "NOT YET" | null {
  const cls = v.classification ?? "";
  if (cls === "Not classified (legacy)" || cls === "") return null;
  const yes = (...k: string[]) => k.every((c) => v[c] === "Yes");
  const yesOrNa = (...k: string[]) => k.every((c) => v[c] === "Yes" || v[c] === "N/A");
  const base = yes("cr", "or_receipt", "deed", "sellers_id");
  if (cls === "Clean") return base ? "COMPLETE" : "NOT YET";
  if (cls === "Repo (bank)") return base && yes("chattel", "sec_cert", "sec_ids") ? "COMPLETE" : "NOT YET";
  if (cls === "Encumbered (Indiv)") return base && yesOrNa("sec_cert", "sec_ids", "boards_reso") && yes("encumbered", "chattel") ? "COMPLETE" : "NOT YET";
  return "NOT YET";
}
