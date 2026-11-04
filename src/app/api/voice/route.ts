import { interpretTranscript, transcribeVoice, VoiceError } from "@/lib/extraction/voice";
import type { VoiceResult } from "@/lib/extraction/voice-schema";
import type { SalespersonRef } from "@/lib/salespeople/names";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // about two minutes of phone audio
const MAX_TEXT_CHARS = 2000;
const MAX_NOTES_PER_HOUR = 20;
const AUDIO_TYPES = /^audio\/(webm|mp4|m4a|x-m4a|aac|ogg|wav|x-wav|mpeg|mp3)$/;

const fail = (error: string, status: number) => Response.json({ error }, { status });

// Never log what was said or typed (names, phone numbers): only draft id and status.
const log = (draftId: string, status: string) => console.info(`[voice] draft=${draftId} status=${status}`);

/** Voice note (audio) or typed note (text) for a draft → receipt fields and salespeople. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Not logged in", 401);

  const form = await request.formData().catch(() => null);
  const draftId = String(form?.get("draftId") ?? "");
  if (!form || !/^[0-9a-f-]{36}$/i.test(draftId)) return fail("Invalid request", 400);

  const audio = form.get("audio");
  const typed = String(form.get("text") ?? "").trim();
  const hasAudio = audio instanceof File && audio.size > 0;
  if (!hasAudio && !typed) return fail("There is nothing to read. Record a note or type it.", 400);
  if (hasAudio && !AUDIO_TYPES.test(audio.type.split(";")[0].toLowerCase())) {
    return fail("That recording format isn't supported. Please try again or type the details.", 415);
  }
  if (hasAudio && audio.size > MAX_AUDIO_BYTES) return fail("That recording is too long. Keep it under a minute or two.", 413);
  if (!hasAudio && typed.length > MAX_TEXT_CHARS) return fail("That note is too long.", 413);

  const admin = createAdminClient();
  const { data: draft } = await admin
    .from("receipt_drafts")
    .select("id, status, created_by")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft || draft.created_by !== user.id) return fail("Draft not found", 404);
  if (draft.status === "consumed") return fail("This receipt was already confirmed.", 409);

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("receipt_drafts")
    .select("id", { count: "exact", head: true })
    .eq("created_by", user.id)
    .gte("voice->>transcribed_at", hourAgo);
  if ((count ?? 0) >= MAX_NOTES_PER_HOUR) {
    return fail("Too many voice notes in the last hour. Please wait a bit, or type the details.", 429);
  }

  const { data: rows } = await admin.from("salespeople").select("id, name, aliases").eq("active", true);
  const people: SalespersonRef[] = rows ?? [];

  let result: VoiceResult;
  try {
    const heard = hasAudio
      ? await transcribeVoice(new Uint8Array(await audio.arrayBuffer()), audio.type.split(";")[0].toLowerCase(), people)
      : { text: typed, ignored: [] };
    result = await interpretTranscript(heard.text, people, hasAudio ? "voice" : "typed", heard.ignored);
  } catch (err) {
    log(draftId, "failed");
    if (err instanceof VoiceError) return fail(err.message, 422);
    return fail("Couldn't process the voice note right now. Try again in a moment, or type the details.", 502);
  }

  const { error } = await admin
    .from("receipt_drafts")
    .update({ voice: result as unknown as Json })
    .eq("id", draftId)
    .neq("status", "consumed");
  if (error) {
    log(draftId, "failed");
    return fail("Couldn't save the voice note. Please try again.", 500);
  }

  log(draftId, "ready");
  return Response.json({ voice: result });
}
