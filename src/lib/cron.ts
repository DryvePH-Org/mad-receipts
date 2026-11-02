import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * True when the request carries CRON_SECRET, as "Authorization: Bearer <secret>"
 * or "x-cron-secret: <secret>". Always false when CRON_SECRET is not set.
 */
export function hasCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
