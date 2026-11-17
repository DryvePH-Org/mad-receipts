import { describe, expect, it } from "vitest";
import { planFolderSync, vanishedLinks } from "../src/lib/docs/service";

const row = (id: string, drive: string) => ({ id, drive_file_id: drive });

describe("what a look at the Drive folder changes", () => {
  it("adds the new files and drops the ones that left the folder: 4 deleted and 5 uploaded is 5, not 9", () => {
    const known = ["a", "b", "c", "d"].map((d, i) => row(`r${i}`, d));
    const plan = planFolderSync(["n1", "n2", "n3", "n4", "n5"], known);
    expect(plan.fresh).toEqual(["n1", "n2", "n3", "n4", "n5"]);
    expect(plan.gone.map((g) => g.drive_file_id)).toEqual(["a", "b", "c", "d"]);
  });
  it("changes nothing when the folder is the same", () => {
    const plan = planFolderSync(["a", "b"], [row("r1", "a"), row("r2", "b")]);
    expect(plan).toEqual({ fresh: [], gone: [] });
  });
  it("empties the list when every file was deleted, and keeps the files that stay", () => {
    expect(planFolderSync([], [row("r1", "a")]).gone).toHaveLength(1);
    const plan = planFolderSync(["a", "x"], [row("r1", "a"), row("r2", "b")]);
    expect(plan.fresh).toEqual(["x"]); expect(plan.gone.map((g) => g.id)).toEqual(["r2"]);
  });
});

describe("car folders that vanished from Drive", () => {
  it("drops the link of a car whose folder is no longer listed, but never when Drive answered with nothing", () => {
    expect(vanishedLinks(["ABC123", "XYZ999"], new Set(["ABC123"]), false)).toEqual(["XYZ999"]);
    expect(vanishedLinks(["ABC123"], new Set(), true)).toEqual([]);
  });
});
