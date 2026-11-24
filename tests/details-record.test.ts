import { describe, expect, it } from "vitest";
import { columnsFromDetails, detailsFromRow, hasAnswers } from "@/lib/docs/details-record";
import { EMPTY_DETAILS } from "@/lib/docs/details";

describe("the About-the-car answers on the car record", () => {
  it("reads a row into the answers, with the spare key from the record's own words", () => {
    const d = detailsFromRow({ owner_no: 2, casa_maintained: "yes", casa_when: "June 2026", casa_where: "Toyota Cebu", battery_when: "2025", bought_from: "ABC Motors", spare_key: "W/SPAREKEY", condition_note: "minor scratch" });
    expect(d).toMatchObject({ ownerNo: "2", casaMaintained: "yes", casaWhen: "June 2026", casaWhere: "Toyota Cebu", boughtFrom: "ABC Motors", spareKey: "yes", note: "minor scratch", isEv: false });
    expect(detailsFromRow({ spare_key: "W/O SPAREKEY" }).spareKey).toBe("no");
    expect(detailsFromRow({ spare_key: null }).spareKey).toBe("");
  });
  it("knows a car with EV extras is an EV, and a plug-in hybrid", () => {
    const d = detailsFromRow({ ev_type: "phev", wall_charger: "yes", key_card: "no" });
    expect(d).toMatchObject({ isEv: true, evType: "phev", wallCharger: "yes", keyCard: "no" });
    expect(detailsFromRow({ wall_charger: "yes" }).wallCharger).toBe(""); // EV answers only count for an EV
  });
  it("gives no answers for a car without a record, and says whether anyone has answered", () => {
    expect(detailsFromRow(null)).toEqual(EMPTY_DETAILS);
    expect(hasAnswers(null)).toBe(false);
    expect(hasAnswers({ spare_key: "W/SPAREKEY" })).toBe(false); // the spare key alone is the record's, not an answer of this checklist
    expect(hasAnswers({ casa_when: "June" })).toBe(true);
  });
  it("turns answers into columns, an empty answer clearing the box", () => {
    expect(columnsFromDetails({ ...EMPTY_DETAILS, ownerNo: "3", casaMaintained: "no", note: "x" })).toEqual({
      owner_no: 3, casa_maintained: "no", casa_when: null, casa_where: null, battery_when: null, bought_from: null, ev_type: null, wall_charger: null, portable_charger: null, key_card: null, charging_card: null, condition_note: "x",
    });
  });
});
