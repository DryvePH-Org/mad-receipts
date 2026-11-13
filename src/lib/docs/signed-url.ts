import { createHmac, timingSafeEqual } from "node:crypto";

// A short-lived link to one document photo, so the grokbot can open it without logging in. The link carries the photo's id, an expiry
// and a signature made with the callback secret; it cannot be changed to open another photo, and it stops working after a few minutes.

export const SCAN_LINK_MINUTES = 20;
const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("base64url").slice(0, 32);

export function signFileToken(fileId: string, secret: string, now = Date.now(), minutes = SCAN_LINK_MINUTES): string {
  const body = b64(`${fileId}.${now + minutes * 60_000}`);
  return `${body}.${sign(secret, body)}`;
}

/** The photo's id when the link is genuine and not expired, otherwise null. */
export function verifyFileToken(token: string, secret: string, now = Date.now()): string | null {
  const [body, sig, extra] = String(token).split(".");
  if (!body || !sig || extra !== undefined || !secret) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(secret, body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [id, exp] = Buffer.from(body, "base64url").toString().split(".");
  return id && Number(exp) > now ? id : null;
}
