import { describe, expect, it } from "vitest";
import { cleanTransmittal, makeTypeFrom, prefillTransmittal, TRANSMITTAL_ITEMS } from "@/lib/docs/transmittal";
import type { Detection } from "@/lib/docs/types";

const det = (d: Partial<Detection> & Pick<Detection, "type">): Detection => ({ confidence: 0.9, ...d });
const src = { plateDisplay: "NKP 5459", folderName: "21 Geely Okavango (NKP5459)", types: [] as never[], caseType: "clean", detections: [] as Detection[], userName: "Ella Datuin", today: "2026-11-09" };

describe("the transmittal starts from the documents workflow", () => {
  it("takes the make and type from the folder name, without the plate", () => {
    expect(makeTypeFrom("21 Geely Okavango (NKP5459)", "NKP 5459")).toBe("21 Geely Okavango");
    expect(makeTypeFrom("AAX-3622 2019 Vios", "AAX 3622")).toBe("2019 Vios");
    expect(makeTypeFrom(null, "NKP 5459")).toBe("");
  });
  it("ticks what the folder has and leaves the physical items for the staff", () => {
    const t = prefillTransmittal({ ...src, types: ["certificate_of_registration", "official_receipt", "owner_id", "deed_owner_to_dealer", "chattel_cancellation", "promissory_note"] as never[] });
    expect(Object.keys(t.items).sort()).toEqual(["chattel", "cr", "deed", "ownerId", "or", "promissory"].sort());
    for (const k of ["stencils", "insurance", "macro", "pnp", "manual", "handbook", "spareKey", "buyerId"]) expect(t.items[k]).toBeUndefined();
    expect(t).toMatchObject({ plate: "NKP 5459", makeType: "21 Geely Okavango", preparedBy: "Ella Datuin", preparedOn: "2026-11-09", receivedBy: "" });
  });
  it("brings the OR and CR numbers and the owner's name from what was read", () => {
    const t = prefillTransmittal({ ...src, types: ["certificate_of_registration", "official_receipt"] as never[], detections: [det({ type: "certificate_of_registration", documentNumber: "CR-123", ownerName: "LIM, MARIA" }), det({ type: "official_receipt", documentNumber: "OR-456" })] });
    expect(t.owner).toBe("LIM, MARIA");
    expect(t.items.cr).toEqual({ on: true, detail: "CR-123" });
    expect(t.items.or).toEqual({ on: true, detail: "OR-456" });
  });
  it("a company car also gets the company deed, a clean one does not; the buyer's papers show once sold", () => {
    expect(prefillTransmittal({ ...src, caseType: "company", types: ["deed_owner_to_dealer", "secretary_certificate", "secretary_id"] as never[] }).items).toMatchObject({ companyDeed: { on: true }, secCert: { on: true }, secId: { on: true } });
    expect(prefillTransmittal({ ...src, types: ["deed_owner_to_dealer"] as never[] }).items.companyDeed).toBeUndefined();
    expect(prefillTransmittal({ ...src, types: ["buyer_id", "deed_to_buyer"] as never[] }).items).toMatchObject({ buyerId: { on: true }, deed: { on: true } });
  });
});

describe("a saved transmittal is cleaned", () => {
  it("drops unknown items, caps the length and always has three lines for others", () => {
    const t = cleanTransmittal({ makeType: "x".repeat(500), items: { cr: { on: true, detail: "1" }, hacked: { on: true, detail: "y" } }, others: ["a", "b", "c", "d", "e"] });
    expect(t.makeType).toBe(""); // too long: refused, not cut mid-way
    expect(Object.keys(t.items)).toEqual(["cr"]);
    expect(t.others).toEqual(["", "", ""]);
    expect(cleanTransmittal({ others: ["only"] }).others).toEqual(["only", "", ""]);
    expect(cleanTransmittal(null)).toMatchObject({ plate: "", items: {} });
  });
  it("knows every item of the paper form", () => {
    expect(TRANSMITTAL_ITEMS).toHaveLength(17);
    expect(new Set(TRANSMITTAL_ITEMS.map((i) => i.key)).size).toBe(17);
  });
});
