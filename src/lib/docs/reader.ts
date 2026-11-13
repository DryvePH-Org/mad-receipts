import "server-only";
import { z } from "zod";
import { visionJson } from "@/lib/voice/groq";
import { grokConfigured, grokVisionJson } from "@/lib/voice/xai";
import { sameName } from "./names";
import { RAW_TYPES, type Detection } from "./types";

/** What the picture reader returns for one photo or scanned page. */
export interface Reading {
  /** degrees clockwise the picture must be turned to be upright (0, 90, 180 or 270); only for showing it */
  rotation: 0 | 90 | 180 | 270;
  /** false when the picture is too blurry, dark or cut off to say what it is */
  legible: boolean;
  detections: Detection[];
  notes: string | null;
}

const text = z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : typeof v === "number" ? String(v) : null), z.string().nullable()).default(null);
const confidence = z.preprocess((v) => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5; }, z.number());
const doc = z.object({
  type: z.preprocess((v) => (typeof v === "string" && (RAW_TYPES as readonly string[]).includes(v) ? v : "other"), z.enum(RAW_TYPES)),
  confidence,
  document_number: text, plate: text, motor_no: text, chassis_no: text,
  copy: z.preprocess((v) => (v === "original" || v === "photocopy" ? v : null), z.enum(["original", "photocopy"]).nullable()).default(null),
  defects: z.preprocess((v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x: string) => x.trim().slice(0, 80)).slice(0, 5) : []), z.array(z.string())).default([]),
  owner_name: text, holder_name: text, seller_name: text, buyer_name: text, secretary_name: text, representative_name: text, id_type: text,
});
const rotation = z.preprocess((v) => { const n = Number(v); return [0, 90, 180, 270].includes(n) ? n : 0; }, z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])).default(0);
const Reply = z.object({ rotation, legible: z.boolean().catch(true), documents: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 4) : []), z.array(doc)).default([]), notes: text });

