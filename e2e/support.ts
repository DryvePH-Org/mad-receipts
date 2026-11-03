import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

export const credentials = {
  staff: { email: "zzt-e2e-staff@example.test", password: `Zz1-${"e2e-staff-pass"}` },
  admin: { email: "zzt-e2e-admin@example.test", password: `Zz1-${"e2e-admin-pass"}` },
};

export const RECEIPT_PREFIX = "ZZT-E2E";
export const PHOTO = resolve(process.cwd(), "Docs/76950a59-99da-48c6-94e8-faec982faf85.jpeg");

function env() {
  const out: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z_]+)=(.*?)(\s+#.*)?$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export function adminClient() {
  const e = env();
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const setMockGroq = (state: Record<string, unknown>) =>
  fetch("http://127.0.0.1:8766/__set", { method: "POST", body: JSON.stringify(state) });

/** Removes everything the browser tests created. Safe to run any number of times. */
export async function cleanup() {
  const admin = adminClient();
  const { data: receipts } = await admin.from("receipts").select("id, deal_id, photo_path").like("receipt_no", `${RECEIPT_PREFIX}%`);
  const receiptIds = (receipts ?? []).map((r) => r.id);
  const dealIds = [...new Set((receipts ?? []).map((r) => r.deal_id))];
  if (receiptIds.length) {
    await admin.from("sync_jobs").delete().in("receipt_id", receiptIds);
    await admin.from("audit_logs").delete().in("entity_id", receiptIds);
    const paths = (receipts ?? []).map((r) => r.photo_path).filter((p): p is string => !!p);
    if (paths.length) await admin.storage.from("receipt-photos").remove(paths);
  }
  if (dealIds.length) {
    await admin.from("audit_logs").delete().in("entity_id", dealIds);
    await admin.from("deal_salespeople").delete().in("deal_id", dealIds);
    await admin.from("receipts").delete().in("deal_id", dealIds);
    await admin.from("deals").delete().in("id", dealIds);
  }
  const { data: people } = await admin.from("salespeople").select("id").like("name", "ZZT E2E %");
  const personIds = (people ?? []).map((x) => x.id);
  if (personIds.length) {
    await admin.from("audit_logs").delete().in("entity_id", personIds);
    await admin.from("salespeople").delete().in("id", personIds);
  }
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const user of list?.users ?? []) {
    if (!user.email?.startsWith("zzt-e2e-")) continue;
    const { data: drafts } = await admin.from("receipt_drafts").select("id, photo_path").eq("created_by", user.id);
    const draftPaths = (drafts ?? []).map((d) => d.photo_path);
    if (draftPaths.length) await admin.storage.from("receipt-photos").remove(draftPaths);
    await admin.from("receipt_drafts").delete().eq("created_by", user.id);
    await admin.from("audit_logs").delete().eq("actor_id", user.id);
    await admin.auth.admin.deleteUser(user.id);
  }
}
