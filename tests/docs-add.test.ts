import { describe, expect, it } from "vitest";
import { createMockDocsBridge } from "@/lib/docs/bridge";
import { ensureCarFolder, folderNameFor, previewCarFolder, type DocsDeps } from "@/lib/docs/service";

describe("the folder name for a plate", () => {
  it("is year, make and type, then the plate in brackets, like the team's folders", () => {
    expect(folderNameFor("NBU4875", { year: "17", makeType: "TOYOTA WIGO 1.0 E MT" })).toBe("17 Toyota Wigo 1.0 E MT (NBU4875)");
    expect(folderNameFor("NOW8682", { year: "2025", makeType: "2025 BYD SEAL 5 DYNAMIC" })).toBe("25 BYD Seal 5 Dynamic (NOW8682)");
  });
  it("is just the plate when the inventory does not know it", () => {
    expect(folderNameFor("ABC1234", null)).toBe("(ABC1234)");
    expect(folderNameFor("ABC1234", { makeType: "Honda City" })).toBe("Honda City (ABC1234)");
  });
});

/** A tiny stand-in for the database: the unit_folders and folder_files tables the add flow touches. */
function fakeAdmin() {
  const folders = new Map<string, Record<string, unknown>>();
  const from = (table: string) => {
    let key = "";
    const q: Record<string, unknown> = {
      select: () => q, eq: (_c: string, v: string) => { key = v; return q; },
      maybeSingle: async () => ({ data: table === "unit_folders" ? folders.get(key) ?? null : null }),
      upsert: async (row: Record<string, unknown>) => { folders.set(row.plate_no as string, { ...folders.get(row.plate_no as string), ...row }); return { error: null }; },
      then: (resolve: (v: unknown) => void) => resolve({ data: [], count: 0, error: null }),
    };
    return q;
  };
  return { admin: { from } as unknown as DocsDeps["admin"], folders };
}
const deps = () => ({ ...fakeAdmin(), bridge: createMockDocsBridge(), read: async () => ({ legible: true, rotation: 0 as const, detections: [], notes: null }) });

describe("adding documents by plate", () => {
  const unit = async () => ({ year: "21", makeType: "TOYOTA VIOS" });
  it("makes the folder in Available with the inventory's year and car, once", async () => {
    const d = deps();
    const a = await ensureCarFolder("zzt 8001", d, unit);
    expect(a).toMatchObject({ plate: "ZZT8001", folderName: "21 Toyota Vios (ZZT8001)", created: true, location: "available", inInventory: true });
    const again = await ensureCarFolder("ZZT-8001", d, unit);
    expect(again).toMatchObject({ created: false, folderName: "21 Toyota Vios (ZZT8001)" });
    expect((await d.bridge.listFolders("available")).filter((f) => f.name.includes("ZZT8001"))).toHaveLength(1);
  });
  it("uses the folder Drive already has for the plate", async () => {
    const d = deps();
    const r = await ensureCarFolder("ZZT-7001", d, unit);
    expect(r).toMatchObject({ created: false, folderName: "23 Toyota Vios (ZZT-7001)" });
  });
  it("refuses several folders for one plate, and a short plate", async () => {
    const d = deps();
    await expect(ensureCarFolder("ZZT7002", d, unit)).rejects.toThrow(/More than one folder/);
    await expect(ensureCarFolder("AB1", d, unit)).rejects.toThrow(/whole plate/);
  });
  it("says what would happen without changing anything", async () => {
    const d = deps();
    expect(await previewCarFolder("ZZT8002", d, unit)).toMatchObject({ state: "new", folderName: "21 Toyota Vios (ZZT8002)", inInventory: true });
    expect((await d.bridge.listFolders("available")).some((f) => f.name.includes("ZZT8002"))).toBe(false);
    expect(await previewCarFolder("ZZT7001", d, unit)).toMatchObject({ state: "existing", location: "available" });
    expect(await previewCarFolder("ZZT7002", d, unit)).toMatchObject({ state: "several" });
    expect(await previewCarFolder("AB", d, unit)).toMatchObject({ state: "invalid" });
  });
  it("still works when the inventory cannot be reached", async () => {
    const d = deps();
    const r = await ensureCarFolder("ZZT8003", d, async () => { throw new Error("sheet down"); });
    expect(r).toMatchObject({ folderName: "(ZZT8003)", inInventory: false });
  });
});