export const readerPrompt = () => `You look at one photo (or one scanned page) from the document folder of a car sold in the Philippines, and say which documents it shows.

Return ONLY a JSON object:
{
  "legible": true,
  "rotation": 0,
  "documents": [
    { "type": "...", "confidence": 0.0-1.0, "copy": "original", "defects": [], "document_number": null, "plate": null, "motor_no": null, "chassis_no": null,
      "owner_name": null, "holder_name": null, "seller_name": null, "buyer_name": null, "secretary_name": null, "representative_name": null, "id_type": null }
  ],
  "notes": "one short sentence if something is unusual, else null"
}

"type" is exactly one of:
- "official_receipt": the LTO (Land Transportation Office) "Official Receipt", a receipt of payment for registration. It has a payor, an amount, a barcode or QR code.
- "certificate_of_registration": the LTO "Certificate of Registration" (CR): file number, plate number, engine/motor number, chassis number, make, body type, year model, registered owner.
- "government_id": a driver's license, passport, UMID, PhilID, SSS, voter's ID, PRC, postal ID, company ID or any ID card with a photo.
- "deed_of_sale": a Deed of Sale or Deed of Absolute Sale of a motor vehicle, between a seller and a buyer.
- "chattel_cancellation": a Release or Cancellation of Chattel Mortgage, or a Release of Mortgage, usually from a bank or financing company.
- "promissory_note": a Promissory Note.
- "secretary_certificate": a Secretary's Certificate (a company's secretary certifies a board resolution and names who may sign).
- "board_resolution": a Board Resolution.
- "acknowledgement_receipt": the dealership's own yellow "ACKNOWLEDGEMENT OF PAYMENT" form (Manila Auto Display), with a red number, "Received from", the sum of pesos and the vehicle described. It is mostly handwritten. Put the buyer on it in "buyer_name" and its red number in "document_number".
- "transmittal_receipt": a "Transmittal Receipt" or acknowledgement of the papers handed over with a car, a checklist of documents (CR, OR, deed...).
- "other": anything else, or a picture that is not a document.

Rules:
- One photo can show MORE THAN ONE document (an LTO official receipt and the certificate of registration are often photographed together on one sheet, one above the other): list each one separately. Documents can be rotated or at an angle: still read them.
- The photo may be sideways or upside down (the picture is not turned for you): turn it in your head and read it the right way up. Read every character slowly; a number you cannot read in full is null, never a shortened or guessed one.
- "rotation": how many degrees clockwise the picture must be turned so the writing reads upright: 0, 90, 180 or 270. 0 when it is already upright.
- "copy": "original" for the paper itself (colour, security pattern, real signatures and stamps, the paper is photographed), "photocopy" for a xerox or black-and-white copy or a screenshot or print of a scan. null if you cannot tell.
- "defects": a short list (at most 5) of real problems you can SEE on this document: "torn", "cut off", "blurry", "glare", "stained", "folded", "missing signature", "missing stamp", "altered or written over", "partly covered". Empty list when it looks fine. Do not invent any.
- Fill a detail only if you can read it with confidence. NEVER guess or invent. Otherwise null.
- "plate": ONLY a vehicle plate number, letters then digits like "NBR 9511" or "ABC 1234" (it is not the MV file number, CR number, OR number, transaction number or conduction sticker, and not an engine or chassis number). The plate box on an old certificate of registration is often EMPTY: then it is null. On an LTO payment slip it is written after "Plate No:". null if you cannot see a plate. "motor_no" is the engine or motor number. "chassis_no" is the chassis or VIN.
- "document_number": the number that identifies THIS document (the CR number, the OR number, the ID number, the note number). null if none is readable.
- "owner_name": the registered owner on a certificate of registration or official receipt. "holder_name": the name of the person on an ID. "seller_name" and "buyer_name": the parties on a deed of sale. "secretary_name": who signs a secretary's certificate as the corporate secretary. "representative_name": the person the certificate or resolution authorises to sign or sell for the company. "id_type": for example "Driver's license" or "UMID".
- Copy names as printed (any order, any capitals). Do not complete or correct them.
- "confidence" is how sure you are about the TYPE: 0.9 or more when the title is clearly readable, lower when you are inferring it from the layout.
- If the picture is too blurry, dark, glared or cut off to tell what it is, set "legible" to false and "documents" to [].`;

/** Only something shaped like a Philippine plate is kept (3 letters then 2-5 digits, or the older digits then letters); a file or engine number the reader mistook for a plate is dropped. */
export function cleanPlate(v: string | null | undefined): string | null {
  const s = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{2,3}\d{2,5}$/.test(s) || /^\d{3,4}[A-Z]{2,3}$/.test(s) ? (v ?? "").trim() : null;
}

export class ReaderError extends Error {}

