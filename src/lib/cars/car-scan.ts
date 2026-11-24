import { z } from "zod";
import { visionJson } from "@/lib/voice/groq";
import { grokConfigured, grokVisionJson } from "@/lib/voice/xai";
import { type ScanKey } from "@/lib/cars/scan-keys";
import { checkBody, checkFuel, checkMileage, checkWords, checkYear, formatPlate } from "@/lib/cars/standards";

/** Boxes the staff are told about when the photo did not give them. The others are only filled when the paper has them. */
const EXPECTED: ScanKey[] = ["plate", "make", "model_variant", "year_model", "color"];

const Reply = z.object({
  legible: z.boolean().default(true),
  plate: z.string().nullish(), make_brand: z.string().nullish(), series: z.string().nullish(), year_model: z.union([z.string(), z.number()]).nullish(),
  color: z.string().nullish(), body_type: z.string().nullish(), fuel: z.string().nullish(), odometer: z.union([z.string(), z.number()]).nullish(),
  owner_name: z.string().nullish(), encumbered_to: z.string().nullish(),
});
export type ScanReply = z.infer<typeof Reply>;

export const scanPrompt = () => `You read one photo of a Philippine LTO record of a car: the "MV Inquiry Detail" screen, a Certificate of Registration (CR) or an Official Receipt (OR). Answer ONLY with JSON:
{"legible": boolean, "plate": string|null, "make_brand": string|null, "series": string|null, "year_model": string|null, "color": string|null, "body_type": string|null, "fuel": string|null, "odometer": string|null, "owner_name": string|null, "encumbered_to": string|null}
- "make_brand": the brand only (NISSAN, TOYOTA), from the "Make" / "Make Brand" box.
- "series": the model line as printed in "Series" (for a CR, the "Series" box; if it has none, the model name). Not the brand.
- "year_model": the four-digit "Year Model" (not the registration year).
- "color", "body_type" (for example SUV, SEDAN, VAN), "fuel" (GAS, DIESEL, ELECTRIC...): as printed.
- "odometer": the number as printed, only if the screen shows one above zero. null otherwise.
- "owner_name": the registered owner as printed (CR only). null on an MV Inquiry screen.
- "encumbered_to": the bank or financing company the car is encumbered to, as printed. null if none.
- Copy as printed. Never guess: use null for anything you cannot read clearly. If the picture is too blurry, dark or cut off, set "legible" to false and everything else to null.`;

const parse = (raw: string): unknown => { try { return JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")); } catch { return undefined; } };

export interface CarScan { values: Partial<Record<ScanKey, string>>; unread: ScanKey[] }

const caps = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

/** A reading turned into the values for the form's boxes, each one through the same standard as typing it (a value that does not fit is left out). */
export function scanToForm(r: ScanReply): CarScan {
  const values: Partial<Record<ScanKey, string>> = {};
  const plate = formatPlate(r.plate);
  if (/^[A-Z]{3} \d{3,4}$/.test(plate)) values.plate = plate;
  const put = (k: ScanKey, raw: unknown, ok: boolean, text: string) => { if (ok && String(raw ?? "").trim()) values[k] = text; };
  put("make", r.make_brand, checkWords("brand", 40)(r.make_brand ?? "").ok, caps(r.make_brand ?? ""));
  put("model_variant", r.series, checkWords("make", 80)(r.series ?? "").ok, caps(r.series ?? ""));
  const year = String(r.year_model ?? "").replace(/\D/g, "");
  put("year_model", year, checkYear(year).ok, year);
  put("color", r.color, checkWords("color", 40)(r.color ?? "").ok, caps(r.color ?? ""));
  const body = checkBody(r.body_type ?? "");
  if (body.ok && body.value) values.body_type = body.value;
  const fuel = checkFuel(r.fuel ?? "");
  if (fuel.ok && fuel.value) values.fuel = fuel.value;
  const km = String(r.odometer ?? "").replace(/[^\d]/g, "");
  if (Number(km) >= 1000 && checkMileage(km).ok) values.mileage = km;
  if (r.owner_name?.trim()) values.reg_owner_name = caps(r.owner_name);
  const bank = r.encumbered_to?.trim();
  if (bank && !/^(none|n\/a|-+)$/i.test(bank)) values.encumbrance = caps(bank);
  return { values, unread: EXPECTED.filter((k) => !values[k]) };
}

export class CarScanError extends Error {}

/** Reads one photo and returns what it says about the car. Nothing is saved anywhere: not the photo, not the reading. */
export async function scanCarPhoto(
  image: { base64: string; mime: string },
  call: (system: string, user: string, dataUrl: string) => Promise<string> = (grokConfigured() ? grokVisionJson : visionJson),
): Promise<CarScan> {
  const dataUrl = `data:${image.mime};base64,${image.base64}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const parsed = Reply.safeParse(parse(await call(scanPrompt(), "What does this record say about the car?", dataUrl)));
    if (parsed.success) {
      if (!parsed.data.legible) throw new CarScanError("The photo is too blurry or dark to read. Take it again, straight on and with the whole screen or paper in view.");
      return scanToForm(parsed.data);
    }
  }
  throw new CarScanError("The picture reader gave an answer that could not be understood. Try again.");
}

/** A stand-in for local development and the browser tests (DOCS_FAKE_READER=1): decides from the file name. */
export function fakeScan(filename: string): ScanReply {
  if (/blurry/i.test(filename)) return { legible: false };
  return {
    legible: true, plate: "NBD2426", make_brand: "NISSAN", series: "TERRA 2.5L EL M", year_model: "2019", color: "FIERY RED", body_type: "SUV", fuel: "DIESEL",
    odometer: "0 km", owner_name: null, encumbered_to: "PHILIPPNE BUSINESS BANK",
  };
}
