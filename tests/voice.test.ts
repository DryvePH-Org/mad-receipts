import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePercent, VoiceExtraction } from "@/lib/extraction/voice-schema";
import { interpretTranscript, transcribeVoice, VoiceError, voicePrompt } from "@/lib/extraction/voice";
import type { SalespersonRef } from "@/lib/salespeople/names";

const groq = vi.hoisted(() => ({ callGroqJson: vi.fn(), callGroqTranscription: vi.fn() }));
vi.mock("@/lib/extraction/groq", () => groq);

const people: SalespersonRef[] = [
  { id: "david", name: "David Santos", aliases: ["Dave"] },
  { id: "ella", name: "Ella", aliases: [] },
];

beforeEach(() => {
  groq.callGroqJson.mockReset();
  groq.callGroqTranscription.mockReset();
});

describe("parsePercent", () => {
  it.each([
    [3, 3],
    ["3", 3],
    ["3%", 3],
    [" 2.5 % ", 2.5],
    [0, 0],
    [100, 100],
  ])("%j → %d", (input, expected) => expect(parsePercent(input)).toBe(expected));

  it.each([null, undefined, "", "abc", -1, 101, "3.456", "three", {}])("rejects %j", (input) =>
    expect(parsePercent(input)).toBeNull(),
  );
});

describe("VoiceExtraction", () => {
  it("parses fields and salespeople, with each person's own percent", () => {
    const parsed = VoiceExtraction.parse({
      fields: { receipt_no: "2556", plate_no: "nkf-4771", amount: "50,000" },
      salespeople: [
        { name: "David", commission_percent: 3 },
        { name: " Ella ", commission_percent: "1.5%" },
      ],
    });
    expect(parsed.fields).toMatchObject({ receipt_no: "2556", plate_no: "NKF4771", amount: 50000, buyer_name: null });
    expect(parsed.salespeople).toEqual([
      { name: "David", commission_percent: 3 },
      { name: "Ella", commission_percent: 1.5 },
    ]);
  });

  it("keeps a person whose percent was not said, with null", () => {
    expect(VoiceExtraction.parse({ salespeople: [{ name: "David", commission_percent: null }] }).salespeople).toEqual([
      { name: "David", commission_percent: null },
    ]);
  });

  it("drops nameless or garbage entries instead of failing the note", () => {
    const parsed = VoiceExtraction.parse({
      fields: "nope",
      salespeople: [{ commission_percent: 3 }, "David", null, { name: "" }, { name: "Ella", commission_percent: 500 }],
    });
    expect(parsed.fields.receipt_no).toBeNull();
    expect(parsed.salespeople).toEqual([{ name: "Ella", commission_percent: null }]);
  });

  it("accepts an empty object and rejects non-objects", () => {
    expect(VoiceExtraction.parse({}).salespeople).toEqual([]);
    expect(VoiceExtraction.safeParse("text").success).toBe(false);
    expect(VoiceExtraction.safeParse(null).success).toBe(false);
  });
});

describe("voicePrompt", () => {
  it("lists the known names with their nicknames, and keeps percents out of the fields", () => {
    const prompt = voicePrompt(people);
    expect(prompt).toContain("David Santos (Dave); Ella");
    expect(prompt).toContain("never in \"fields\"");
    expect(voicePrompt([])).toContain("(none yet)");
  });
});

describe("transcribeVoice", () => {
  it("sends the names to the speech model as a hint and returns the text", async () => {
    groq.callGroqTranscription.mockResolvedValue("  Salesman is David, three percent.  ");
    const text = await transcribeVoice(new Uint8Array([1]), "audio/webm", people);
    expect(text).toBe("Salesman is David, three percent.");
    expect(groq.callGroqTranscription.mock.calls[0][2]).toContain("Salespeople: David Santos, Dave, Ella");
  });

  it("explains an empty recording", async () => {
    groq.callGroqTranscription.mockResolvedValue("   ");
    await expect(transcribeVoice(new Uint8Array([1]), "audio/webm", people)).rejects.toThrow(VoiceError);
  });
});

describe("interpretTranscript", () => {
  const model = (obj: unknown) => groq.callGroqJson.mockResolvedValueOnce(JSON.stringify(obj));

  it("matches heard names to the list and keeps each person's percent", async () => {
    model({
      fields: { plate_no: "NKF4771", amount: 50000 },
      salespeople: [
        { name: "Dave", commission_percent: 3 },
        { name: "Elia", commission_percent: 1 },
        { name: "Pedro", commission_percent: 2 },
      ],
    });
    const result = await interpretTranscript("transcript", people, "voice");
    expect(result.source).toBe("voice");
    expect(result.fields).toMatchObject({ plate_no: "NKF4771", amount: 50000 });
    expect(result.salespeople).toEqual([
      { spoken: "Dave", salespersonId: "david", confidence: "exact", commission_percent: 3 },
      { spoken: "Elia", salespersonId: "ella", confidence: "close", commission_percent: 1 },
      { spoken: "Pedro", salespersonId: null, confidence: "none", commission_percent: 2 },
    ]);
    expect(Number.isNaN(Date.parse(result.transcribed_at))).toBe(false);
  });

  it("gives the model the transcript and today's date", async () => {
    model({});
    await interpretTranscript("David three percent", people, "typed");
    const [, user] = groq.callGroqJson.mock.calls[0];
    expect(user).toContain("David three percent");
    expect(user).toMatch(/Today is \d{4}-\d{2}-\d{2} \(Manila time\)/);
  });

  it("retries once when the answer is not JSON, then explains", async () => {
    groq.callGroqJson.mockResolvedValueOnce("not json").mockResolvedValueOnce("```json\n{\"salespeople\":[{\"name\":\"Ella\"}]}\n```");
    const result = await interpretTranscript("x", people, "voice");
    expect(result.salespeople[0]).toMatchObject({ salespersonId: "ella", commission_percent: null });
    expect(groq.callGroqJson).toHaveBeenCalledTimes(2);

    groq.callGroqJson.mockReset();
    groq.callGroqJson.mockResolvedValue("still not json");
    await expect(interpretTranscript("x", people, "voice")).rejects.toThrow(VoiceError);
  });
});
