// Test data for the HOSTED Supabase project while it holds no real data.
//   node scripts/hosted-test-data.mjs seed <credentials-file>   create marked test users, salespeople and deals
//   node scripts/hosted-test-data.mjs clean                     remove everything marked
// Everything it creates is marked: plates "ZZT…", salespeople "ZZT …", users "zzt-…@example.test".
// It never touches anything else. It refuses to run if the project already holds real receipts.
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*?)(\s+#.*)?$/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

export async function clean() {
  const deals = must(await admin.from("deals").select("id").like("plate_no", "ZZT%"), "deals");
  const dealIds = deals.map((d) => d.id);
  if (dealIds.length) {
    const receiptIds = must(await admin.from("receipts").select("id").in("deal_id", dealIds), "receipts").map((r) => r.id);
    if (receiptIds.length) {
      await admin.from("sync_jobs").delete().in("receipt_id", receiptIds);
      await admin.from("audit_logs").delete().in("entity_id", receiptIds);
    }
    await admin.from("audit_logs").delete().in("entity_id", dealIds);
    await admin.from("deal_salespeople").delete().in("deal_id", dealIds);
    await admin.from("receipts").delete().in("deal_id", dealIds);
    await admin.from("deals").delete().in("id", dealIds);
  }
  await admin.from("receipt_drafts").delete().like("photo_path", "%zzt/%");
  for (const folder of ["drafts/zzt", "receipts/zzt"]) {
    const { data: files } = await admin.storage.from("receipt-photos").list(folder, { limit: 500 });
    if (files?.length) await admin.storage.from("receipt-photos").remove(files.map((f) => `${folder}/${f.name}`));
  }
  const spIds = must(await admin.from("salespeople").select("id").like("name", "ZZT %"), "salespeople").map((p) => p.id);
  if (spIds.length) {
    await admin.from("audit_logs").delete().in("entity_id", spIds);
    await admin.from("salespeople").delete().in("id", spIds);
  }
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const user of users?.users ?? []) {
    if (!/^zzt-.*@example\.test$/.test(user.email ?? "")) continue;
    await admin.from("audit_logs").delete().eq("actor_id", user.id);
    await admin.auth.admin.deleteUser(user.id);
  }
}

async function seed(credentialsFile) {
  const { count } = await admin.from("receipts").select("id", { count: "exact", head: true }).not("receipt_no", "like", "ZZT%");
  if (count) throw new Error("The project has real receipts. Refusing to seed test data.");
  await clean(); // start from a clean slate

  const password = () => `${randomBytes(12).toString("base64url")}aA1`;
  const credentials = {
    admin: { email: "zzt-admin@example.test", password: password() },
    staff: { email: "zzt-staff@example.test", password: password() },
  };
  const ids = {};
  for (const [role, c] of Object.entries(credentials)) {
    const user = must(
      await admin.auth.admin.createUser({ email: c.email, password: c.password, email_confirm: true, user_metadata: { full_name: `ZZT ${role}` } }),
      "create user",
    );
    ids[role] = user.user.id;
  }
  must(await admin.from("profiles").update({ role: "admin" }).eq("id", ids.admin), "promote admin");

  const people = must(
    await admin.from("salespeople").insert([{ name: "ZZT David", aliases: ["ZZT Dave"], active: true }, { name: "ZZT Ella", aliases: [], active: true }]).select("id, name"),
    "salespeople",
  );
  const sp = Object.fromEntries(people.map((p) => [p.name, p.id]));
  const person = (name, percent) => ({ salesperson_id: sp[name], commission_percent: percent });

  const photo = readFileSync(process.argv[4] ?? "Docs/76950a59-99da-48c6-94e8-faec982faf85.jpeg"); // the sample receipt photo, used for every thumbnail
  async function confirm(no, plate, amount, { people: list, due, reservation } = {}) {
    const draftId = randomUUID();
    must(await admin.from("receipt_drafts").insert({ id: draftId, photo_path: `drafts/zzt/${draftId}.jpg`, status: "ready", created_by: ids.admin }), "draft");
    const result = must(
      await admin.rpc("confirm_receipt", {
        p_actor: ids.admin,
        p_draft_id: draftId,
        p_payload: {
          receipt_no: no, plate_no: plate, amount, agreed_price: "500000", buyer_name: `ZZT Buyer ${plate.slice(-1)}`,
          make_type: "2021 Test Car", color: "Black", marked_reservation: reservation ?? false, receipt_date: "2026-11-02",
          balance_due_date: due ?? null, payment_method: "cash", ...(list ? { salespeople: list } : {}),
        },
      }),
      `confirm ${no}`,
    );
    if (photo.length) {
      const path = `receipts/zzt/${no}.jpg`;
      await admin.storage.from("receipt-photos").upload(path, photo, { contentType: "image/jpeg", upsert: true });
      await admin.from("receipts").update({ photo_path: path }).eq("id", result.receipt_id);
    }
    return result;
  }

  await confirm("ZZT-A1", "ZZT0001", "100000", { people: [person("ZZT David", "3"), person("ZZT Ella", "1.5")], due: "2026-11-01", reservation: true }); // reserved, overdue
  await confirm("ZZT-B1", "ZZT0002", "100000", { people: [person("ZZT David", "2")], reservation: true });
  await confirm("ZZT-B2", "ZZT0002", "400000"); // sold
  const c = await confirm("ZZT-C1", "ZZT0003", "50000", { people: [person("ZZT Ella", "1")], reservation: true });
  must(await admin.rpc("cancel_deal", { p_actor: ids.admin, p_deal_id: c.deal_id, p_reason: "buyer backed out", p_forfeit: true }), "cancel");
  await confirm("ZZT-D1", "ZZT0004", "100000", { people: [person("ZZT Ella", "1")], due: "2026-11-05", reservation: true }); // due soon

  // A receipt that is read and waiting to be reviewed, so the review screen can be looked at.
  const draftId = randomUUID();
  const draftPath = `drafts/zzt/${draftId}.jpg`;
  if (photo.length) await admin.storage.from("receipt-photos").upload(draftPath, photo, { contentType: "image/jpeg" });
  const fields = Object.fromEntries(
    ["receipt_no","receipt_date","buyer_name","buyer_address","buyer_contact","amount_words","amount","paper_payment_type","make_type","plate_no","motor_no","chassis_no","color","agreed_price","less_payment","balance","payment_method","check_no","bank_branch","balance_words","balance_amount","balance_due_date"].map((k) => [k, null]),
  );
  Object.assign(fields, { receipt_no: "ZZT-R1", receipt_date: "2026-11-03", buyer_name: "ZZT Review Buyer", amount: 50000, amount_words: "Fifty Thousand Only", paper_payment_type: "earnest", make_type: "2021 Test Car", plate_no: "ZZT0099", color: "Black", agreed_price: 500000, payment_method: "cash", balance_due_date: "2026-11-10" });
  must(await admin.from("receipt_drafts").insert({ id: draftId, photo_path: draftPath, status: "ready", created_by: ids.admin, extraction: { fields } }), "review draft");
  credentials.draftId = draftId;

  writeFileSync(credentialsFile, JSON.stringify(credentials));
}

const [command, file] = process.argv.slice(2);
if (command === "seed" && file) await seed(file).then(() => console.log("seeded; credentials written to the given file"));
else if (command === "clean") await clean().then(() => console.log("cleaned"));
else console.log("usage: node scripts/hosted-test-data.mjs seed <credentials-file> [photo.jpg; default: the Docs sample] | clean");
