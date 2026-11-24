// A read-only look at the Drive folders the app is pointed at (through the Apps Script, as the app itself does): how many car folders are in
// Available and Sold, which have no plate in the name, which plates are twice, which are empty or hold files the scanner cannot read, and how
// the folders compare with the cars of the Docs Bible register. It lists names and counts only; it never opens a file and changes nothing.
//   npx jiti scripts/drive-audit.ts [--files]      (--files also counts the files of every car folder: slower)
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const url = env.APPS_SCRIPT_URL, secret = env.APPS_SCRIPT_SECRET;
if (!url || !secret) { console.error("APPS_SCRIPT_URL and APPS_SCRIPT_SECRET are needed in .env.local"); process.exit(2); }
const withFiles = process.argv.includes("--files");

async function call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(url!, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret, action, ...params }), redirect: "follow", signal: AbortSignal.timeout(60_000) });
  const r = (await res.json().catch(() => null)) as { ok: boolean; data?: T; message?: string } | null;
  if (!r?.ok) throw new Error(r?.message ?? "The Apps Script did not answer correctly");
  return r.data as T;
}
interface Folder { id: string; name: string; url: string; root: string }
interface DriveFile { id: string; name: string; mimeType: string; size: number | null }
const norm = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, "");
const plateOf = (name: string) => { // the same rule as the app's plateOfFolderName
  const b = [...name.matchAll(/\(([^()]+)\)/g)].map((m) => norm(m[1])).filter((p) => /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{5,8}$/.test(p));
  if (b.length) return b[b.length - 1];
  const loose = [...new Set([...name.toUpperCase().matchAll(/\b([A-Z]{3})[ -]?(\d{3,4})\b/g)].map((m) => m[1] + m[2]))];
  return loose.length === 1 ? loose[0] : null;
};

async function main() {
  const [available, sold] = await Promise.all([call<Folder[]>("docs.listFolders", { root: "available" }), call<Folder[]>("docs.listFolders", { root: "sold" })]);
  console.log(`Available units: ${available.length} car folders. Sold units: ${sold.length} car folders.`);
  const all = [...available.map((f) => ({ ...f, where: "available" })), ...sold.map((f) => ({ ...f, where: "sold" }))];
  const noPlate = all.filter((f) => !plateOf(f.name));
  console.log(`\nFolders with no recognisable plate in the name (the app skips them): ${noPlate.length}`);
  for (const f of noPlate.slice(0, 15)) console.log(`  [${f.where}] ${f.name}`);
  const byPlate = new Map<string, typeof all>();
  for (const f of all) { const p = plateOf(f.name); if (p) byPlate.set(p, [...(byPlate.get(p) ?? []), f]); }
  const dupes = [...byPlate].filter(([, l]) => l.length > 1);
  console.log(`\nPlates with more than one folder (the app asks a person to choose): ${dupes.length}`);
  for (const [p, l] of dupes.slice(0, 15)) console.log(`  ${p}: ${l.map((f) => `[${f.where}] ${f.name}`).join("  |  ")}`);

  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: units } = await db.from("docs_units_current").select("plate_no, stock_state");
  const regPlates = new Set((units ?? []).map((u) => u.plate_no as string));
  const noFolder = [...regPlates].filter((p) => !byPlate.has(p));
  const notInRegister = [...byPlate.keys()].filter((p) => !regPlates.has(p));
  console.log(`\nDocs Bible cars: ${regPlates.size}. With a folder: ${regPlates.size - noFolder.length}. Without a folder: ${noFolder.length}.`);
  console.log(`Folders whose plate is not in the Docs Bible: ${notInRegister.length}${notInRegister.length ? ` (e.g. ${notInRegister.slice(0, 12).join(", ")})` : ""}`);
  const soldInAvailable = (units ?? []).filter((u) => u.stock_state === "Sold" && byPlate.get(u.plate_no as string)?.some((f) => f.where === "available")).length;
  const availableInSold = (units ?? []).filter((u) => /^(Onhand|Reserved)$/.test(String(u.stock_state ?? "")) && byPlate.get(u.plate_no as string)?.some((f) => f.where === "sold")).length;
  console.log(`Cars the register calls SOLD whose folder is still in Available units: ${soldInAvailable}. Cars it calls AVAILABLE whose folder is in Sold units: ${availableInSold}.`);

  if (withFiles) {
    const sizes: number[] = []; const odd = new Map<string, number>(); let empty = 0;
    for (const [i, f] of all.entries()) {
      const files = await call<{ files: DriveFile[] }>("docs.listFiles", { folderId: f.id }).then((r) => r.files).catch(() => []);
      sizes.push(files.length); if (!files.length) empty++;
      for (const x of files) if (!/^image\/(jpeg|png|webp|heic|heif)$|^application\/pdf$/.test(x.mimeType)) odd.set(x.mimeType, (odd.get(x.mimeType) ?? 0) + 1);
      if (i % 25 === 24) console.log(`  …${i + 1} of ${all.length} folders counted`);
    }
    sizes.sort((a, b) => a - b);
    console.log(`\nFiles per car folder: empty ${empty}, median ${sizes[Math.floor(sizes.length / 2)] ?? 0}, most ${sizes[sizes.length - 1] ?? 0}, total ${sizes.reduce((n, x) => n + x, 0)}.`);
    console.log(`File types the scanner cannot read: ${odd.size ? [...odd].map(([t, n]) => `${t} (${n})`).join(", ") : "none"}.`);
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
