// The checklist the Buying staff fills in about the car itself (not its papers): keys, maintenance, battery, the dealership it was bought from, which owner it is, EV extras.

const text = (max: number) => (v: unknown) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const yn = (v: unknown): "yes" | "no" | "" => (v === "yes" || v === "no" ? v : "");
/** 1 for the first owner, 2 for the second, and so on; blank when nobody has said. */
const ownerNo = (v: unknown): string => { const n = Number(typeof v === "number" ? v : typeof v === "string" ? v.trim() : ""); return Number.isInteger(n) && n >= 1 && n <= 30 ? String(n) : ""; };
const evType = (v: unknown): "ev" | "phev" | "" => (v === "ev" || v === "phev" ? v : "");

export interface UnitDetails {
  spareKey: "yes" | "no" | "";
  casaMaintained: "yes" | "no" | "";
  casaWhen: string;
  casaWhere: string;
  batteryWhen: string;
  /** the dealership the car was bought from */
  boughtFrom: string;
  /** 1 = first owner, 2 = second owner... as a number in text, "" when not answered */
  ownerNo: string;
  /** "ev" (electric) or "phev" (PH EV); "" for a car that is neither */
  evType: "ev" | "phev" | "";
  /** electric or PH EV: kept so the older reports and the price list copy still work */
  isEv: boolean;
  wallCharger: "yes" | "no" | "";
  portableCharger: "yes" | "no" | "";
  keyCard: "yes" | "no" | "";
  chargingCard: "yes" | "no" | "";
  /** the two answers the details held before the four above: still kept, no longer asked */
  evCharger: "yes" | "no" | "";
  evCard: "yes" | "no" | "";
  note: string;
}

export const EMPTY_DETAILS: UnitDetails = { spareKey: "", casaMaintained: "", casaWhen: "", casaWhere: "", batteryWhen: "", boughtFrom: "", ownerNo: "", evType: "", isEv: false, wallCharger: "", portableCharger: "", keyCard: "", chargingCard: "", evCharger: "", evCard: "", note: "" };

/** "1st owner", "2nd owner"... for a number kept in text. */
export function ownerLabel(n: string): string {
  const k = Number(n);
  if (!Number.isInteger(k) || k < 1) return "";
  const words = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];
  if (k <= words.length) return `${words[k - 1]} owner`;
  const last = k % 100 >= 11 && k % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[k % 10] ?? "th";
  return `${k}${last} owner`;
}

/** Anything stored or sent is cut down to the known fields. */
export function cleanDetails(raw: unknown): UnitDetails {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  // a car saved as "electric" before the two kinds existed stays an EV
  const kind = evType(r.evType) || (r.isEv === true ? "ev" : "");
  const isEv = kind !== "";
  return {
    spareKey: yn(r.spareKey), casaMaintained: yn(r.casaMaintained), casaWhen: text(60)(r.casaWhen), casaWhere: text(100)(r.casaWhere),
    batteryWhen: text(60)(r.batteryWhen), boughtFrom: text(120)(r.boughtFrom), ownerNo: ownerNo(r.ownerNo), evType: kind, isEv,
    wallCharger: isEv ? yn(r.wallCharger) : "", portableCharger: isEv ? yn(r.portableCharger) : "", keyCard: isEv ? yn(r.keyCard) : "", chargingCard: isEv ? yn(r.chargingCard) : "",
    evCharger: isEv ? yn(r.evCharger) : "", evCard: isEv ? yn(r.evCard) : "", note: text(300)(r.note),
  };
}

/** What is still blank. Nothing here blocks approving: the staff can approve with a reason to leave it. */
export function missingDetails(d: UnitDetails): string[] {
  const out: string[] = [];
  if (!d.ownerNo) out.push("Which owner: first, second...");
  if (!d.spareKey) out.push("Spare key: yes or no");
  if (!d.casaMaintained) out.push("Casa maintained: yes or no");
  else if (d.casaMaintained === "yes" && (!d.casaWhen || !d.casaWhere)) out.push("Casa maintenance: when and where");
  if (!d.batteryWhen) out.push("Battery: when it was changed");
  if (!d.boughtFrom) out.push("The dealership it was bought from");
  if (d.isEv) {
    if (!d.wallCharger) out.push("Wall charger: yes or no");
    if (!d.portableCharger) out.push("Portable charger: yes or no");
    if (!d.keyCard) out.push("Key card: yes or no");
    if (!d.chargingCard) out.push("Charging card: yes or no");
  }
  return out;
}
