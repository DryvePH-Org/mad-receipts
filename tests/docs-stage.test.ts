import { describe, expect, it } from "vitest";
import { allowed, deriveStage, type StageInput } from "@/lib/docs/stage";

const base: StageInput = { linked: true, location: "available", filesTotal: 6, pending: 0, failed: 0, scanning: false, flaggedFiles: 0, missingBefore: 0, missingSold: 3, hasDeal: false, approved: false, handoffAt: null, returnedAt: null, receiver: "Jepthee Ramos" };
const at = (over: Partial<StageInput>) => deriveStage({ ...base, ...over });

describe("where a car is in the workflow", () => {
  it("walks through the steps in order", () => {
    expect(at({ linked: false }).current).toBe("link");
    expect(at({ filesTotal: 0 }).current).toBe("photos");
    expect(at({ pending: 2 }).current).toBe("scan");
    expect(at({ scanning: true, pending: 0 }).current).toBe("scan");
    expect(at({ failed: 1 }).current).toBe("scan");
    expect(at({ flaggedFiles: 2 }).current).toBe("review");
    expect(at({ missingBefore: 1 }).current).toBe("review");
    expect(at({}).current).toBe("approve");
    expect(at({ approved: true }).current).toBe("sold_docs");
    expect(at({ approved: true, missingSold: 0 }).current).toBe("move");
    expect(at({ location: "sold", approved: true, missingSold: 0 }).current).toBe("handoff");
    expect(at({ location: "sold", handoffAt: "2026-11-14T01:00:00Z" }).current).toBe("handoff");
    expect(at({ location: "sold", handoffAt: "2026-11-10T01:00:00Z", returnedAt: "2026-11-14T01:00:00Z" }).current).toBe("done");
  });
  it("marks earlier steps done and later ones to do", () => {
    const s = at({ flaggedFiles: 2 }).steps;
    expect(s.map((x) => `${x.key}:${x.state}`)).toEqual(["photos:done", "scan:done", "review:current", "approve:todo", "sold_docs:todo", "move:todo", "handoff:todo", "done:todo"]);
    const sold = at({ location: "sold", approved: true, missingSold: 0 }).steps;
    expect(sold.filter((x) => x.state === "done").map((x) => x.key)).toEqual(["photos", "scan", "review", "approve", "sold_docs", "move"]);
    expect(sold.find((x) => x.state === "current")?.key).toBe("handoff");
  });
  it("tells the staff what to do, in the receiver's name", () => {
    expect(at({ pending: 3 }).next.title).toMatch(/Scan the 3 waiting photos/);
    expect(at({ scanning: true }).next.title).toMatch(/scanning/);
    expect(at({ location: "sold" }).next.title).toBe("Hand the papers to Jepthee Ramos");
    expect(at({ location: "sold", handoffAt: "2026-11-10T01:00:00Z" }).next.title).toBe("With Jepthee Ramos");
  });
});

describe("what may be pressed", () => {
  it("scanning needs something waiting and no scan running", () => {
    expect(at({ pending: 2 }).rules.scan.allowed).toBe(true);
    expect(at({ failed: 1 }).rules.scan.allowed).toBe(true);
    expect(at({ pending: 2, scanning: true }).rules.scan).toMatchObject({ allowed: false, reason: expect.stringMatching(/already scanning/) });
    expect(at({}).rules.scan).toMatchObject({ allowed: false, reason: expect.stringMatching(/Every photo/) });
  });
  it("approval waits for the scan, and only flags and missing papers (which ask to confirm) are allowed through", () => {
    expect(at({ scanning: true }).rules.approve.allowed).toBe(false);
    expect(at({ pending: 1 }).rules.approve.reason).toMatch(/still to be scanned/);
    expect(at({ failed: 2 }).rules.approve.reason).toMatch(/could not be read/);
    expect(at({ filesTotal: 0 }).rules.approve.reason).toMatch(/Add the car's documents/);
    expect(at({ flaggedFiles: 3, missingBefore: 2 }).rules.approve.allowed).toBe(true);
    expect(at({ approved: true }).rules.approve.allowed).toBe(false);
  });
  it("sending to the sheet needs approval", () => {
    expect(at({}).rules.sendSheet).toMatchObject({ allowed: false, reason: expect.stringMatching(/Approve/) });
    expect(at({ approved: true }).rules.sendSheet.allowed).toBe(true);
  });
  it("moving to Sold needs approval and the sold papers; only an Admin may go past that", () => {
    const early = at({}).rules.moveToSold;
    expect(early).toMatchObject({ allowed: false, adminOverride: true });
    expect(allowed(early, false)).toBe(false);
    expect(allowed(early, true)).toBe(true);
    expect(at({ approved: true }).rules.moveToSold.reason).toMatch(/3 sold papers not uploaded/);
    expect(at({ approved: true, missingSold: 0 }).rules.moveToSold.allowed).toBe(true);
    expect(at({ location: "sold", approved: true, missingSold: 0 }).rules.moveToSold.allowed).toBe(false);
    expect(allowed(at({ location: "sold" }).rules.moveToSold, true)).toBe(false); // an override never moves it twice
  });
  it("handoff only after the move, and the return only while it is out", () => {
    expect(at({}).rules.handoff.reason).toMatch(/Move the folder to Sold/);
    expect(at({ location: "sold" }).rules.handoff.allowed).toBe(true);
    expect(at({ location: "sold", handoffAt: "2026-11-10T01:00:00Z" }).rules.handoff.allowed).toBe(false);
    expect(at({ location: "sold" }).rules.markReturned.allowed).toBe(false);
    expect(at({ location: "sold", handoffAt: "2026-11-10T01:00:00Z" }).rules.markReturned.allowed).toBe(true);
    expect(at({ location: "sold", handoffAt: "2026-11-10T01:00:00Z", returnedAt: "2026-11-12T01:00:00Z" }).rules.markReturned.reason).toMatch(/already back/);
  });
});
