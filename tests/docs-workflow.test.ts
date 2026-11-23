import { describe, expect, it } from "vitest";
import { cleanDetails, EMPTY_DETAILS, missingDetails, ownerLabel } from "@/lib/docs/details";
import { buildHandoffReminder } from "@/lib/docs/workflow";

describe("the details checklist", () => {
  it("cuts anything unknown down to the fields", () => {
    expect(cleanDetails({ spareKey: "maybe", casaMaintained: "yes", casaWhen: "  March  ", hacker: 1, isEv: "yes" })).toEqual({ ...EMPTY_DETAILS, casaMaintained: "yes", casaWhen: "March" });
    expect(cleanDetails(null)).toEqual(EMPTY_DETAILS);
  });
  it("EV answers only count for an EV or a PH EV; an older electric car stays an EV", () => {
    expect(cleanDetails({ evType: "", wallCharger: "yes", keyCard: "yes" })).toMatchObject({ wallCharger: "", keyCard: "", isEv: false });
    expect(cleanDetails({ evType: "phev", wallCharger: "yes", portableCharger: "no", keyCard: "yes", chargingCard: "no" })).toMatchObject({ isEv: true, evType: "phev", wallCharger: "yes", portableCharger: "no", keyCard: "yes", chargingCard: "no" });
    expect(cleanDetails({ isEv: true, evCharger: "yes" })).toMatchObject({ isEv: true, evType: "ev", evCharger: "yes" });
  });
  it("the owner number is a whole number from 1, said in words", () => {
    expect(cleanDetails({ ownerNo: "2" }).ownerNo).toBe("2");
    expect(cleanDetails({ ownerNo: 3 }).ownerNo).toBe("3");
    for (const bad of ["0", "-1", "1.5", "abc", "31", ""]) expect(cleanDetails({ ownerNo: bad }).ownerNo).toBe("");
    expect([1, 2, 3, 11, 12, 13, 21, 22].map((n) => ownerLabel(String(n)))).toEqual(["First owner", "Second owner", "Third owner", "11th owner", "12th owner", "13th owner", "21st owner", "22nd owner"]);
    expect(ownerLabel("")).toBe("");
  });
  it("says what is still blank", () => {
    expect(missingDetails(EMPTY_DETAILS)).toHaveLength(5);
    const full = { ...EMPTY_DETAILS, spareKey: "yes" as const, casaMaintained: "yes" as const, casaWhen: "2026", casaWhere: "Toyota", batteryWhen: "2026", boughtFrom: "Auction", ownerNo: "1" };
    expect(missingDetails(full)).toEqual([]);
    expect(missingDetails({ ...full, casaWhere: "" })).toEqual(["Casa maintenance: when and where"]);
    expect(missingDetails({ ...full, isEv: true, evType: "ev" })).toEqual(["Wall charger: yes or no", "Portable charger: yes or no", "Key card: yes or no", "Charging card: yes or no"]);
  });
});

describe("the handoff reminder", () => {
  it("lists each car with the days it has been out", () => {
    const m = buildHandoffReminder([{ plate: "AAX3622", name: "14 Toyota Vios (AAX-3622)", since: "2026-11-01T02:00:00Z" }], "2026-11-13", "Sir Jep")!;
    expect(m).toContain("Sir Jep");
    expect(m).toContain("14 Toyota Vios (AAX-3622)");
    expect(m).toContain("12 days");
  });
  it("sends nothing when no car is out", () => {
    expect(buildHandoffReminder([], "2026-11-13", "Sir Jep")).toBeNull();
  });
});
