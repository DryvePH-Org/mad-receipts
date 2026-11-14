import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

export const credentials = {
  sales: { email: "zzt-e2e-sales@example.test", password: `Zz1-${"e2e-sales-pass"}`, role: "sales" },
  approver: { email: "zzt-e2e-approver@example.test", password: `Zz1-${"e2e-approver-pass"}`, role: "approver" },
  admin: { email: "zzt-e2e-admin@example.test", password: `Zz1-${"e2e-admin-pass"}`, role: "admin" },
  docs: { email: "zzt-e2e-docs@example.test", password: `Zz1-${"e2e-docs-pass"}`, role: "documentation" },
} as const;

export const RECEIPT_PREFIX = "ZZT-E2E";
export const PROOF = resolve(process.cwd(), "e2e/fixtures/sample-receipt.jpg");

function env() {
  const out: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*?)(\s+#.*)?$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export function cronSecret() {
  return env().CRON_SECRET ?? "";
}

export function adminClient() {
  const e = env();
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Removes everything the browser tests created. Safe to run any number of times. */
export async function cleanup() {
  const admin = adminClient();
  const { data: receipts } = await admin.from("receipts").select("id, deal_id").like("receipt_no", `${RECEIPT_PREFIX}%`);
  const receiptIds = (receipts ?? []).map((r) => r.id);
  const dealIds = [...new Set((receipts ?? []).map((r) => r.deal_id))];
  if (receiptIds.length) {
    const { data: files } = await admin.from("attachments").select("storage_path").in("receipt_id", receiptIds);
    const paths = (files ?? []).map((f) => f.storage_path);
    if (paths.length) await admin.storage.from("payment-proofs").remove(paths);
    await admin.from("sync_jobs").delete().in("receipt_id", receiptIds);
    await admin.from("audit_logs").delete().in("entity_id", receiptIds);
    await admin.from("receipts").delete().in("id", receiptIds);
  }
  if (dealIds.length) {
    await admin.from("audit_logs").delete().in("entity_id", dealIds);
    await admin.from("deals").delete().in("id", dealIds);
  }
  // what the document workflow keeps per car (approval, details, handoff, sheet sync, transmittal) for the test plates, and the bot jobs they started
  for (const table of ["unit_workflow", "unit_details", "unit_sheet_sync", "transmittals"] as const) await admin.from(table).delete().like("plate_no", "ZZT%");
  await admin.from("grokbot_jobs").delete().like("plate_no", "ZZT%");
  await admin.from("unit_folders").delete().like("plate_no", "ZZT%"); // the car folders the browser tests linked (their files go too)
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const user of list?.users ?? []) {
    if (!user.email?.startsWith("zzt-e2e-")) continue;
    const { data: stray } = await admin.storage.from("payment-proofs").list(user.id, { limit: 500 });
    if (stray?.length) await admin.storage.from("payment-proofs").remove(stray.map((f) => `${user.id}/${f.name}`));
    await admin.from("audit_logs").delete().eq("actor_id", user.id);
    await admin.from("grokbot_jobs").delete().eq("created_by", user.id);
    await admin.from("app_settings").delete().eq("updated_by", user.id); // settings the test Admin saved
    await admin.auth.admin.deleteUser(user.id);
  }
}

export async function userId(email: string): Promise<string> {
  const { data } = await adminClient().auth.admin.listUsers({ perPage: 200 });
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`No test user ${email}`);
  return user.id;
}