const parse = (raw: string): unknown => { try { return JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")); } catch { return undefined; } };

/**
 * The same document listed twice in one photo (it happens: an OR and a CR each came back twice) is one document.
 * Two IDs with different names stay two IDs; the same person's ID twice is one.
 */
export function mergeRepeats(list: Detection[]): Detection[] {
  const out: Detection[] = [];
  for (const d of list) {
    const same = out.find((x) => x.type === d.type && (d.type === "government_id" ? sameName(x.holderName, d.holderName) || (!x.holderName && !d.holderName) : d.type === "other" ? false : true));
    if (!same) { out.push({ ...d }); continue; }
    for (const key of Object.keys(d) as (keyof Detection)[]) {
      if (key === "type") continue;
      if (key === "confidence") same.confidence = Math.max(same.confidence, d.confidence);
      else if ((same[key] === null || same[key] === undefined) && d[key] != null) (same as unknown as Record<string, unknown>)[key] = d[key];
    }
  }
  return out;
}

/** An answer (already parsed from JSON) turned into a Reading, or null when it is not a usable answer. Used for the picture models and for the grokbot. */
export function readingFromReply(raw: unknown): Reading | null {
  const parsed = Reply.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  return {
    legible: r.legible,
    rotation: r.rotation,
    notes: r.notes,
    detections: mergeRepeats(r.documents.map((d) => ({
      type: d.type, confidence: d.confidence, documentNumber: d.document_number, plate: cleanPlate(d.plate), motorNo: d.motor_no, chassisNo: d.chassis_no,
      copy: d.copy, defects: d.defects.length ? d.defects : null, ownerName: d.owner_name, holderName: d.holder_name, sellerName: d.seller_name, buyerName: d.buyer_name,
      secretaryName: d.secretary_name, representativeName: d.representative_name, idType: d.id_type,
    }))),
  };
}

/** The model call, injectable so the parsing can be tested without the network. */
export async function readDocument(
  image: { base64: string; mime: string },
  call: (system: string, user: string, dataUrl: string) => Promise<string> = (grokConfigured() ? grokVisionJson : visionJson),
): Promise<Reading> {
  const dataUrl = `data:${image.mime};base64,${image.base64}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reading = readingFromReply(parse(await call(readerPrompt(), "Which documents does this picture show?", dataUrl)));
    if (reading) return reading;
  }
  throw new ReaderError("The picture reader gave an answer that could not be understood.");
}

/**
 * A stand-in reader for local development and the browser tests (DOCS_FAKE_READER=1): it decides from the
 * file name, so no picture is sent anywhere. "cr-or", "id-Maria Lim", "deed-to-dealer", "secretary-cert"...
 */
export function fakeReading(filename: string, plate: string): Reading {
  const n = filename.toLowerCase();
  const d = (type: Detection["type"], over: Partial<Detection> = {}): Detection => ({ type, confidence: 0.95, plate, ...over });
  const detections: Detection[] = [];
  if (/(^|[^a-z])or([^a-z]|$)/.test(n) || n.includes("receipt")) detections.push(d("official_receipt", { documentNumber: `OR-${plate}` }));
  if (/(^|[^a-z])cr([^a-z]|$)/.test(n)) detections.push(d("certificate_of_registration", { documentNumber: `CR-${plate}`, ownerName: "LIM, MARIA LEONILA" }));
  const id = /id-([^.]+)/.exec(filename);
  if (id) detections.push({ type: "government_id", confidence: 0.9, holderName: id[1].replace(/_/g, " "), idType: "Driver's license" });
  if (n.includes("deed-dealer")) detections.push(d("deed_of_sale", { sellerName: "LIM, MARIA LEONILA", buyerName: "Manila Auto Display" }));
  const buyer = /deed-buyer-([^.]+)/.exec(filename);
  if (buyer) detections.push(d("deed_of_sale", { sellerName: "LIM, MARIA LEONILA", buyerName: buyer[1].replace(/_/g, " ") }));
  const ar = /(^|[^a-z])ar-([^.]+)/.exec(n);
  if (ar) detections.push(d("acknowledgement_receipt", { buyerName: filename.slice(filename.toLowerCase().indexOf("ar-") + 3).replace(/\.[^.]+$/, "").replace(/_/g, " "), documentNumber: "2516" }));
  if (n.includes("promissory")) detections.push(d("promissory_note"));
  if (n.includes("chattel") || n.includes("rcm")) detections.push(d("chattel_cancellation"));
  if (n.includes("secretary-cert")) detections.push(d("secretary_certificate", { secretaryName: "Ana Reyes", representativeName: "Pedro Santos" }));
  if (n.includes("board")) detections.push(d("board_resolution"));
  if (n.includes("blurry")) return { legible: false, rotation: 0, detections: [], notes: null };
  return { legible: true, rotation: 0, detections: detections.length ? detections : [{ type: "other", confidence: 0.9 }], notes: null };
}
