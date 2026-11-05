import "server-only";
import { z } from "zod";
import { visionJson } from "@/lib/voice/groq";
import { sameName } from "./names";
import { RAW_TYPES, type Detection } from "./types";

/** What the picture reader returns for one photo or scanned page. */
export interface Reading {
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
  owner_name: text, holder_name: text, seller_name: text, buyer_name: text, secretary_name: text, representative_name: text, id_type: text,
});
const Reply = z.object({ legible: z.boolean().catch(true), documents: z.preprocess((v) => (Array.isArray(v) ? v.slice(0, 4) : []), z.array(doc)).default([]), notes: text });

export const readerPrompt = () => `You look at one photo (or one scanned page) from the document folder of a car sold in the Philippines, and say which documents it shows.

Return ONLY a JSON object:
{
  "legible": true,
  "documents": [
    { "type": "...", "confidence": 0.0-1.0, "document_number": null, "plate": null, "motor_no": null, "chassis_no": null,
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
- "other": anything else, or a picture that is not a document.

Rules:
- One photo can show MORE THAN ONE document (an LTO official receipt and the certificate of registration are often photographed together on one sheet, one above the other): list each one separately. Documents can be rotated or at an angle: still read them.
- Fill a detail only if you can read it with confidence. NEVER guess or invent. Otherwise null.
- "plate": ONLY a vehicle plate number, letters then digits like "NBR 9511" or "ABC 1234" (it is not the file number, CR number, OR number or conduction sticker). null if you cannot see a plate. "motor_no" is the engine or motor number. "chassis_no" is the chassis or VIN.
- "document_number": the number that identifies THIS document (the CR number, the OR number, the ID number, the note number). null if none is readable.
- "owner_name": the registered owner on a certificate of registration or official receipt. "holder_name": the name of the person on an ID. "seller_name" and "buyer_name": the parties on a deed of sale. "secretary_name": who signs a secretary's certificate as the corporate secretary. "representative_name": the person the certificate or resolution authorises to sign or sell for the company. "id_type": for example "Driver's license" or "UMID".
- Copy names as printed (any order, any capitals). Do not complete or correct them.
- "confidence" is how sure you are about the TYPE: 0.9 or more when the title is clearly readable, lower when you are inferring it from the layout.
- If the picture is too blurry, dark, glared or cut off to tell what it is, set "legible" to false and "documents" to [].`;

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

/** The model call, injectable so the parsing can be tested without the network. */
export async function readDocument(
  image: { base64: string; mime: string },
  call: (system: string, user: string, dataUrl: string) => Promise<string> = visionJson,
): Promise<Reading> {
  const dataUrl = `data:${image.mime};base64,${image.base64}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const parsed = Reply.safeParse(parse(await call(readerPrompt(), "Which documents does this picture show?", dataUrl)));
    if (!parsed.success) continue;
    const r = parsed.data;
    return {
      legible: r.legible,
      notes: r.notes,
      detections: mergeRepeats(r.documents.map((d) => ({
        type: d.type, confidence: d.confidence, documentNumber: d.document_number, plate: d.plate, motorNo: d.motor_no, chassisNo: d.chassis_no,
        ownerName: d.owner_name, holderName: d.holder_name, sellerName: d.seller_name, buyerName: d.buyer_name,
        secretaryName: d.secretary_name, representativeName: d.representative_name, idType: d.id_type,
      }))),
    };
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
  if (n.includes("promissory")) detections.push(d("promissory_note"));
  if (n.includes("chattel") || n.includes("rcm")) detections.push(d("chattel_cancellation"));
  if (n.includes("secretary-cert")) detections.push(d("secretary_certificate", { secretaryName: "Ana Reyes", representativeName: "Pedro Santos" }));
  if (n.includes("board")) detections.push(d("board_resolution"));
  if (n.includes("blurry")) return { legible: false, detections: [], notes: null };
  return { legible: true, detections: detections.length ? detections : [{ type: "other", confidence: 0.9 }], notes: null };
}
