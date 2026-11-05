import { describe, expect, it } from "vitest";
import { createAppsScriptDocsBridge } from "@/lib/docs/bridge";
import { defaultDocsDeps, loadCar, readPending, refreshFolders, scanFolder } from "@/lib/docs/service";
import { CASE_LABELS } from "@/lib/docs/types";

// Fills the app's own tables from the REAL Drive folders with the REAL reader: it lists every car folder, then reads the photos of a few cars
// that have documents, so their checklists are right from the start. It WRITES to the Supabase in .env.local (folder rows and readings only;
// nothing in Drive changes). Run: SEED_DOCS=yes SEED_COUNT=5 npx vitest run --config vitest.live.config.mts tests/live/seed-docs.live.test.ts
describe.skipIf(process.env.SEED_DOCS !== "yes")("seed the car documents", () => {
  it("lists every folder and reads a few cars", async () => {
    const deps = defaultDocsDeps();
    const bridge = createAppsScriptDocsBridge();
    const listed = await refreshFolders(deps);
    console.info(`SEED folders=${listed.folders} skipped=${listed.skipped} duplicates=${listed.duplicates}`);

    const want = Number(process.env.SEED_COUNT) || 5;
    const picked: { plate: string; name: string; files: number }[] = [];
    for (const root of ["sold", "available"] as const) {
      for (const f of await bridge.listFolders(root)) {
        if (picked.length >= want) break;
        const { files } = await bridge.listFiles(f.id);
        const plate = (/\(([^()]+)\)\s*$/.exec(f.name)?.[1] ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (files.length >= 3 && plate && !picked.some((p) => p.plate === plate)) picked.push({ plate, name: f.name, files: files.length });
      }
    }
    console.info(`SEED picked ${picked.map((p) => `${p.name} [${p.files}]`).join(" | ")}`);

    for (const p of picked) {
      await scanFolder(p.plate, deps);
      for (let round = 0; round < 12; round++) {
        const r = await readPending(p.plate, 3, deps, { retryFailed: round === 0 });
        if (r.waitSeconds) await new Promise((res) => setTimeout(res, r.waitSeconds! * 1000));
        else if (r.remaining === 0) break;
      }
      const car = await loadCar(p.plate, deps);
      console.info(`CAR ${p.name}: case=${CASE_LABELS[car!.caseType]} status="${car!.status.label}" missing=[${car!.checklist.missing.map((m) => m.label).join("; ")}] files=${car!.files.length} flagged=${car!.analysis.files.filter((f) => f.flags.length).length}`);
    }
    expect(picked.length).toBeGreaterThan(0);
  }, 1_800_000);
});
