import { after } from "next/server";

import { emailEnabled, sendEmail } from "@/lib/pcf/email";
import type { Role } from "@/lib/pcf/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

import { renderEmail, type EmailContent } from "./layout";

export type Recipient = {
  id: string | null;
  email: string;
  full_name: string;
};

export type NotificationEvent =
  | "voucher.submitted"
  | "voucher.pre_approved"
  | "voucher.returned"
  | "voucher.released"
  | "voucher.approved"
  | "voucher.flagged"
  | "voucher.voided"
  | "replenishment.submitted"
  | "replenishment.approved"
  | "replenishment.rejected"
  | "replenishment.closed"
  | "fund.low_balance"
  | "fund.assignment_changed"
  | "cash_count.variance"
  | "user.welcome"
  | "user.role_changed"
  | "user.access_changed"
  | "digest.daily";

type RecipientOptions = { include?: (string | null | undefined)[]; exclude?: string[] };

const SPACING_MS = 600;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function recipientsByRole(
  roles: Role[],
  options: RecipientOptions = {},
): Promise<Recipient[]> {
  const { data, error } = await createAdminClient().rpc("notification_recipients", {
    p_roles: roles,
    p_include: (options.include ?? []).filter((id): id is string => Boolean(id)),
    p_exclude: options.exclude ?? [],
  });
  if (error) throw error;
  return data.map((row) => ({ id: row.id, email: row.email, full_name: row.full_name ?? row.email }));
}

export async function recipientById(userId: string): Promise<Recipient | null> {
  const admin = createAdminClient();
  const [{ data: authData }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  const email = authData.user?.email;
  if (!email) return null;
  return { id: userId, email, full_name: profile?.full_name ?? email };
}

function dedupe(recipients: Recipient[]) {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = recipient.email.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function notify(options: {
  event: NotificationEvent;
  entityType?: string;
  entityId?: string;
  recipients: Recipient[];
  subject: string;
  content: (recipient: Recipient) => Omit<EmailContent, "greeting">;
}) {
  const admin = createAdminClient();
  // In development set NOTIFY_REDIRECT_TO so test accounts never email anyone.
  const redirectTo = process.env.NOTIFY_REDIRECT_TO;
  const recipients = dedupe(options.recipients);

  for (const [index, recipient] of recipients.entries()) {
    if (index > 0) await wait(SPACING_MS);

    const greeting = `Hi ${recipient.full_name.split(/\s+/)[0] || "there"},`;
    const { html, text } = renderEmail({
      ...options.content(recipient),
      greeting,
    });
    const to = redirectTo ?? recipient.email;
    const subject = redirectTo
      ? `[to: ${recipient.email}] ${options.subject}`
      : options.subject;

    let status: "sent" | "failed" = "sent";
    let error: string | null = null;
    try {
      await sendEmail({ to, subject, html, text });
    } catch (caught) {
      status = "failed";
      error = caught instanceof Error ? caught.message.slice(0, 500) : String(caught);
      // The recipient and the reason are kept in notification_log (Petty cash → Email log), not in server logs.
      console.error("[pcf] notification failed", options.event);
    }

    await admin.from("notification_log").insert({
      event: options.event,
      entity_type: options.entityType ?? null,
      entity_id: options.entityId ?? null,
      recipient_id: recipient.id,
      recipient_email: recipient.email,
      subject: options.subject,
      status,
      error,
    });
  }
}

// Runs after the response is sent, so a slow or failing email never blocks or
// breaks the action that triggered it.
export function queueNotification(label: string, task: () => Promise<void>) {
  if (!emailEnabled()) return;
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      console.error(`notification task failed: ${label}`, error);
    }
  };
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
