import { editDistance } from "@/lib/rules/words";
import { looksLikeBank, looksLikeCompany, normName, sameName } from "./names";
import { ACK_LABEL, CASE_LABELS, DOC_LABELS, REQUIRED_BY_CASE, SOLD_EXTRAS, type CaseType, type Detection, type DocType } from "./types";

/*
 * Turns what the reader saw on each photo into what each document is FOR, and says what is wrong.
 *   - An ID is the owner's, the secretary's, the representative's or the buyer's depending on whose name is on it,
 *     checked against the certificate of registration, the secretary's certificate and the deal's buyer.
 *   - A deed of sale is "seller to dealership" or "signed with the buyer" depending on who the buyer on it is.
 *   - The case (clean, encumbered, repo bank, company) is suggested from what is in the folder.
 *   - Plates, motor and chassis numbers and names that do not agree between documents are flagged, and
 *     two photos of one document are marked.
 * Pure code: the same photos always give the same answer, and a person can override any of it.
 */

export interface FileInput {
  id: string;
  filename: string;
  createdAt: string;
  /** null until the photo has been read */
  detections: Detection[] | null;
  readStatus: "pending" | "done" | "failed" | "unreadable";
  /** Types a person chose by hand; these win. */
  manualTypes: DocType[] | null;
}

export interface FileResult { id: string; types: DocType[]; flags: string[]; duplicateOf: string | null }
export interface Analysis { files: FileResult[]; suggestedCase: CaseType }

export interface FolderContext { plate: string; caseType: CaseType | null }
/** `linked`: an AR (deal) is attached to this car. Without one, the buyer is taken from a signed deed and the AR line is left out. */
export interface DealContext { buyerName: string | null; hasReceipt: boolean; linked?: boolean }

