// Replaces the HEIC photos of the cars in Available units by JPEG copies (same name, .jpg), for the time being. Drive is changed through the Apps Script:
// each HEIC is downloaded, converted on this Mac with `sips` (longest side at most 2400 px, quality 85, like the app does for uploads), the JPEG is
// uploaded next to it, and only when the JPEG is in the folder is the HEIC put in the Drive TRASH (recoverable for 30 days).
// Only folders linked in Available units are touched. The app is not written to: opening a car (or "Look for new files") makes the page drop the
// trashed HEIC and add the JPEG, and the scan starts. A manifest of every step is kept in Docs/sheets-private/heic-converted.jsonl.
//   APPS_SCRIPT_URL=<the web app address> npx jiti scripts/heic-to-jpeg.ts                    shows the plan (changes nothing)
//   ... --apply [--plate NBU4875] [--limit 5]                                                 does it (one car, or the first N files, or all)
// Needs the Apps Script with docs.download and docs.trashHeic deployed. Safe to run again: a HEIC whose JPEG is already there is only trashed.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const apply = process.argv.includes("--apply");
const arg = (n: string) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const onlyPlate = arg("--plate")?.toUpperCase().replace(/[^A-Z0-9]/g, "");
const limit = arg("--limit") ? Number(arg("--limit")) : Infinity;
const url = env.APPS_SCRIPT_URL, secret = env.APPS_SCRIPT_SECRET;
if (!url || !secret) { console.error("APPS_SCRIPT_URL and APPS_SCRIPT_SECRET are needed."); process.exit(2); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const MANIFEST = "Docs/sheets-private/heic-converted.jsonl";
mkdirSync("Docs/sheets-private", { recursive: true });

const isHeic = (f: { name: string; mimeType: string }) => /^image\/hei[cf]$/i.test(f.mimeType) || /\.hei[cf]$/i.test(f.name);
interface DriveFile { id: string; name: string; mimeType: string; size: number | null }

async function call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  let last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url!, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret, action, ...params }), redirect: "follow", signal: AbortSignal.timeout(120_000) });
      const r = (await res.json().catch(() => null)) as { ok: boolean; data?: T; message?: string } | null;
      if (r?.ok) return r.data as T;
      last = r?.message ?? "no answer";
      if (/Unknown action|not inside|Only /.test(last)) break; // not worth retrying
    } catch (e) { last = e instanceof Error ? e.message : "failed"; }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error(`${action}: ${last}`);
}
const log = (o: Record<string, unknown>) => appendFileSync(MANIFEST, JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n");
const base = (n: string) => n.replace(/\.[^.]+$/, "");
const sips = (...a: string[]) => execFileSync("sips", a, { encoding: "utf8" });
const dim = (p: string) => { const o = sips("-g", "pixelWidth", "-g", "pixelHeight", p); return Math.max(+/pixelWidth: (\d+)/.exec(o)![1], +/pixelHeight: (\d+)/.exec(o)![1]); };

async function main() {
  const { data: folders } = await db.from("unit_folders").select("plate_no, plate_display, folder_id, location, match_status").eq("match_status", "linked").eq("location", "available");
  const mine = (folders ?? []).filter((f) => f.folder_id && (!onlyPlate || f.plate_no === onlyPlate));
  console.log(`${mine.length} linked folders in Available units${onlyPlate ? ` (only ${onlyPlate})` : ""}. Looking for HEIC photos...`);
  const plan: { plate: string; display: string; folderId: string; heic: DriveFile[]; all: DriveFile[] }[] = [];
  for (const f of mine) {
    const listing = await call<{ files: DriveFile[] }>("docs.listFiles", { folderId: f.folder_id });
    const heic = listing.files.filter((x) => !x.name.includes("/") && isHeic(x)); // photos directly in the car folder
    if (heic.length) plan.push({ plate: f.plate_no, display: f.plate_display, folderId: f.folder_id!, heic, all: listing.files });
  }
  const total = plan.reduce((n, p) => n + p.heic.length, 0), bytes = plan.reduce((n, p) => n + p.heic.reduce((s, h) => s + (h.size ?? 0), 0), 0);
  console.log(`Plan: ${total} HEIC photos in ${plan.length} cars (${(bytes / 1e6).toFixed(0)} MB).`);
  for (const p of plan) console.log(`  ${p.display.padEnd(9)} ${String(p.heic.length).padStart(3)} HEIC of ${p.all.length} files`);
  if (!apply) { console.log("\nNothing was changed. Add --apply to convert (one car first: --plate NBU4875 --limit 1)."); return; }

  const work = mkdtempSync(join(tmpdir(), "heic-"));
  let done = 0, failed = 0;
  try {
    for (const p of plan) {
      const names = new Set(p.all.map((f) => f.name.toLowerCase()));
      const made = new Map<string, string>(); // heic id -> jpeg name
      for (const h of p.heic) {
        if (done >= limit) break;
        const jpegName = `${base(h.name)}.jpg`;
        try {
          if (names.has(jpegName.toLowerCase())) { made.set(h.id, jpegName); console.log(`  ${p.display} ${h.name}: the JPEG is already there`); continue; }
          const got = await call<{ base64: string }>("docs.download", { fileId: h.id });
          const inP = join(work, "in.heic"), outP = join(work, "out.jpg");
          writeFileSync(inP, Buffer.from(got.base64, "base64"));
          const long = dim(inP);
          sips("-s", "format", "jpeg", "-s", "formatOptions", "85", ...(long > 2400 ? ["-Z", "2400"] : []), inP, "--out", outP);
          const size = statSync(outP).size;
          if (size < 20_000 || dim(outP) < 600) throw new Error(`the converted picture looks wrong (${size} bytes)`);
          const up = await call<{ id: string }>("docs.upload", { folderId: p.folderId, name: jpegName, mimeType: "image/jpeg", base64: readFileSync(outP).toString("base64") });
          log({ plate: p.plate, step: "uploaded", heicId: h.id, heicName: h.name, jpegId: up.id, jpegName, jpegBytes: size });
          made.set(h.id, jpegName); names.add(jpegName.toLowerCase()); done++;
          console.log(`  ${p.display} ${h.name} -> ${jpegName} (${(size / 1e6).toFixed(1)} MB)`);
          rmSync(inP, { force: true }); rmSync(outP, { force: true });
        } catch (e) { failed++; console.log(`  ${p.display} ${h.name}: FAILED, left as it is: ${e instanceof Error ? e.message : e}`); log({ plate: p.plate, step: "failed", heicId: h.id, heicName: h.name, error: String(e) }); }
      }
      // only a HEIC whose JPEG is really in the folder now goes to the trash
      const after = await call<{ files: DriveFile[] }>("docs.listFiles", { folderId: p.folderId });
      const have = new Map(after.files.map((f) => [f.name.toLowerCase(), f]));
      for (const h of p.heic) {
        const jn = made.get(h.id); const twin = jn ? have.get(jn.toLowerCase()) : undefined;
        if (!twin || !(twin.size && twin.size > 20_000)) continue;
        try { await call("docs.trashHeic", { fileId: h.id }); log({ plate: p.plate, step: "trashed", heicId: h.id, heicName: h.name, jpegId: twin.id }); }
        catch (e) { failed++; console.log(`  ${p.display} ${h.name}: could not be moved to the trash: ${e instanceof Error ? e.message : e}`); }
      }
      if (done >= limit) break;
    }
  } finally { rmSync(work, { recursive: true, force: true }); }
  console.log(`\nDone: ${done} converted, ${failed} problems. Open a car (or press "Look for new files") to see the page follow Drive. Manifest: ${MANIFEST}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
