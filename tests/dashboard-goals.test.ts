import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, goalFor, parseSettings } from "@/lib/deal/settings";

describe("dashboard targets", () => {
  it("default to 60 for buying and for releasing", () => {
    expect(goalFor(DEFAULT_SETTINGS.dashboard, "2026-11", "buy")).toBe(60);
    expect(goalFor(DEFAULT_SETTINGS.dashboard, "2026-11", "sell")).toBe(60);
  });
  it("a month can have its own target, and one kind can keep the default", () => {
    const d = parseSettings({ dashboard: { buyGoal: 60, sellGoal: 60, months: { "2026-12": { buy: 40 } } } }).dashboard;
    expect(goalFor(d, "2026-12", "buy")).toBe(40);
    expect(goalFor(d, "2026-12", "sell")).toBe(60);
    expect(goalFor(d, "2026-11", "buy")).toBe(60);
  });
  it("a change to the usual target moves every month without its own", () => {
    const d = parseSettings({ dashboard: { sellGoal: 45 } }).dashboard;
    expect(goalFor(d, "2027-01", "sell")).toBe(45);
  });
  it("bad values fall back instead of breaking the dashboard", () => {
    expect(parseSettings({ dashboard: { buyGoal: -3, months: { nonsense: { buy: 5 } } } }).dashboard).toMatchObject({ buyGoal: 60, months: {} });
  });
});
