import { describe, expect, it } from "vitest";
import { fakeReading, readDocument, readerPrompt } from "@/lib/docs/reader";
import { plateOfFolderName } from "@/lib/docs/bridge";
import { syncTargets, type SyncContext, type SyncDeps } from "@/lib/sync/targets";

const image = { base64: "AAAA", mime: "image/jpeg" };

describe("reading a photo", () => {
  it("one photo can hold two documents (the OR and the CR together)", async () => {
    const r = await readDocument(image, async () => JSON.stringify({
      legible: true, notes: null,
      documents: [
        { type: "official_receipt", confidence: 0.95, plate: "WMO752", document_number: "1372-000000004417" },
        { type: "certificate_of_registration", confidence: 0.9, plate: "WMO752", owner_name: "LIM, MARIA LEONILA", motor_no: "L310542062", chassis_no: "MAJAXXMRKAFM00001" },
      ],
    }));
    expect(r.detections.map((d) => d.type)).toEqual(["official_receipt", "certificate_of_registration"]);
    expect(r.detections[1]).toMatchObject({ ownerName: "LIM, MARIA LEONILA", motorNo: "L310542062", plate: "WMO752" });
  });
  it("an unknown type becomes 'other', and numbers and blanks are tidied", async () => {
    const r = await readDocument(image, async () => '```json\n{"legible":true,"documents":[{"type":"selfie","confidence":"0.8","plate":"  ","holder_name":123}]}\n```');
    expect(r.detections[0]).toMatchObject({ type: "other", confidence: 0.8, plate: null, holderName: "123" });
  });
  it("a picture that cannot be read says so", async () => {
    const r = await readDocument(image, async () => '{"legible":false,"documents":[]}');
    expect(r).toMatchObject({ legible: false, detections: [] });
  });
  it("tries once more on a broken answer, then gives up with a message", async () => {
    let calls = 0;
    const ok = await readDocument(image, async () => (++calls === 1 ? "nope" : '{"legible":true,"documents":[{"type":"promissory_note","confidence":1}]}'));
    expect(calls).toBe(2);
    expect(ok.detections[0].type).toBe("promissory_note");
    await expect(readDocument(image, async () => "still nope")).rejects.toThrow(/could not be understood/);
  });
  it("keeps at most four documents from one photo", async () => {
    const docs = Array.from({ length: 9 }, () => ({ type: "other", confidence: 0.5 }));
    expect((await readDocument(image, async () => JSON.stringify({ legible: true, documents: docs }))).detections).toHaveLength(4);
  });
  it("tells the model what each Philippine document looks like and never to guess", () => {
    const p = readerPrompt();
    for (const word of ["Official Receipt", "Certificate of Registration", "Secretary's Certificate", "Board Resolution", "MORE THAN ONE document", "NEVER guess"]) expect(p).toContain(word);
  });
});

describe("the stand-in reader (development only)", () => {
  it("decides from the file name", () => {
    expect(fakeReading("cr-or.jpg", "ZZT1001").detections.map((d) => d.type)).toEqual(["official_receipt", "certificate_of_registration"]);
    expect(fakeReading("id-Maria_Lim.jpg", "ZZT1001").detections[0]).toMatchObject({ type: "government_id", holderName: "Maria Lim" });
    expect(fakeReading("IMG_1.jpg", "ZZT1001").detections[0].type).toBe("other");
    expect(fakeReading("blurry.jpg", "ZZT1001").legible).toBe(false);
  });
});

describe("folder names", () => {
  it("take the plate from the brackets at the end", () => {
    expect(plateOfFolderName("14 Toyota Vios (AAX-3622)")).toBe("AAX3622");
    expect(plateOfFolderName("13 Ford Escape (WMO752)")).toBe("WMO752");
    expect(plateOfFolderName("17 Mercedes Benz A 180 URBAN (NCO2801) ")).toBe("NCO2801");
    expect(plateOfFolderName("No plate here")).toBeNull();
    expect(plateOfFolderName("Car (A1)")).toBeNull();
  });
});

describe("the docs sync job", () => {
  const ctx = (event: SyncContext["event"]) => ({ event, deal: { id: "deal-1" }, units: [{ plate: "AAX-3622" }, { plate: "NKF 4771" }] }) as unknown as SyncContext;
  it("links the folder of every plate of the deal, only when the AR is created", async () => {
    const linked: string[][] = [];
    const deps = { docsLink: async (plate: string, dealId: string) => { linked.push([plate, dealId]); } } as unknown as SyncDeps;
    await syncTargets.docs(ctx("confirm"), deps);
    expect(linked).toEqual([]);
    await syncTargets.docs(ctx("submit"), deps);
    expect(linked).toEqual([["AAX-3622", "deal-1"], ["NKF 4771", "deal-1"]]);
  });
  it("fails loudly when the documents folders are not set up", async () => {
    await expect(syncTargets.docs(ctx("submit"), {} as SyncDeps)).rejects.toThrow(/not set up/);
  });
});

import { mergeRepeats } from "@/lib/docs/reader";
import type { Detection } from "@/lib/docs/types";

describe("the same document listed twice in one photo", () => {
  const d = (type: Detection["type"], over: Partial<Detection> = {}): Detection => ({ type, confidence: 0.9, ...over });
  it("is one document, keeping every detail either listing had", () => {
    const merged = mergeRepeats([d("official_receipt", { plate: "WMO752" }), d("certificate_of_registration", { ownerName: "LIM, MARIA" }), d("official_receipt", { confidence: 1, holderName: "LIM, MARIA" }), d("certificate_of_registration", { motorNo: "L310" })]);
    expect(merged.map((x) => x.type)).toEqual(["official_receipt", "certificate_of_registration"]);
    expect(merged[0]).toMatchObject({ plate: "WMO752", confidence: 1, holderName: "LIM, MARIA" });
    expect(merged[1]).toMatchObject({ ownerName: "LIM, MARIA", motorNo: "L310" });
  });
  it("the same person's ID twice is one; two different people's IDs stay two", () => {
    expect(mergeRepeats([d("government_id", { holderName: "ANA LOPEZ" }), d("government_id", { holderName: "LOPEZ, ANA" })])).toHaveLength(1);
    expect(mergeRepeats([d("government_id", { holderName: "ANA LOPEZ" }), d("government_id", { holderName: "PEDRO CRUZ" })])).toHaveLength(2);
  });
  it("two 'other' pictures are never merged", () => {
    expect(mergeRepeats([d("other"), d("other")])).toHaveLength(2);
  });
});
