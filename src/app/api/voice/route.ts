import { getSettings } from "@/lib/data";
import { GroqError } from "@/lib/voice/groq";
import { readVoiceNote, VoiceError } from "@/lib/voice";
import { createClient } from "@/lib/supabase/server";

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // about two minutes of phone audio
const MAX_TEXT_CHARS = 2000;
const MAX_PER_HOUR = 30;
const AUDIO_TYPES = /^audio\/(webm|mp4|m4a|x-m4a|aac|ogg|wav|x-wav|mpeg|mp3)$/;

const fail = (error: string, status: number) => Response.json({ error }, { status });
const recent = new Map<string, number[]>(); // per user, this server process only: a guard against loops, not a quota

/** A voice note (audio) or a typed note (text) → the receipt fields it mentions, checked against the words. Only the status is logged, never what was said. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("Not logged in", 401);

  const form = await request.formData().catch(() => null);
  if (!form) return fail("Invalid request", 400);
  const audio = form.get("audio");
  const typed = String(form.get("text") ?? "").trim();
  const hasAudio = audio instanceof File && audio.size > 0;
  if (!hasAudio && !typed) return fail("There is nothing to read. Record a note or type it.", 400);
  const mime = hasAudio ? audio.type.split(";")[0].toLowerCase() : "";
  if (hasAudio && !AUDIO_TYPES.test(mime)) return fail("That recording format isn't supported. Try again or type the details.", 415);
  if (hasAudio && audio.size > MAX_AUDIO_BYTES) return fail("That recording is too long. Keep it under a minute or two.", 413);
  if (!hasAudio && typed.length > MAX_TEXT_CHARS) return fail("That note is too long.", 413);

  const now = Date.now(), hits = (recent.get(user.id) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.length >= MAX_PER_HOUR) return fail("Too many voice notes in the last hour. Wait a bit, or type the details.", 429);
  recent.set(user.id, [...hits, now]);

  const settings = await getSettings();
  try {
    const proposal = await readVoiceNote(
      hasAudio ? { audio: { bytes: new Uint8Array(await audio.arrayBuffer()), mime } } : { text: typed },
      { institutions: settings.institutions, wallets: settings.wallets, banks: settings.banks, colors: settings.colors.common.map(([c]) => c) },
    );
    console.info("[voice] status=ready");
    return Response.json({ proposal });
  } catch (err) {
    console.info("[voice] status=failed");
    if (err instanceof VoiceError || err instanceof GroqError) return fail(err.message, err instanceof GroqError ? 503 : 422);
    return fail("Couldn't process the voice note right now. Try again in a moment, or type the details.", 502);
  }
}
