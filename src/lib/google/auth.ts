import "server-only";
import { google } from "googleapis";

export const GOOGLE_SCOPES = {
  sheets: "https://www.googleapis.com/auth/spreadsheets",
  drive: "https://www.googleapis.com/auth/drive",
} as const;

/** Service-account auth for Google APIs. Env: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY. */
export function googleAuth(scopes: string[]) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) throw new Error("Google service account is not configured");
  // Env files usually store the key on one line with literal "\n".
  return new google.auth.JWT({ email, key: key.replace(/\\n/g, "\n"), scopes });
}
