// Read-only: car folder links in the database that point at a folder which is not in Available or Sold units any more (left over from an earlier Drive).
//   APPS_SCRIPT_URL=<current web app> npx jiti scripts/stale-links-check.ts
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
async function call<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(env.APPS_SCRIPT_URL!, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: env.APPS_SCRIPT_SECRET, action, ...params }), redirect: "follow" });
  const r = (await res.json()) as { ok: boolean; data?: T; message?: string };
  if (!r.ok) throw new Error(r.message); return r.data as T;
}
async function main() {
  const live = new Set<string>();
  for (const root of ["available", "sold"]) for (const f of await call<{ id: string }[]>("docs.listFolders", { root })) live.add(f.id);
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: rows } = await db.from("unit_folders").select("plate_no, folder_id, match_status, location");
  const linked = (rows ?? []).filter((r) => r.folder_id);
  const stale = linked.filter((r) => !live.has(r.folder_id as string));
  console.log(`Drive folders: ${live.size}. Links in the database: ${linked.length}. Links to a folder that is not in Drive any more: ${stale.length}`);
  console.log(stale.slice(0, 40).map((r) => `${r.plate_no} (${r.match_status}, ${r.location})`).join(", "));
  const { count } = await db.from("folder_files").select("*", { count: "exact", head: true });
  console.log(`Files recorded: ${count}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
