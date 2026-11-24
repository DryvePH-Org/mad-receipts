import { spareKeyState } from "@/lib/pricelist/import";
import { cleanDetails, EMPTY_DETAILS, type UnitDetails } from "./details";

// The About-the-car answers are columns of the car record (migration 63). This turns a row of the record into the answers the page shows, and the answers
// back into the columns to save. The spare key is the record's own column (spare_key), not a second copy. Pure.

export const DETAIL_COLUMNS = "owner_no, casa_maintained, casa_when, casa_where, battery_when, bought_from, ev_type, wall_charger, portable_charger, key_card, charging_card, condition_note, spare_key";

export type DetailColumns = Partial<Record<"owner_no" | "casa_maintained" | "casa_when" | "casa_where" | "battery_when" | "bought_from" | "ev_type" | "wall_charger" | "portable_charger" | "key_card" | "charging_card" | "condition_note" | "spare_key", string | number | null>>;

/** The answers of a car, from its record. A box nobody answered is empty. */
export function detailsFromRow(r: DetailColumns | null | undefined): UnitDetails {
  if (!r) return EMPTY_DETAILS;
  const s = spareKeyState((r.spare_key as string | null) ?? null);
  return cleanDetails({
    spareKey: s === "unknown" ? "" : s, casaMaintained: r.casa_maintained ?? "", casaWhen: r.casa_when ?? "", casaWhere: r.casa_where ?? "", batteryWhen: r.battery_when ?? "",
    boughtFrom: r.bought_from ?? "", ownerNo: r.owner_no ?? "", evType: r.ev_type ?? "", wallCharger: r.wall_charger ?? "", portableCharger: r.portable_charger ?? "",
    keyCard: r.key_card ?? "", chargingCard: r.charging_card ?? "", note: r.condition_note ?? "",
  });
}

/** Whether anyone has answered anything yet (the page says "not saved yet" until then). */
export const hasAnswers = (r: DetailColumns | null | undefined): boolean =>
  !!r && (["owner_no", "casa_maintained", "casa_when", "casa_where", "battery_when", "bought_from", "ev_type", "wall_charger", "portable_charger", "key_card", "charging_card", "condition_note"] as const).some((k) => r[k] !== null && r[k] !== undefined && r[k] !== "");

const orNull = (v: string) => (v === "" ? null : v);

/** The columns to save for a set of answers (an empty answer clears the box). The spare key is saved separately, as the record's own words. */
export function columnsFromDetails(d: UnitDetails): Record<string, string | number | null> {
  return {
    owner_no: d.ownerNo ? Number(d.ownerNo) : null, casa_maintained: orNull(d.casaMaintained), casa_when: orNull(d.casaWhen), casa_where: orNull(d.casaWhere), battery_when: orNull(d.batteryWhen),
    bought_from: orNull(d.boughtFrom), ev_type: orNull(d.evType), wall_charger: orNull(d.wallCharger), portable_charger: orNull(d.portableCharger), key_card: orNull(d.keyCard),
    charging_card: orNull(d.chargingCard), condition_note: orNull(d.note),
  };
}
