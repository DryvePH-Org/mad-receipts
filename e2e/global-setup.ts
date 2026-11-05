import { adminClient, cleanup, credentials } from "./support";

export default async function globalSetup() {
  await cleanup(); // in case an earlier run was interrupted
  const admin = adminClient();
  for (const [name, c] of Object.entries(credentials)) {
    const { data, error } = await admin.auth.admin.createUser({ email: c.email, password: c.password, email_confirm: true, user_metadata: { full_name: `ZZT E2E ${name}` } });
    if (error) throw error;
    if (c.role !== "sales") await admin.from("profiles").update({ role: c.role }).eq("id", data.user.id);
  }
}
