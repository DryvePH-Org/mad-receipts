import { describe, expect, it } from "vitest";
import { completeOf, finishMarks } from "@/lib/docsbible/marks";

const car = (over: Record<string, string | null> = {}) => ({ classification: "Clean", cr: null, or_receipt: null, deed: null, sellers_id: null, sec_cert: null, sec_ids: null, boards_reso: null, encumbered: null, chattel: null, promissory: null, stencil: null, ...over });

describe("paper marks are never empty", () => {
  it("starts a paper that is in the folder as Yes when nobody has chosen", () => {
    const r = finishMarks(car(), ["certificate_of_registration", "deed_owner_to_dealer", "owner_id"]);
    expect(r).toMatchObject({ cr: "Yes", deed: "Yes", sellers_id: "Yes", or_receipt: "No" });
  });
  it("keeps what a person chose even when the paper is in the folder", () => {
    const r = finishMarks(car({ cr: "To follow", deed: "No", sellers_id: "N/A" }), ["certificate_of_registration", "deed_owner_to_dealer", "owner_id"]);
    expect(r).toMatchObject({ cr: "To follow", deed: "No", sellers_id: "N/A" });
  });
  it("shows No for an empty box the case needs, and N/A for one it does not", () => {
    const r = finishMarks(car(), []);
    expect(r).toMatchObject({ cr: "No", or_receipt: "No", deed: "No", sellers_id: "No", chattel: "N/A", sec_cert: "N/A", stencil: "N/A" });
    expect(finishMarks(car({ classification: "Repo (bank)" }), [])).toMatchObject({ chattel: "No", sec_cert: "No", sec_ids: "No", promissory: "N/A" });
  });
  it("keeps what a person marked, including the old sheet's Yes for a car with no photos", () => {
    const r = finishMarks(car({ cr: "To follow", or_receipt: "Yes", deed: "N/A" }), []);
    expect(r).toMatchObject({ cr: "To follow", or_receipt: "Yes", deed: "N/A" });
  });
  it("treats a car with no classification as needing the four basic papers", () => {
    expect(finishMarks(car({ classification: "Not classified (legacy)" }), [])).toMatchObject({ cr: "No", chattel: "N/A" });
  });
});

describe("COMPLETE DOCS? follows the finished marks", () => {
  it("is complete when the photos cover what the case needs", () => {
    const marks = finishMarks(car(), ["certificate_of_registration", "official_receipt", "deed_owner_to_dealer", "owner_id"]);
    expect(completeOf(marks)).toBe("COMPLETE");
    expect(completeOf(finishMarks(car(), ["certificate_of_registration"]))).toBe("NOT YET");
  });
  it("needs the chattel and the encumbered answer for an encumbered car, and allows N/A for the secretary papers", () => {
    const all = ["certificate_of_registration", "official_receipt", "deed_owner_to_dealer", "owner_id", "chattel_cancellation"];
    expect(completeOf(finishMarks(car({ classification: "Encumbered (Indiv)", encumbered: "Yes" }), all))).toBe("COMPLETE");
    expect(completeOf(finishMarks(car({ classification: "Encumbered (Indiv)" }), all))).toBe("NOT YET");
  });
  it("is empty for a car that is not classified", () => {
    expect(completeOf(finishMarks(car({ classification: "Not classified (legacy)" }), []))).toBeNull();
  });
});
