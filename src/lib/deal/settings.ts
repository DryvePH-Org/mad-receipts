import { z } from "zod";

// Everything the Admin can change in Settings. Stored as one JSON document (app_settings); any
// part that is missing or malformed falls back to the default, so an old document never breaks the form.

type Color = [string, string];
const W = "#f5f5f4", PW = "#ece9e2", K = "#18181b", SV = "#c0c4c8", G = "#78716c", R = "#dc2626", B = "#2563eb", BR = "#78350f", GR = "#15803d";

export const DEFAULT_SETTINGS = {
  colors: {
    // The colors cars are most often sold in, named the way the dealers and the makers name them
    common: [["Pearl White", PW], ["Super White", W], ["Jet Black Mica", K], ["Silver Metallic", SV], ["Graphite Gray", G], ["Gunmetal Gray", "#52525b"], ["Red Mica", R], ["Maroon", "#7f1d1d"], ["Blue Metallic", B], ["Navy Blue", "#1e3a8a"], ["Bronze Metallic", BR], ["Champagne Gold", "#d6c7a1"], ["Orange", "#f97316"], ["Green Metallic", GR]] as Color[],
    brands: {
      Toyota: [["Super White II", W], ["Platinum White Pearl Mica", PW], ["Attitude Black Mica", K], ["Silver Metallic", SV], ["Gray Metallic", G], ["Super Red", R], ["Red Mica Metallic", R], ["Grayish Blue Mica Metallic", B], ["Bronze Mica Metallic", BR], ["Alumina Jade Metallic", GR]],
      Mitsubishi: [["Quartz White Pearl", PW], ["White Diamond", PW], ["Jet Black Mica", K], ["Sterling Silver Metallic", SV], ["Cool Silver", SV], ["Titanium Gray", G], ["Red Metallic", R]],
      Honda: [["Platinum White Pearl", PW], ["Crystal Black Pearl", K], ["Modern Steel Metallic", G], ["Lunar Silver Metallic", SV], ["Ignite Red Metallic", R], ["Cosmic Blue Metallic", B]],
      Suzuki: [["Arctic White Pearl", PW], ["Pearl Snow White", PW], ["Prime Cool Black", K], ["Metallic Silky Silver", SV], ["Metallic Magma Gray", G], ["Pearl Radiant Red", R], ["Oxford Blue Pearl Metallic", B], ["Sherwood Brown Pearl Metallic", BR]],
      Nissan: [["Aspen Pearl White", PW], ["Alpine White", W], ["Galaxy Black", K], ["Brilliant Silver", SV], ["Lunar Metallic Gray", G], ["Fiery Red", R], ["Sapphire Blue Metallic", B], ["Earth Brown", BR]],
      Ford: [["Arctic White", W], ["Absolute Black", K], ["Meteor Grey", G], ["Blue Lightning", B], ["Sedona Orange", "#f97316"]],
      Isuzu: [["Splash White", W], ["Silky Pearl White", PW], ["Cosmic Black", K], ["Titanium Silver", SV], ["Eiger Gray", G], ["Garnet Red", R], ["Norwegian Blue", B], ["Outback Brown", BR]],
      Hyundai: [["Polar White", W], ["Phantom Black", K], ["Sleek Silver", SV], ["Star Dust", G], ["Fiery Red", R]],
    } as Record<string, Color[]>,
  },
  wallets: ["GCash", "Maya", "GoTyme", "ShopeePay", "Bank transfer", "Remittance"],
  banks: ["BDO", "BPI", "Metrobank", "Security Bank", "UnionBank", "RCBC", "PNB", "China Bank", "Maybank"],
  institutions: ["BDO", "BPI", "Metrobank", "Security Bank", "UnionBank", "RCBC", "PNB", "China Bank", "Maybank", "GDFI", "Toyota Financial Services", "In-house financing"],
  notes: [
    { text: "Unit is sold AS IS, WHERE IS.", on: true },
    { text: "Earnest money and partial payments are NON-REFUNDABLE.", on: true },
    { text: "The balance must be settled on or before the date stated above.", on: true },
    { text: "Official receipt and documents are released only after full payment.", on: false },
  ],
  phrases: ["Unit to be released after full payment.", "OR/CR to follow.", "Subject to bank approval.", "Buyer inspected the unit and accepts its condition.", "Includes one spare key."],
  duePhrases: ["Upon release of OR/CR", "Upon loan approval", "Upon delivery of the unit"],
  years: ["1", "2", "3", "4", "5"],
  feeStd: "7",
  minDownPct: "20",
  copyNames: ["Customer's copy", "Office copy", "Accounting copy", "File copy", "Extra copy"],
  company: {
    name: "Manila Auto Display",
    tagline: "Acknowledgement of Payment",
    address: "Doing business under the name and style of MAD Parking and Management Solutions Inc., #29 A San Rafael cor. San Clemente St., Brgy. Kapitolyo, Pasig City",
  },
  required: { contact: true, address: true, motor: true, chassis: true, color: true, proofs: true },
  sections: { trade: true, lieu: true, remarks: true },
  reminders: { before7: true, before3: true, dueDay: true, overdueDaily: true, lenderDays: 14, approvalHours: 24, telegram: true, inApp: true },
};

const color = z.tuple([z.string().min(1), z.string().regex(/^#[0-9a-fA-F]{6}$/)]);
const list = (fallback: string[]) => z.array(z.string().trim().min(1)).catch(fallback);
const flag = (fallback: boolean) => z.boolean().catch(fallback);
const percent = (fallback: string) => z.string().regex(/^\d{1,3}(\.\d{1,2})?$/).catch(fallback);
const D = DEFAULT_SETTINGS;

export const settingsSchema = z.object({
  colors: z.object({
    common: z.array(color).catch(D.colors.common),
    brands: z.record(z.string().min(1), z.array(color)).catch(D.colors.brands),
  }).catch(D.colors),
  wallets: list(D.wallets),
  banks: list(D.banks),
  institutions: list(D.institutions),
  notes: z.array(z.object({ text: z.string().trim().min(1), on: z.boolean() })).catch(D.notes),
  phrases: list(D.phrases),
  duePhrases: list(D.duePhrases),
  years: z.array(z.string().regex(/^\d{1,2}(\.\d)?$/)).catch(D.years),
  feeStd: percent(D.feeStd),
  minDownPct: percent(D.minDownPct),
  copyNames: list(D.copyNames),
  company: z.object({ name: z.string().trim().min(1), tagline: z.string().trim().min(1), address: z.string() }).catch(D.company),
  required: z.object({ contact: flag(true), address: flag(true), motor: flag(true), chassis: flag(true), color: flag(true), proofs: flag(true) }).catch(D.required),
  sections: z.object({ trade: flag(true), lieu: flag(true), remarks: flag(true) }).catch(D.sections),
  reminders: z.object({
    before7: flag(true), before3: flag(true), dueDay: flag(true), overdueDaily: flag(true),
    lenderDays: z.number().int().min(1).max(365).catch(14), approvalHours: z.number().int().min(1).max(720).catch(24),
    telegram: flag(true), inApp: flag(true),
  }).catch(D.reminders),
});

export type AppSettings = z.infer<typeof settingsSchema>;

/** The stored document (or nothing) turned into complete, safe settings. */
export function parseSettings(raw: unknown): AppSettings {
  return settingsSchema.parse(raw && typeof raw === "object" ? raw : {});
}
