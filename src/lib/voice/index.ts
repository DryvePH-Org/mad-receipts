import "server-only";
import { transcribe } from "./groq";
import { interpretTranscript, VoiceError, type VoiceVocabulary } from "./interpret";
import { cleanSegments } from "./speech";
import type { VoiceProposal } from "./schema";

export { VoiceError };
export type { VoiceVocabulary };

const MAX_TRANSCRIPT_CHARS = 4000;

/** The hint Whisper gets: the words it is likely to hear, so brands, banks and wallets are spelled right. */
export const whisperHint = (v: VoiceVocabulary) =>
  `Manila Auto Display, benta ng sasakyan, English at Tagalog. "Buyer po si Maria Santos, Vios plate N K F 4771, price 720 thousand, down payment 150K, BDO financing, processing fee 7 percent, nag-GCash ng 50 thousand." Words: ${[...v.institutions.slice(0, 8), ...v.wallets.slice(0, 5), "down payment", "trade-in", "earnest", "balance", "chassis", "motor"].join(", ")}.`;

/** Speech to text. Segments the model was not sure about (or that are probably noise) are dropped and reported. */
export async function transcribeVoice(bytes: Uint8Array, mimeType: string, vocab: VoiceVocabulary): Promise<{ text: string; ignored: string[] }> {
  const heard = await transcribe(bytes, mimeType, whisperHint(vocab));
  const { text, ignored } = heard.segments.length ? cleanSegments(heard.segments) : { text: heard.text.trim(), ignored: [] };
  if (!text) {
    throw new VoiceError(ignored.length ? "I couldn't hear that clearly enough to trust it. Try again, closer to the phone, or type the details." : "I couldn't hear anything in that recording. Try again, closer to the phone.");
  }
  return { text: text.slice(0, MAX_TRANSCRIPT_CHARS), ignored };
}

export async function readVoiceNote(input: { audio?: { bytes: Uint8Array; mime: string }; text?: string }, vocab: VoiceVocabulary): Promise<VoiceProposal> {
  const heard = input.audio ? await transcribeVoice(input.audio.bytes, input.audio.mime, vocab) : { text: (input.text ?? "").trim(), ignored: [] as string[] };
  return interpretTranscript(heard.text, vocab, input.audio ? "voice" : "typed", heard.ignored);
}
