// The spare key is one fact in the car's record. Where the car page's About-the-car checklist answered it and the record is blank, the record gets the
// answer (W/SPAREKEY or W/O SPAREKEY); where both say something, a different yes/no is only reported. Nothing is overwritten.
//   JITI_ALIAS='{"@/":"<project folder>/src/"}' npx jiti scripts/spare-key-sync.ts [--apply]
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { spareKeyState } from "../src/lib/pricelist/import";

const apply = process.argv.includes("--apply");
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
(async () => {
  const { data: units } = await db.from("docs_units_current").select("id, plate_no, spare_key").limit(5000);
  const { data: details } = await db.from("unit_details").select("plate_no, data").limit(5000);
  const unit = new Map((units ?? []).map((u) => [u.plate_no as string, u]));
  let filled = 0; const differ: string[] = [];
  for (const d of details ?? []) {
    const a = (d.data as { spareKey?: string } | null)?.spareKey; const u = unit.get(d.plate_no as string);
    if (!u || (a !== "yes" && a !== "no")) continue;
    if (!String(u.spare_key ?? "").trim()) { filled++; if (apply) await db.from("docs_units").update({ spare_key: a === "yes" ? "W/SPAREKEY" : "W/O SPAREKEY", last_change_source: "about" }).eq("id", u.id as string); }
    else { const s = spareKeyState(u.spare_key as string); if (s !== "unknown" && s !== a) differ.push(`${d.plate_no}: About says ${a}, the record says "${u.spare_key}"`); }
  }
  console.log(`${apply ? "Filled" : "Would fill"} ${filled} blank spare keys in the car records from the About-the-car answers. Disagreements: ${differ.length}${differ.length ? "\n" + differ.join("\n") : ""}`);
})();
