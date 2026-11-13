// The car documents: what kinds there are, which cases a car can be in, and what each case needs.

/** What the reader sees on a photo, before anyone knows whose ID or which deed it is. */
export const RAW_TYPES = [
  "official_receipt", "certificate_of_registration", "government_id", "deed_of_sale", "chattel_cancellation",
  "promissory_note", "secretary_certificate", "board_resolution", "acknowledgement_receipt", "transmittal_receipt", "other",
] as const;
export type RawType = (typeof RAW_TYPES)[number];

/** What a document is for, once the IDs and deeds are tied to a person (the checklist works on these). */
export const DOC_TYPES = [
  "official_receipt", "certificate_of_registration", "owner_id", "deed_owner_to_dealer", "chattel_cancellation", "promissory_note",
  "secretary_certificate", "secretary_id", "representative_id", "board_resolution", "buyer_id", "deed_to_buyer",
  "acknowledgement_receipt", "transmittal_receipt",
  // seen but not tied to anyone yet: a person decides
  "id_unmatched", "deed_unmatched", "other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_LABELS: Record<DocType, string> = {
  official_receipt: "Official receipt (OR)",
  certificate_of_registration: "Certificate of registration (CR)",
  owner_id: "ID of the registered owner",
  deed_owner_to_dealer: "Deed of sale, seller to dealership",
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
  id_unmatched: "An ID (whose is not clear)",
  deed_unmatched: "A deed of sale (between whom is not clear)",
  other: "Other / not recognised",
};

/** Documents the app can recognise as a type a person may choose by hand. */
export const CHOOSABLE: DocType[] = [
  "official_receipt", "certificate_of_registration", "owner_id", "deed_owner_to_dealer", "chattel_cancellation", "promissory_note",
  "secretary_certificate", "secretary_id", "representative_id", "board_resolution", "buyer_id", "deed_to_buyer", "acknowledgement_receipt", "transmittal_receipt", "other",
];

export const CASES = ["clean", "encumbered", "repo_bank", "company"] as const;
export type CaseType = (typeof CASES)[number];
export const CASE_LABELS: Record<CaseType, string> = { clean: "Clean", encumbered: "Encumbered", repo_bank: "Repo bank", company: "Company" };

/** Required before the car is sold (the Available folder). */
const BASE: DocType[] = ["official_receipt", "certificate_of_registration", "owner_id", "deed_owner_to_dealer"];
export const REQUIRED_BY_CASE: Record<CaseType, DocType[]> = {
  clean: BASE,
  encumbered: [...BASE, "chattel_cancellation", "promissory_note"],
  repo_bank: [...BASE, "chattel_cancellation", "promissory_note", "secretary_certificate", "secretary_id"],
  company: ["official_receipt", "certificate_of_registration", "representative_id", "deed_owner_to_dealer", "secretary_certificate", "secretary_id", "board_resolution"],
};

/** Added for every case when the car is sold. Sales uploads the signed acknowledgement of payment (the AR) with the buyer's ID and the deed. */
export const SOLD_EXTRAS: DocType[] = ["buyer_id", "deed_to_buyer"];
export const ACK_LABEL = "Acknowledgement of payment (the AR)";

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
  /** original paper or a photocopy (xerox) */
  copy?: "original" | "photocopy" | null;
  /** problems seen on this document: torn, cut off, blurry, altered, missing signature or stamp... */
  defects?: string[] | null;
}
