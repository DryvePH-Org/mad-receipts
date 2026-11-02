import { z } from "zod";
import { extractReceipt, ExtractionError, toReceiptFields } from "@/lib/extraction";
import { visionModel } from "@/lib/extraction/groq";
import { validateExtraction } from "@/lib/rules/validate";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const MAX_EXTRACTIONS_PER_HOUR = 20;

const Body = z.object({ draftId: z.uuid() });

// Never log extracted personal data: only draft id and status.
const log = (draftId: string, status: string) => console.info(`[extract] draft=${draftId} status=${status}`);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { draftId } = body.data;

  const admin = createAdminClient();
  const { data: draft } = await admin
    .from("receipt_drafts")
    .select("id, photo_path, status, created_by")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft || draft.created_by !== user.id) {
    return Response.json({ error: "Draft not found" }, { status: 404 });
  }
  // Each draft is read once. Re-calls (double taps, retries) just report the state.
  if (draft.status !== "extracting") {
    return Response.json({ status: draft.status });
  }

  // Simple per-user rate limit: each draft costs one extraction.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("receipt_drafts")
    .select("id", { count: "exact", head: true })
    .eq("created_by", user.id)
    .gte("created_at", hourAgo)
    .neq("status", "extracting");
  if ((count ?? 0) >= MAX_EXTRACTIONS_PER_HOUR) {
    return fail(admin, draftId, "Too many photos in the last hour. Please wait a bit and try again.", 429);
  }

  const photo = await admin.storage.from("receipt-photos").download(draft.photo_path);
  if (photo.error) return fail(admin, draftId, "Could not open the photo. Please upload it again.", 500);

  try {
    const fields = await extractReceipt(new Uint8Array(await photo.data.arrayBuffer()), "image/jpeg");
    const issues = validateExtraction(toReceiptFields(fields));
    const extraction = { fields, issues, model: visionModel(), extracted_at: new Date().toISOString() };

    const { error } = await admin
      .from("receipt_drafts")
      .update({ status: "ready", extraction: extraction as unknown as Json, error: null })
      .eq("id", draftId)
      .eq("status", "extracting");
    if (error) throw error;

    log(draftId, "ready");
    return Response.json({ status: "ready" });
  } catch (err) {
    const message =
      err instanceof ExtractionError
        ? `${err.message} You can retake the photo or type the details by hand.`
        : "Could not read the receipt right now. You can retake the photo or type the details by hand.";
    return fail(admin, draftId, message, 502);
  }
}

async function fail(
  admin: ReturnType<typeof createAdminClient>,
  draftId: string,
  message: string,
  httpStatus: number,
) {
  await admin
    .from("receipt_drafts")
    .update({ status: "failed", error: message })
    .eq("id", draftId)
    .eq("status", "extracting");
  log(draftId, `failed:${httpStatus}`);
  return Response.json({ status: "failed", error: message }, { status: httpStatus });
}
