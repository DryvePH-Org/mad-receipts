// The checklist the Documentation staff fills in about the car itself (not its papers): keys, maintenance, battery, where it was bought, EV charger.

const text = (max: number) => (v: unknown) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const yn = (v: unknown): "yes" | "no" | "" => (v === "yes" || v === "no" ? v : "");

export interface UnitDetails {
  spareKey: "yes" | "no" | "";
  casaMaintained: "yes" | "no" | "";
  casaWhen: string;
  casaWhere: string;
  batteryWhen: string;
  boughtFrom: string;
  isEv: boolean;
  evCharger: "yes" | "no" | "";
  evCard: "yes" | "no" | "";
  note: string;
}

export const EMPTY_DETAILS: UnitDetails = { spareKey: "", casaMaintained: "", casaWhen: "", casaWhere: "", batteryWhen: "", boughtFrom: "", isEv: false, evCharger: "", evCard: "", note: "" };

/** Anything stored or sent is cut down to the known fields. */
export function cleanDetails(raw: unknown): UnitDetails {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const isEv = r.isEv === true;
  return {
    spareKey: yn(r.spareKey), casaMaintained: yn(r.casaMaintained), casaWhen: text(60)(r.casaWhen), casaWhere: text(100)(r.casaWhere),
    batteryWhen: text(60)(r.batteryWhen), boughtFrom: text(120)(r.boughtFrom), isEv,
    evCharger: isEv ? yn(r.evCharger) : "", evCard: isEv ? yn(r.evCard) : "", note: text(300)(r.note),
  };
}

/** What is still blank. Nothing here blocks approving: the staff can approve with a reason to leave it. */
export function missingDetails(d: UnitDetails): string[] {
  const out: string[] = [];
  if (!d.spareKey) out.push("Spare key: yes or no");
  if (!d.casaMaintained) out.push("Casa maintained: yes or no");
  else if (d.casaMaintained === "yes" && (!d.casaWhen || !d.casaWhere)) out.push("Casa maintenance: when and where");
  if (!d.batteryWhen) out.push("Battery: when it was changed");
  if (!d.boughtFrom) out.push("Where the car was bought");
  if (d.isEv) {
    if (!d.evCharger) out.push("EV charger: yes or no");
    if (!d.evCard) out.push("EV charging card: yes or no");
  }
  return out;
}
