import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planScanResults, readerMode, scheduleScan } from "@/lib/docs/bot-scan";
import { readingFromReply } from "@/lib/docs/reader";
import { signFileToken, verifyFileToken } from "@/lib/docs/signed-url";

describe("the link the grokbot opens a photo with", () => {
  const id = "0b7e2a3c-1111-4222-8333-444455556666";
  it("opens only the photo it was made for, for a few minutes", () => {
    const now = Date.UTC(2026, 10, 13, 10, 0, 0);
    const t = signFileToken(id, "secret", now);
    expect(verifyFileToken(t, "secret", now + 60_000)).toBe(id);
    expect(verifyFileToken(t, "secret", now + 21 * 60_000)).toBeNull(); // expired
    expect(verifyFileToken(t, "other", now + 1000)).toBeNull(); // wrong secret
    expect(verifyFileToken(t, "", now + 1000)).toBeNull();
  });
  it("cannot be changed to open another photo or live longer", () => {
    const now = Date.UTC(2026, 10, 13, 10, 0, 0);
    const [body, sig] = signFileToken(id, "secret", now).split(".");
    const forged = Buffer.from(`11111111-1111-4111-8111-111111111111.${now + 99_999_999}`).toString("base64url");
    expect(verifyFileToken(`${forged}.${sig}`, "secret", now + 1000)).toBeNull();
    expect(verifyFileToken(`${body}.${sig}x`, "secret", now + 1000)).toBeNull();
    expect(verifyFileToken("garbage", "secret", now)).toBeNull();
    expect(verifyFileToken(`${body}.${sig}.extra`, "secret", now + 1000)).toBeNull();
  });
});

describe("what the bot answers for one photo", () => {
  it("is read like a picture reader's answer: rotation, copy, defects, and plates must look like plates", () => {
    const r = readingFromReply({ file_id: "f1", legible: true, rotation: 90, documents: [{ type: "certificate_of_registration", confidence: 0.95, copy: "original", defects: ["torn"], plate: "BYD472QA", owner_name: "JUAN DELA CRUZ" }], notes: null });
    expect(r).toMatchObject({ legible: true, rotation: 90 });
    expect(r!.detections[0]).toMatchObject({ type: "certificate_of_registration", copy: "original", defects: ["torn"], plate: null, ownerName: "JUAN DELA CRUZ" });
  });
  it("is refused when it is not an object", () => {
    expect(readingFromReply(undefined)).toBeNull();
    expect(readingFromReply("text")).not.toBeUndefined();
  });
});

describe("starting a scan", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  it("groups photos added one by one into ONE scan, shortly after the last", async () => {
    const run = vi.fn(async () => undefined);
    scheduleScan("ZZT 9001", 25_000, run);
    await vi.advanceTimersByTimeAsync(10_000);
    scheduleScan("ZZT-9001", 25_000, run); // another photo: the wait starts again
    await vi.advanceTimersByTimeAsync(24_000);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("ZZT9001");
  });
  it("is the bot only when DOCS_READER says grokbot", () => {
    vi.stubEnv("DOCS_READER", "");
    expect(readerMode()).toBe("api");
    vi.stubEnv("DOCS_READER", "GrokBot");
    expect(readerMode()).toBe("grokbot");
  });
});

describe("matching the bot's answer to the photos that were sent", () => {
  const item = (id: string, type = "official_receipt") => ({ file_id: id, legible: true, rotation: 0, documents: [{ type, confidence: 0.9 }] });
  it("reads each photo by its id, whatever the order, and reports the ones the bot did not return", () => {
    const { readings, missing } = planScanResults(["a", "b", "c"], [item("c", "government_id"), item("a")]);
    expect([...readings.keys()].sort()).toEqual(["a", "c"]);
    expect(readings.get("c")!.detections[0].type).toBe("government_id");
    expect(missing).toEqual(["b"]);
  });
  it("treats a broken or empty answer as everything missing", () => {
    expect(planScanResults(["a"], undefined).missing).toEqual(["a"]);
    expect(planScanResults(["a"], [null, "x", { file_id: "zzz", documents: [] }]).missing).toEqual(["a"]);
  });
  it("a photo the bot could not open is read as unreadable, not as missing", () => {
    const r = planScanResults(["a"], [{ file_id: "a", legible: false, rotation: 0, documents: [], notes: "could not open the picture" }]);
    expect(r.readings.get("a")).toMatchObject({ legible: false, detections: [] });
    expect(r.missing).toEqual([]);
  });
});
