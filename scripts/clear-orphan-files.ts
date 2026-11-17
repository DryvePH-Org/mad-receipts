// Removes the recorded files of cars that have no folder in the current Drive (they belong to an earlier Drive and no longer exist). Shows what it would remove; --apply does it.
// The cars, their case, approval and Docs Bible rows are not touched; only the list of photos (and what the bot read of them) goes.
//   npx jiti scripts/clear-orphan-files.ts [--apply]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env: Record<string, string | undefined> = { ...process.env };
for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
(async () => {
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: folders } = await db.from("unit_folders").select("plate_no, folder_id");
  const hasFolder = new Set((folders ?? []).filter((f) => f.folder_id).map((f) => f.plate_no));
  const { data: files } = await db.from("folder_files").select("id, plate_no");
  const orphans = (files ?? []).filter((f) => !hasFolder.has(f.plate_no));
  const plates = [...new Set(orphans.map((o) => o.plate_no))];
  console.log(`${orphans.length} recorded files of ${plates.length} cars that have no folder now: ${plates.join(", ")}`);
  if (process.argv.includes("--apply") && orphans.length) {
    for (let i = 0; i < orphans.length; i += 200) { const { error } = await db.from("folder_files").delete().in("id", orphans.slice(i, i + 200).map((o) => o.id)); if (error) throw error; }
    console.log("Removed.");
  } else console.log("Nothing removed (add --apply).");
})();
