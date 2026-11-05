/**
 * Cleans a speech-to-text result before anyone reads it. The speech model reports how sure it was about
 * each segment, and it is known to "hear" words in silence or noise ("Thank you for watching"). Segments
 * that are probably not real speech, or that it was not confident about, are left out and returned
 * separately so staff can see what was ignored.
 */

export interface SpeechSegment {
  text: string;
  avg_logprob?: number;
  no_speech_prob?: number;
  compression_ratio?: number;
}

const HALLUCINATIONS =
  /(thank(s| you)( so much)? for (watching|listening)|please (like and )?subscribe|subtitles? by|captions? by|amara\.org|transcribed by|www\.|\.com\b|see you (in the )?next)/i;

export const MIN_LOGPROB = -1.0;
export const MAX_NO_SPEECH = 0.6;
export const MAX_COMPRESSION = 2.4;

export function cleanSegments(segments: SpeechSegment[]): { text: string; ignored: string[] } {
  const kept: string[] = [];
  const ignored: string[] = [];
  for (const segment of segments) {
    const text = segment.text.trim();
    if (!text) continue;
    const unsure =
      (segment.avg_logprob ?? 0) < MIN_LOGPROB ||
      (segment.no_speech_prob ?? 0) > MAX_NO_SPEECH ||
      (segment.compression_ratio ?? 0) > MAX_COMPRESSION ||
      HALLUCINATIONS.test(text);
    (unsure ? ignored : kept).push(text);
  }
  return { text: kept.join(" ").replace(/\s+/g, " ").trim(), ignored };
}
