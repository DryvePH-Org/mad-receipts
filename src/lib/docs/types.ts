// The car documents: what kinds there are, which cases a car can be in, and what each case needs.

/** What the reader sees on a photo, before anyone knows whose ID or which deed it is. */
export const RAW_TYPES = [
  "official_receipt", "certificate_of_registration", "government_id", "deed_of_sale", "chattel_cancellation",
  "promissory_note", "secretary_certificate", "board_resolution", "acknowledgement_receipt", "transmittal_receipt", "stencil",
  "spa", "ex_oficio_sheriff", "voluntary_documents", "secretary_certificate_jfp", "notarized_undertaking", "sec_document", "other",
] as const;
export type RawType = (typeof RAW_TYPES)[number];

/** What a document is for, once the IDs and deeds are tied to a person (the checklist works on these). */
export const DOC_TYPES = [
  "official_receipt", "certificate_of_registration", "owner_id", "deed_owner_to_dealer", "chattel_cancellation", "promissory_note",
  "secretary_certificate", "secretary_id", "representative_id", "board_resolution", "buyer_id", "deed_to_buyer",
  "acknowledgement_receipt", "transmittal_receipt", "stencil",
  // extra papers some cars come with: they show on the checklist when one is in the folder and are never missing
  "spa", "ex_oficio_sheriff", "voluntary_documents", "secretary_certificate_jfp", "notarized_undertaking", "sec_document",
  // a deed with the buyer named and notarized: kept private from Sales and Online Marketing
  "deed_closed",
  // seen but not tied to anyone yet: a person decides
  "id_unmatched", "deed_unmatched", "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_LABELS: Record<DocType, string> = {
  official_receipt: "Official receipt (OR)",
  certificate_of_registration: "Certificate of registration (CR)",
  owner_id: "ID of the registered owner",
  deed_owner_to_dealer: "Open deed of sale (seller to dealership)",
  deed_closed: "Notarized closed deed of sale",
  chattel_cancellation: "Cancellation of chattel mortgage",
  promissory_note: "Promissory note",
  secretary_certificate: "Secretary's certificate",
  secretary_id: "Secretary's ID",
  representative_id: "ID of the representative",
  board_resolution: "Board resolution",
  buyer_id: "Buyer's ID",
  deed_to_buyer: "Deed of sale signed with the buyer",
  acknowledgement_receipt: "Acknowledgement of payment (paper copy)",
  transmittal_receipt: "Transmittal receipt",
  stencil: "Stencil (chassis or engine rubbing)",
  spa: "Special Power of Attorney (SPA)",
  ex_oficio_sheriff: "Ex-Oficio Sheriff",
  voluntary_documents: "Voluntary documents",
  secretary_certificate_jfp: "Secretary's certificate of JFP and amended articles of incorporation",
  notarized_undertaking: "Notarized undertaking to change name",
  sec_document: "Securities and Exchange Commission (SEC)",
  id_unmatched: "An ID (whose is not clear)",
  deed_unmatched: "A deed of sale (between whom is not clear)",
  other: "Other / not recognised",
};

/** Documents the app can recognise as a type a person may choose by hand. */
export const CHOOSABLE: DocType[] = [
  "official_receipt", "certificate_of_registration", "owner_id", "deed_owner_to_dealer", "chattel_cancellation", "promissory_note",
  "secretary_certificate", "secretary_id", "representative_id", "board_resolution", "buyer_id", "deed_to_buyer", "acknowledgement_receipt", "transmittal_receipt", "stencil",
  "spa", "ex_oficio_sheriff", "voluntary_documents", "secretary_certificate_jfp", "notarized_undertaking", "sec_document", "deed_closed", "other",
];

/** Papers a car may have but does not need: they show on the checklist and never count as missing. */
export const OPTIONAL_DOCS: DocType[] = ["stencil"];
/** Extra papers: listed on the checklist only when one is in the folder, never missing. */
export const EXTRA_DOCS: DocType[] = ["spa", "ex_oficio_sheriff", "voluntary_documents", "secretary_certificate_jfp", "notarized_undertaking", "sec_document", "deed_closed"];
/** Papers Sales and Online Marketing do not see: not on the checklist, and their photos are not shown or downloaded. */
export const PRIVATE_DOCS: DocType[] = ["deed_closed"];

export const CASES = ["clean", "encumbered", "encumbered_bank", "encumbered_financing", "repo_bank", "company"] as const;
export type CaseType = (typeof CASES)[number];
export const CASE_LABELS: Record<CaseType, string> = { clean: "Clean", encumbered: "Encumbered", encumbered_bank: "Encumbered to Bank", encumbered_financing: "Encumbered to Financing", repo_bank: "Repo bank", company: "Company" };
/** What staff may choose: the plain "Encumbered" stays only for cars that already have it, until Buying picks the bank or the financing kind. */
export const CHOOSABLE_CASES: CaseType[] = ["clean", "encumbered_bank", "encumbered_financing", "repo_bank", "company"];
export const isEncumbered = (c: CaseType): boolean => c === "encumbered" || c === "encumbered_bank" || c === "encumbered_financing";

/** Required before the car is sold (the Available folder). */
const BASE: DocType[] = ["official_receipt", "certificate_of_registration", "owner_id", "deed_owner_to_dealer"];
export const REQUIRED_BY_CASE: Record<CaseType, DocType[]> = {
  clean: BASE,
  encumbered: [...BASE, "chattel_cancellation", "promissory_note"],
  encumbered_bank: [...BASE, "chattel_cancellation", "promissory_note"],
  encumbered_financing: [...BASE, "chattel_cancellation", "promissory_note"],
  repo_bank: [...BASE, "chattel_cancellation", "promissory_note", "secretary_certificate", "secretary_id"],
  company: ["official_receipt", "certificate_of_registration", "representative_id", "deed_owner_to_dealer", "secretary_certificate", "secretary_id", "board_resolution"],
};

/** Added for every case when the car is sold. Sales uploads the signed acknowledgement of payment (the AR) with the buyer's ID and the deed. */
export const SOLD_EXTRAS: DocType[] = ["buyer_id", "deed_to_buyer"];
export const ACK_LABEL = "Signed acknowledgement of payment (the AR, paper copy)";

/** A photo's reading, as stored. */
export interface Detection {
  type: RawType;
  confidence: number;
  documentNumber?: string | null;
  plate?: string | null;
  motorNo?: string | null;
  chassisNo?: string | null;
  ownerName?: string | null;
  holderName?: string | null;
  sellerName?: string | null;
  buyerName?: string | null;
  secretaryName?: string | null;
  representativeName?: string | null;
  idType?: string | null;
  /** official receipt: the date the registration payment is valid until or due for renewal (YYYY-MM-DD) */
  validUntil?: string | null;
  /** chattel mortgage, its cancellation or the promissory note: the bank or financing company named */
  lender?: string | null;
  /** official receipt: the big registration OR, or the small last (latest payment) OR; either one counts as the OR */
  orKind?: "registration" | "last" | null;
  /** deed of sale: open (buyer line blank) or closed (buyer named and notarized) */
  deedKind?: "open" | "closed" | null;
  /** original paper or a photocopy (xerox) */
  copy?: "original" | "photocopy" | null;
  /** problems seen on this document: torn, cut off, blurry, altered, missing signature or stamp... */
  defects?: string[] | null;
}
