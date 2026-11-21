// Removes the receipts that were still "waiting for approval" when the approval step was taken away (the owner said they are samples and tests).
// A deal that has only waiting receipts is deleted whole (like an Admin's Delete transaction, through the database function of migration 44); a deal
// that also has saved receipts only loses its waiting ones. The proof photos in storage go with them. Nothing in Drive is involved: waiting receipts
// never got a copy there. Run it AFTER migration 44 is applied.
//   npx jiti scripts/remove-pending-samples.ts            dry run: only lists what would go
//   npx jiti scripts/remove-pending-samples.ts --apply
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const { data: pending, error } = await db.from("receipts").select("id, deal_id, receipt_no, amount, submitted_at").eq("status", "pending").order("submitted_at");
  if (error) throw error;
  if (!pending?.length) { console.log("No receipt is waiting for approval. Nothing to do."); return; }
  const dealIds = [...new Set(pending.map((r) => r.deal_id as string))];
  const { data: deals } = await db.from("deals").select("id, deal_no, buyer_name").in("id", dealIds);
  const { data: all } = await db.from("receipts").select("id, deal_id, status").in("deal_id", dealIds);
  const wholeDeals: string[] = [], onlyReceipts: string[] = [];
  for (const d of deals ?? []) {
    const mine = (all ?? []).filter((r) => r.deal_id === d.id);
    const waiting = mine.filter((r) => r.status === "pending");
    const rest = mine.length - waiting.length;
    console.log(`${d.deal_no} · ${d.buyer_name}: ${waiting.length} waiting receipt(s) (${waiting.map((w) => pending.find((p) => p.id === w.id)?.receipt_no).join(", ")})${rest ? ` and ${rest} other receipt(s) that stay` : " → the whole deal goes"}`);
    if (rest === 0) wholeDeals.push(d.id as string); else onlyReceipts.push(...waiting.map((w) => w.id as string));
  }
  console.log(`\n${wholeDeals.length} deal(s) deleted whole, ${onlyReceipts.length} receipt(s) removed from deals that stay.`);
  if (!apply) { console.log("\nThis was a dry run. Add --apply to do it."); return; }

  const { data: admin } = await db.from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
  if (!admin) throw new Error("There is no Admin account to act as.");
  const paths: string[] = [];
  for (const id of wholeDeals) {
    const { data, error: e } = await db.rpc("delete_deal", { p_actor: admin.id, p_deal_id: id });
    if (e) throw new Error(`delete_deal failed (is migration 44 applied?): ${e.message}`);
    paths.push(...((data as { storage_paths: string[] }).storage_paths ?? []));
  }
  if (onlyReceipts.length) {
    const { data: att } = await db.from("attachments").select("storage_path").in("receipt_id", onlyReceipts);
    paths.push(...(att ?? []).map((a) => a.storage_path as string));
    await db.from("sync_jobs").delete().in("receipt_id", onlyReceipts);
    const r = await db.from("receipts").delete().in("id", onlyReceipts);
    if (r.error) throw r.error;
  }
  if (paths.length) { const r = await db.storage.from("payment-proofs").remove(paths); if (r.error) console.log(`(some proof photos could not be removed: ${r.error.message})`); }
  console.log(`\nDone. ${wholeDeals.length} deal(s), ${onlyReceipts.length} receipt(s) and ${paths.length} proof photo(s) removed.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
