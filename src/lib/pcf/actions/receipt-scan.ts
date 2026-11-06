"use server";

import { getCurrentUser } from "@/lib/pcf/auth";
import { todayInAppTz } from "@/lib/pcf/dates";
import {
  buildScanPrompt,
  parseScan,
  type ScanKind,
  type ScannedReceipt,
} from "@/lib/pcf/receipt-ai";
import { withinLimit } from "@/lib/pcf/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type ScanResult =
  | { ok: true; receipt: ScannedReceipt }
  | { ok: false; error: string };

const MAX_BYTES = 900 * 1024;
const DEFAULT_MODEL = "qwen/qwen3.8-27b";

// Reads a receipt photo with a vision model and returns suggested voucher
// fields. Nothing is saved; the custodian reviews the form before submitting.
export async function scanReceipt(formData: FormData): Promise<ScanResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to scan a receipt." };

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "Photo auto-fill is not set up yet. Fill in the form by hand." };
  }

  // The reading service is paid/limited: cap each person per minute and per day.
  if (
    !(await withinLimit(`scan:minute:${user.id}`, 6, 60)) ||
    !(await withinLimit(`scan:day:${user.id}`, 150, 86400))
  ) {
    return { ok: false, error: "Too many scans right now. Wait a minute and try again." };
  }

  const file = formData.get("image");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return { ok: false, error: "Choose a receipt photo." };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "That photo is too large to scan." };
  }

  const kind: ScanKind = formData.get("kind") === "voucher" ? "voucher" : "receipt";

  const supabase = await createClient();
  const { data: categories, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true);
  if (error || !categories?.length) {
    return { ok: false, error: "Could not load categories." };
  }

  // Recent payees help the model and let us correct misread handwriting.
  const { data: recent } = await supabase
    .from("vouchers")
    .select("payee")
    .order("created_at", { ascending: false })
    .limit(300);
  const knownPayees = [...new Set((recent ?? []).map((row) => row.payee))].slice(0, 40);

  const dataUrl = `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;

  const request = () =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_VISION_MODEL || process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildScanPrompt(
                  categories.map((category) => category.name),
                  todayInAppTz(),
                  kind,
                  knownPayees,
                ),
              },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });

  let response: Response;
  try {
    response = await request();
    // The free tier allows only a few scans a minute; wait briefly and retry once.
    if (response.status === 429) {
      const wait = Number(response.headers.get("retry-after"));
      const seconds = Number.isFinite(wait) && wait > 0 ? Math.min(wait, 8) : 4;
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      response = await request();
    }
  } catch {
    return { ok: false, error: "The scan took too long. Try again or fill in the form by hand." };
  }

  if (response.status === 429) {
    return { ok: false, error: "Too many scans right now. Wait a minute and try again." };
  }
  if (!response.ok) {
    return { ok: false, error: "The scan failed. Fill in the form by hand." };
  }

  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const receipt = parseScan(body.choices?.[0]?.message?.content ?? "", categories, knownPayees);
  if (!receipt) {
    return { ok: false, error: "Could not read that receipt. Try a clearer, flatter photo." };
  }
  return { ok: true, receipt };
}