const DEALER_NAMES = ["manila auto display", "mad parking", "mad auto", "dryve"];
const squash = (v: string | null | undefined) => (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** The reader can misread a character or two in small print; only a clear difference is a real mismatch. */
const nearlySame = (a: string, b: string, maxEdits: number) => a === b || a.includes(b) || b.includes(a) || editDistance(a, b) <= maxEdits;
/** Long numbers (a 17-character chassis number) may have a few wrong characters; a different car's number differs in many. */
const allowedEdits = (v: string) => (v.length >= 12 ? Math.floor(v.length * 0.25) : 2);
/** Only something shaped like a plate (3 letters, 3 or 4 digits) is judged; a stray file number is not. */
const looksLikePlate = (v: string) => /^[A-Z]{3}\d{3,4}$/.test(v);
/** Papers that must be the original, not a xerox. IDs are not on this list: a copy of an ID is normal. */
const ORIGINAL_ONLY = new Set(["official_receipt", "certificate_of_registration", "deed_of_sale", "chattel_cancellation", "secretary_certificate", "board_resolution"]);
const VEHICLE_PAPERS = new Set(["official_receipt", "certificate_of_registration", "deed_of_sale"]);
/** The same person written in any order gives the same key. */
const nameKey = (n: string | null | undefined) => normName(n).split(" ").filter(Boolean).sort().join(" ");
const labelOf = (t: DocType) => DOC_LABELS[t].replace(/ \(.*\)$/, "");

export function detectCase(detections: Detection[], types: DocType[]): CaseType {
  const owners = detections.filter((d) => d.type === "certificate_of_registration").map((d) => d.ownerName).filter(Boolean) as string[];
  const has = (t: DocType) => types.includes(t);
  const ownerIsBank = owners.some(looksLikeBank), ownerIsCompany = owners.some(looksLikeCompany);
  if (has("board_resolution")) return "company";
  if (has("secretary_certificate")) return ownerIsBank || has("chattel_cancellation") || has("promissory_note") ? "repo_bank" : ownerIsCompany ? "company" : "repo_bank";
  if (has("chattel_cancellation") || has("promissory_note")) return "encumbered";
  // a deed whose seller is a bank is a repossessed car, even before the secretary's papers are in
  if (detections.some((d) => d.type === "deed_of_sale" && looksLikeBank(d.sellerName))) return "repo_bank";
  return "clean";
}

export function analyze(files: FileInput[], folder: FolderContext, deal: DealContext, dealerNames: string[] = DEALER_NAMES): Analysis {
  const all = files.flatMap((f) => f.detections ?? []);
  // The registered owner is named on the CR, and also on the official receipt.
  const owners = all.filter((d) => d.type === "certificate_of_registration" || d.type === "official_receipt").flatMap((d) => [d.ownerName, d.type === "official_receipt" ? d.holderName : null]).filter(Boolean) as string[];
  const secretaries = all.filter((d) => d.type === "secretary_certificate").map((d) => d.secretaryName).filter(Boolean) as string[];
  const reps = all.filter((d) => d.type === "secretary_certificate").map((d) => d.representativeName).filter(Boolean) as string[];
  const isDealer = (n: string | null | undefined) => { const x = normName(n); return !!x && dealerNames.some((d) => x.includes(normName(d))); };

  // With no AR linked, the buyer is whoever a deed (not to the dealership) names as the buyer.
  const deedBuyer = all.filter((d) => d.type === "deed_of_sale" && d.buyerName && !isDealer(d.buyerName)).map((d) => d.buyerName!)[0] ?? null;
  const buyerName = deal.buyerName ?? deedBuyer;
  const resolveId = (holder: string | null | undefined): DocType => {
    if (!holder) return "id_unmatched";
    if (secretaries.some((n) => sameName(n, holder))) return "secretary_id";
    if (reps.some((n) => sameName(n, holder))) return "representative_id";
    if (owners.some((n) => sameName(n, holder))) return "owner_id";
    if (buyerName && sameName(buyerName, holder)) return "buyer_id";
    return "id_unmatched";
  };
  const resolveDeed = (d: Detection): DocType => {
    if (isDealer(d.buyerName)) return "deed_owner_to_dealer";
    if (!d.buyerName) return "deed_owner_to_dealer"; // an open deed: the owner signed it and the buyer's line is blank, as dealers usually receive it
    if (deal.buyerName ? sameName(deal.buyerName, d.buyerName) : !!d.buyerName) return "deed_to_buyer"; // no AR: any deed to a person is the buyer's
    return "deed_unmatched";
  };
  const resolve = (d: Detection): DocType => (d.type === "government_id" ? resolveId(d.holderName) : d.type === "deed_of_sale" ? resolveDeed(d) : d.type);

  const results: FileResult[] = files.map((f) => {
    const types = f.manualTypes ?? [...new Set((f.detections ?? []).map(resolve))];
    const flags: string[] = [];
    for (const d of f.detections ?? []) {
      if (d.confidence < 0.6 && d.type !== "other") flags.push(`Not sure this is a ${labelOf(resolve(d)).toLowerCase()}. Please check.`);
      const t = resolve(d);
      if (d.copy === "photocopy" && ORIGINAL_ONLY.has(d.type)) flags.push(`The ${labelOf(t).toLowerCase()} looks like a photocopy (xerox), not the original.`);
      if (d.defects?.length) flags.push(`The ${labelOf(t).toLowerCase()} shows a problem: ${d.defects.join(", ")}.`);
      if (d.plate) { // any paper with a clearly different plate may belong to another car
        const seen = squash(d.plate);
        if (looksLikePlate(seen) && !nearlySame(seen, folder.plate, 1)) flags.push(`The plate on the ${labelOf(t).toLowerCase()} reads ${d.plate}, but this folder is ${folder.plate}.`);
      }
      if (t === "deed_owner_to_dealer" && d.sellerName && owners.length && !owners.some((o) => sameName(o, d.sellerName))) flags.push(`The seller on the deed (${d.sellerName}) is not the registered owner on the CR (${owners[0]}).`);
      if (t === "id_unmatched" && d.holderName) flags.push(`${d.holderName} is not the owner, the secretary, the representative or the buyer on file. Choose whose ID this is.`);
      if (t === "deed_unmatched") flags.push("The buyer on this deed is neither the dealership nor the buyer of this deal. Choose what it is.");
    }
    if (f.readStatus === "failed") flags.push("Could not read this file. Try reading it again, or choose what it is.");
    if (f.readStatus === "unreadable") flags.push("The picture is too unclear to read. Retake it, or choose what it is.");
    return { id: f.id, types: types.length ? types : f.readStatus === "done" ? ["other"] : [], flags, duplicateOf: null };
  });

  // Motor and chassis numbers should be the same wherever they appear (OR, CR, deeds).
  for (const key of ["motorNo", "chassisNo"] as const) {
    const seen = files.flatMap((f) => (f.detections ?? []).filter((d) => VEHICLE_PAPERS.has(d.type)).map((d) => ({ file: f.id, v: squash(d[key]) }))).filter((x) => x.v.length >= 6);
    const first = seen[0];
    if (first) for (const x of seen) {
      if (!nearlySame(x.v, first.v, allowedEdits(first.v))) {
        const label = key === "motorNo" ? "motor" : "chassis";
        for (const id of new Set([first.file, x.file])) results.find((r) => r.id === id)?.flags.push(`The ${label} number does not match between documents (${first.v} and ${x.v}).`);
      }
    }
  }

  // Two photos of one document: the same number (or the same person's same ID) seen twice.
  const byId = new Map(files.map((f) => [f.id, f]));
  const firstSeen = new Map<string, string>();
  for (const f of [...files].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const r = results.find((x) => x.id === f.id)!;
    for (const d of f.detections ?? []) {
      if (d.type === "other") continue;
      const who = squash(d.documentNumber) || (d.type === "government_id" ? `${nameKey(d.holderName)}|${normName(d.idType)}` : "");
      if (!who || who === "|") continue;
      const key = `${d.type}|${who}`;
      const earlier = firstSeen.get(key);
      if (earlier && earlier !== f.id) {
        r.duplicateOf ??= earlier;
        r.flags.push(`Looks like the same document as ${byId.get(earlier)?.filename ?? "another photo"} (two photos of one document).`);
      } else firstSeen.set(key, f.id);
    }
  }

  const allTypes = results.flatMap((r) => r.types);
  return { files: results.map((r) => ({ ...r, flags: [...new Set(r.flags)] })), suggestedCase: detectCase(all, allTypes) };
}

// ---------------- the checklist ----------------

export interface ChecklistItem { key: string; type: DocType | "ack"; label: string; stage: "available" | "sold"; present: boolean; fileIds: string[] }
export interface Checklist { items: ChecklistItem[]; missing: ChecklistItem[]; complete: boolean }

export function checklist(caseType: CaseType, results: FileResult[], deal: DealContext): Checklist {
  const items: ChecklistItem[] = [
    ...REQUIRED_BY_CASE[caseType].map((type) => ({ key: type, type, label: DOC_LABELS[type], stage: "available" as const, ...presence(type, results) })),
    // the AR is a file Sales uploads (the signed paper), like the buyer's ID and the deed; the app's own receipt is not filed in the folder
    ...(deal.linked === false ? [] : [{ key: "ack", type: "ack" as const, label: ACK_LABEL, stage: "sold" as const, ...presence("acknowledgement_receipt", results) }]),
    ...SOLD_EXTRAS.map((type) => ({ key: type, type, label: DOC_LABELS[type], stage: "sold" as const, ...presence(type, results) })),
  ];
  const missing = items.filter((i) => !i.present);
  return { items, missing, complete: missing.length === 0 };
}

function presence(type: DocType, results: FileResult[]): { present: boolean; fileIds: string[] } {
  const ids = results.filter((r) => r.types.includes(type) && !r.duplicateOf).map((r) => r.id);
  const dup = results.filter((r) => r.types.includes(type)).map((r) => r.id);
  return { present: dup.length > 0, fileIds: ids.length ? ids : dup };
}

export type FolderStatus =
  | { key: "unlinked"; label: string }
  | { key: "unread"; label: string }
  | { key: "review"; label: string }
  | { key: "missing"; label: string }
  | { key: "complete"; label: string };

/** One word for the list: what a person should do about this car. */
export function folderStatus(list: Checklist, results: FileResult[], readPending: number, linked: boolean): FolderStatus {
  if (!linked) return { key: "unlinked", label: "No folder linked" };
  if (readPending > 0) return { key: "unread", label: `${readPending} to read` };
  const review = results.filter((r) => r.flags.length > 0 || r.types.some((t) => t === "id_unmatched" || t === "deed_unmatched")).length;
  if (review > 0) return { key: "review", label: `${review} to check` };
  if (!list.complete) return { key: "missing", label: `${list.missing.length} missing` };
  return { key: "complete", label: "Complete" };
}

export { CASE_LABELS };
