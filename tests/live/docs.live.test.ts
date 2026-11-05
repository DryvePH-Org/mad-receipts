import { describe, expect, it } from "vitest";
import { analyze, checklist, type FileInput } from "@/lib/docs/analyze";
import { createAppsScriptDocsBridge, plateOfFolderName } from "@/lib/docs/bridge";
import { readDocument } from "@/lib/docs/reader";
import { pingAppsScript } from "@/lib/google/apps-script";

// The REAL Drive test folders through the REAL Apps Script, and the REAL picture reader. Read-only
// (nothing is uploaded or moved). Needs the updated Code.gs deployed and DOC_AVAILABLE_ID / DOC_SOLD_ID set.
// Run: npm run test:live   (set LIVE_PLATE to try another car, default WMO752 from the Sold test folder)
const bridge = createAppsScriptDocsBridge();
const PLATE = process.env.LIVE_PLATE || "WMO752";

describe("the real car-documents folders", () => {
  it("the bridge answers and lists the car folders", async () => {
    expect(await pingAppsScript()).toBe("pong");
    const [available, sold] = await Promise.all([bridge.listFolders("available"), bridge.listFolders("sold")]);
    const withPlate = [...available, ...sold].filter((f) => plateOfFolderName(f.name));
    console.info(`DOCS folders available=${available.length} sold=${sold.length} withPlateInName=${withPlate.length} sample=${JSON.stringify(available.slice(0, 2).map((f) => f.name))}`);
    expect(available.length + sold.length).toBeGreaterThan(0);
    expect(withPlate.length).toBeGreaterThan(0);
  });

  it("finds a folder by plate however it is typed", async () => {
    const all = await bridge.findFolder(PLATE);
    expect(all).toHaveLength(1);
    expect(await bridge.findFolder(`${PLATE.slice(0, 3)}-${PLATE.slice(3)}`)).toHaveLength(1);
    expect(await bridge.findFolder("ZZZ0000")).toEqual([]);
  });

  it("reads each photo in the folder and works out what the papers are", async () => {
    const [folder] = await bridge.findFolder(PLATE);
    const listing = await bridge.listFiles(folder.id);
    console.info(`DOCS ${folder.name}: ${listing.files.length} files in ${listing.root}`);
    const inputs: FileInput[] = [];
    for (const f of listing.files.slice(0, 12)) {
      const preview = await bridge.preview(f.id);
      const reading = await readDocument({ base64: preview.base64, mime: preview.mimeType });
      console.info(`READ ${f.name} (${f.mimeType}): legible=${reading.legible} ${reading.detections.map((d) => `${d.type}(${d.confidence})${d.plate ? ` plate=${d.plate}` : ""}${d.ownerName ? ` owner=${d.ownerName}` : ""}${d.holderName ? ` holder=${d.holderName}` : ""}`).join(" + ") || "nothing"}`);
      inputs.push({ id: f.id, filename: f.name, createdAt: f.createdAt, detections: reading.detections, readStatus: reading.legible ? "done" : "unreadable", manualTypes: null });
      await new Promise((r) => setTimeout(r, 6000)); // the free AI plan allows only a few pictures a minute
    }
    const a = analyze(inputs, { plate: PLATE.toUpperCase().replace(/[^A-Z0-9]/g, ""), caseType: null }, { buyerName: null, hasReceipt: true });
    const list = checklist(a.suggestedCase, a.files, { buyerName: null, hasReceipt: true });
    console.info(`CASE ${a.suggestedCase}; missing: ${list.missing.map((m) => m.label).join("; ") || "nothing"}`);
    for (const r of a.files) console.info(`FILE ${inputs.find((i) => i.id === r.id)?.filename}: ${r.types.join(", ") || "-"} ${r.flags.length ? `FLAGS: ${r.flags.join(" | ")}` : ""}`);
    expect(inputs.length).toBeGreaterThan(0);
  }, 600_000);
});
