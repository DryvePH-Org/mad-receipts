import { describe, expect, it } from "vitest";
import { stageFor, stepBack, stepsOf } from "@/lib/transfers/steps";

const none = { handedOffAt: null, backAt: null, releasedOn: null, deliveredOn: null };

describe("the steps of a transfer", () => {
  it("starts with the originals going to the liaison", () => {
    const r = stepsOf(none);
    expect(r.next).toBe("out");
    expect(r.steps.map((s) => [s.key, s.done, s.current])).toEqual([["out", false, true], ["back", false, false], ["released", false, false], ["delivered", false, false]]);
  });
  it("moves one step at a time", () => {
    expect(stepsOf({ ...none, handedOffAt: "2026-11-01T00:00:00Z" }).next).toBe("back");
    expect(stepsOf({ ...none, handedOffAt: "2026-11-01T00:00:00Z", backAt: "2026-11-08T00:00:00Z" }).next).toBe("released");
    expect(stepsOf({ handedOffAt: "x", backAt: "y", releasedOn: "2026-11-09", deliveredOn: null }).next).toBe("delivered");
    expect(stepsOf({ handedOffAt: "x", backAt: "y", releasedOn: "2026-11-09", deliveredOn: "2026-11-10" }).next).toBeNull();
  });
  it("counts the earlier steps as done when a later one is (a client who collects the papers himself)", () => {
    const r = stepsOf({ ...none, releasedOn: "2026-11-09" });
    expect(r.steps.map((s) => s.done)).toEqual([true, true, true, false]);
    expect(r.next).toBe("delivered");
  });
  it("tells the stage for the dates", () => {
    expect(stageFor(none)).toBe("in_process");
    expect(stageFor({ ...none, handedOffAt: "x" })).toBe("in_process");
    expect(stageFor({ ...none, handedOffAt: "x", backAt: "y" })).toBe("transferred");
    expect(stageFor({ ...none, backAt: "y", releasedOn: "2026-11-09" })).toBe("released");
    expect(stageFor({ ...none, releasedOn: "2026-11-09", deliveredOn: "2026-11-10" })).toBe("delivered");
  });
  it("goes back one step for an Admin", () => {
    const all = { handedOffAt: "a", backAt: "b", releasedOn: "2026-11-09", deliveredOn: "2026-11-10" };
    expect(stepBack(all)).toEqual({ ...all, deliveredOn: null });
    expect(stepBack({ ...all, deliveredOn: null })).toEqual({ ...all, deliveredOn: null, releasedOn: null });
    expect(stepBack({ handedOffAt: "a", backAt: "b", releasedOn: null, deliveredOn: null })).toEqual({ handedOffAt: "a", backAt: null, releasedOn: null, deliveredOn: null });
    expect(stepBack({ handedOffAt: "a", backAt: null, releasedOn: null, deliveredOn: null }).handedOffAt).toBeNull();
  });
});
