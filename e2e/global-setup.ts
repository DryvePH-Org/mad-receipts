import { adminClient, cleanup, credentials } from "./support";

export default async function globalSetup() {
  await cleanup(); // in case an earlier run was interrupted
  const admin = adminClient();
  // Someone to credit when a deal is sold.
  const { error: personError } = await admin.from("salespeople").insert({ name: "ZZT E2E Pat" });
  if (personError) throw personError;
  for (const [role, c] of Object.entries(credentials)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: c.email,
      password: c.password,
      email_confirm: true,
      user_metadata: { full_name: `ZZT E2E ${role}` },
    });
    if (error) throw error;
    if (role === "admin") await admin.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
  }
}
