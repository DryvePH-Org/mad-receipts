import { z } from "zod";
import type { Detection, DocType } from "./types";

// The "Acknowledgement / Transmittal Receipt": the list of papers and items handed over with a car. Much of it follows from the car's
// documents workflow (the papers found in its folder), the rest the staff tick and type by hand.

export interface TransmittalItem {
  key: string;
  label: string;
  /** a line beside it for a number or a note ("Certificate of Registration #") */
  line: boolean;
  /** which column on the paper */
  side: "left" | "right";
  /** the folder's documents that mean this item is there */
  from?: DocType[];
}

export const TRANSMITTAL_ITEMS: TransmittalItem[] = [
  { key: "cr", label: "Original copy of Certificate of Registration #", line: true, side: "left", from: ["certificate_of_registration"] },
  { key: "or", label: "Original copy of LTO Official Receipt #", line: true, side: "left", from: ["official_receipt"] },
  { key: "deed", label: "Original/Photocopy of Notarized Deed of Sale", line: true, side: "left", from: ["deed_owner_to_dealer", "deed_to_buyer"] },
  { key: "companyDeed", label: "Original/Photocopy of Company Deed of Sale (as needed)", line: true, side: "left" },
  { key: "ownerId", label: "IDs of Owner with 3 specimen signatures", line: true, side: "left", from: ["owner_id", "representative_id"] },
  { key: "buyerId", label: "IDs of Buyer with 3 specimen signatures", line: true, side: "left", from: ["buyer_id"] },
  { key: "stencils", label: "Set of Stencils", line: true, side: "left" },
  { key: "insurance", label: "Insurance Policy", line: true, side: "left" },
  { key: "secCert", label: "Original/Photocopy of Secretary's Certificate", line: false, side: "left", from: ["secretary_certificate"] },
  { key: "chattel", label: "Original/Photocopy of Release of Chattel Mortgage", line: false, side: "left", from: ["chattel_cancellation"] },
  { key: "macro", label: "Macro-Etching Certificate", line: false, side: "left" },
  { key: "pnp", label: "PNP Motor Vehicle Clearance Certificate", line: true, side: "left" },
  { key: "manual", label: "Manual Booklet", line: false, side: "right" },
  { key: "handbook", label: "Service Handbook", line: false, side: "right" },
  { key: "secId", label: "With Secretary's valid ID", line: false, side: "right", from: ["secretary_id"] },
  { key: "promissory", label: "with Promissory Note", line: false, side: "right", from: ["promissory_note"] },
  { key: "spareKey", label: "Spare Key", line: false, side: "right" },
];

const text = (max: number) => z.string().max(max).catch("");
export const transmittalSchema = z.object({
  makeType: text(150),
  plate: text(20),
  owner: text(150),
  items: z.record(z.string().max(30), z.object({ on: z.boolean().catch(false), detail: text(80) })).catch({}),
  others: z.array(text(120)).max(4).catch([]),
  note: text(300),
  preparedBy: text(100),
  preparedOn: text(10),
  receivedBy: text(100),
  receivedOn: text(10),
});
export type TransmittalData = z.infer<typeof transmittalSchema>;

/** The saved form, cleaned: unknown items are dropped and everything is capped. Anything unreadable becomes empty. */
export function cleanTransmittal(raw: unknown): TransmittalData {
  const t = transmittalSchema.parse(raw ?? {});
  const known = new Set(TRANSMITTAL_ITEMS.map((i) => i.key));
  return { ...t, items: Object.fromEntries(Object.entries(t.items).filter(([k]) => known.has(k))), others: [...t.others, "", "", ""].slice(0, 3) };
}

export interface TransmittalSource {
  plateDisplay: string;
  /** the Drive folder's name, like "21 Geely Okavango (NKP5459)" */
  folderName: string | null;
  /** what the folder's papers were read as (all files together) */
  types: DocType[];
  caseType: string;
  detections: Detection[];
  /** who is filling it in, and today as YYYY-MM-DD */
  userName: string;
  today: string;
}

/** The make and type from a folder name: the plate in brackets is dropped. */
export const makeTypeFrom = (folderName: string | null, plate: string) => {
  const loose = plate.replace(/[^A-Za-z0-9]/g, "").split("").join("[-\\s]?"); // the plate as written in a folder name: with or without a dash or space
  return (folderName ?? "").replace(/\(([^)]*)\)\s*$/, "").replace(new RegExp(loose, "i"), "").replace(/\s+/g, " ").trim();
};

/** What the car's documents workflow already knows, as a starting point the staff then edit. */
export function prefillTransmittal(src: TransmittalSource): TransmittalData {
  const have = new Set(src.types);
  const num = (type: Detection["type"]) => src.detections.find((d) => d.type === type && d.documentNumber)?.documentNumber ?? "";
  const items: TransmittalData["items"] = {};
  for (const it of TRANSMITTAL_ITEMS) {
    const on = (it.from ?? []).some((t) => have.has(t)) || (it.key === "companyDeed" && src.caseType === "company" && have.has("deed_owner_to_dealer"));
    if (!on) continue;
    items[it.key] = { on: true, detail: it.key === "cr" ? num("certificate_of_registration") : it.key === "or" ? num("official_receipt") : "" };
  }
  const owner = src.detections.find((d) => d.type === "certificate_of_registration" && d.ownerName)?.ownerName ?? "";
  return { makeType: makeTypeFrom(src.folderName, src.plateDisplay), plate: src.plateDisplay, owner, items, others: ["", "", ""], note: "", preparedBy: src.userName, preparedOn: src.today, receivedBy: "", receivedOn: "" };
}
