const DEFAULT_FROM = "MAD <onboarding@resend.dev>";
const MAX_RETRIES = 2;

/** PCF emails are switched off until RESEND_API_KEY is set; nothing is sent or logged while off. */
export function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY);
}

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export class EmailError extends Error {}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Resend allows about 2 requests per second, so a 429 is retried after the
// delay it asks for.
export async function sendEmail(email: OutgoingEmail, attempt = 0): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailError("Missing RESEND_API_KEY");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  if (response.status === 429 && attempt < MAX_RETRIES) {
    const retryAfter = Number(response.headers.get("retry-after"));
    await wait((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1) * 1000);
    return sendEmail(email, attempt + 1);
  }

  if (!response.ok) {
    throw new EmailError(`Resend responded ${response.status}: ${await response.text()}`);
  }
}
