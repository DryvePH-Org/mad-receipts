import { describe, expect, it } from "vitest";
import { cleanDetails, EMPTY_DETAILS, missingDetails } from "@/lib/docs/details";
import { buildHandoffReminder } from "@/lib/docs/workflow";

describe("the details checklist", () => {
  it("cuts anything unknown down to the fields", () => {
    expect(cleanDetails({ spareKey: "maybe", casaMaintained: "yes", casaWhen: "  March  ", hacker: 1, isEv: "yes" })).toEqual({ ...EMPTY_DETAILS, casaMaintained: "yes", casaWhen: "March" });
    expect(cleanDetails(null)).toEqual(EMPTY_DETAILS);
  });
  it("EV answers only count for an EV", () => {
    expect(cleanDetails({ isEv: false, evCharger: "yes", evCard: "yes" })).toMatchObject({ evCharger: "", evCard: "" });
    expect(cleanDetails({ isEv: true, evCharger: "yes" })).toMatchObject({ isEv: true, evCharger: "yes" });
  });
  it("says what is still blank", () => {
    expect(missingDetails(EMPTY_DETAILS)).toHaveLength(4);
    const full = { ...EMPTY_DETAILS, spareKey: "yes" as const, casaMaintained: "yes" as const, casaWhen: "2026", casaWhere: "Toyota", batteryWhen: "2026", boughtFrom: "Auction" };
    expect(missingDetails(full)).toEqual([]);
    expect(missingDetails({ ...full, casaWhere: "" })).toEqual(["Casa maintenance: when and where"]);
    expect(missingDetails({ ...full, isEv: true })).toEqual(["EV charger: yes or no", "EV charging card: yes or no"]);
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
