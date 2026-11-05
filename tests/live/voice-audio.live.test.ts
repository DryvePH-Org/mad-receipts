import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/deal/settings";
import { readVoiceNote } from "@/lib/voice";

// Real speech through the whole path: a computer voice (macOS `say`) → Whisper → gpt-oss → checked fields.
// It is not a Filipino accent, so it proves the pipeline, not how it handles every voice. Run: npm run test:live
const vocab = { institutions: DEFAULT_SETTINGS.institutions, wallets: DEFAULT_SETTINGS.wallets, banks: DEFAULT_SETTINGS.banks, colors: DEFAULT_SETTINGS.colors.common.map(([c]) => c) };

describe("a recording, end to end (real Whisper and model)", () => {
  it("hears the buyer, the car and the money", async () => {
    const dir = mkdtempSync(join(tmpdir(), "voice-"));
    const aiff = join(dir, "note.aiff"), wav = join(dir, "note.wav");
    execFileSync("say", ["-v", "Samantha", "-r", "165", "-o", aiff, "Buyer is Maria Santos. Unit is a 2023 Toyota Vios, plate N K F, four seven seven one, color silver. Price is seven hundred twenty thousand pesos, B D O financing, down payment one hundred fifty thousand. She pays one hundred twenty thousand in cash today."]);
    execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav]);
    const p = await readVoiceNote({ audio: { bytes: new Uint8Array(readFileSync(wav)), mime: "audio/wav" } }, vocab);
    console.info("HEARD:", p.transcript, "| unsure:", p.unsure, "| ignored:", p.unclear);
    const f = p.fields;
    expect([f.buyer_name, f.price, f.sale, f.institution, f.down_payment, f.cash_today]).toEqual(["Maria Santos", 720000, "financing", "BDO", 150000, 120000]);
    expect(f.units[0]).toMatchObject({ plate: "NKF4771" });
    expect(f.units[0].color?.toLowerCase()).toBe("silver");
  });
});
