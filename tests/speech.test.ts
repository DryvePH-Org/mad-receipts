import { describe, expect, it } from "vitest";
import { cleanSegments } from "@/lib/extraction/speech";

describe("cleanSegments", () => {
  it("keeps confident speech", () => {
    const r = cleanSegments([{ text: " Plate NKF 4771.", avg_logprob: -0.2, no_speech_prob: 0.01, compression_ratio: 1.2 }]);
    expect(r).toEqual({ text: "Plate NKF 4771.", ignored: [] });
  });

  it("ignores segments the model was unsure about, and reports them", () => {
    const r = cleanSegments([
      { text: "Receipt number 2556.", avg_logprob: -0.3, no_speech_prob: 0.02 },
      { text: "fifty tousand mumble", avg_logprob: -1.4, no_speech_prob: 0.1 },
    ]);
    expect(r.text).toBe("Receipt number 2556.");
    expect(r.ignored).toEqual(["fifty tousand mumble"]);
  });

  it("ignores words heard in silence or noise", () => {
    expect(cleanSegments([{ text: "ok", avg_logprob: -0.5, no_speech_prob: 0.9 }]).text).toBe("");
    expect(cleanSegments([{ text: "Thank you for watching!", avg_logprob: -0.3, no_speech_prob: 0.1 }]).text).toBe("");
    expect(cleanSegments([{ text: "la la la la la la", avg_logprob: -0.3, no_speech_prob: 0.1, compression_ratio: 3.1 }]).text).toBe("");
  });
});
