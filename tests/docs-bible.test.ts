import { describe, expect, it } from "vitest";
import { EMPTY_DETAILS } from "@/lib/docs/details";
import { desiredValues, phtStamp, planChanges, receivedText, scanNote, submittedText } from "@/lib/docs/bible";

const present = (...t: string[]) => new Set(t);
const CLEAN_PAPERS = ["official_receipt", "certificate_of_registration", "owner_id", "deed_owner_to_dealer"];

describe("what the checklist says for each column", () => {
  it("a clean car with its four papers: Yes, and N/A for what a clean car never needs", () => {
    expect(desiredValues({ caseType: "clean", present: present(...CLEAN_PAPERS), current: {} })).toEqual({
      classification: "Clean", cr: "Yes", or: "Yes", deed: "Yes", sellers_id: "Yes", sec_cert: "N/A", sec_ids: "N/A", boards_reso: "N/A", encumbered: "N/A", chattel: "N/A", promissory: "N/A",
    });
  });
  it("a paper that is required but not there yet is left out, not written as No", () => {
    const d = desiredValues({ caseType: "clean", present: present("official_receipt"), current: {} });
    expect(d).not.toHaveProperty("cr");
    expect(d).not.toHaveProperty("deed");
    expect(d.or).toBe("Yes");
  });
  it("an encumbered car needs the chattel and the promissory note, and is Encumbered (Indiv)", () => {
    const d = desiredValues({ caseType: "encumbered", present: present(...CLEAN_PAPERS, "chattel_cancellation", "promissory_note"), current: {} });
    expect(d).toMatchObject({ classification: "Encumbered (Indiv)", encumbered: "Yes", chattel: "Yes", promissory: "Yes", sec_cert: "N/A" });
  });
  it("a repo car also needs the secretary papers", () => {
    const d = desiredValues({ caseType: "repo_bank", present: present(...CLEAN_PAPERS, "chattel_cancellation", "promissory_note", "secretary_certificate"), current: {} });
    expect(d).toMatchObject({ classification: "Repo (bank)", sec_cert: "Yes", chattel: "Yes" });
    expect(d).not.toHaveProperty("sec_ids"); // required, not in the folder yet
  });
  it("a company car is Clean in the sheet, with the secretary papers Yes", () => {
    const d = desiredValues({ caseType: "company", present: present("official_receipt", "certificate_of_registration", "representative_id", "deed_owner_to_dealer", "secretary_certificate", "secretary_id", "board_resolution"), current: {} });
    expect(d).toMatchObject({ classification: "Clean", sellers_id: "Yes", sec_cert: "Yes", sec_ids: "Yes", boards_reso: "Yes", encumbered: "N/A" });
  });
});

describe("planning the changes", () => {
  const base = { caseType: "clean" as const, present: present(...CLEAN_PAPERS) };
  it("fills blanks, and turns No or To follow into Yes once the paper is in", () => {
    const p = planChanges({ ...base, current: { classification: "", cr: "To follow", or: "No", deed: "", sellers_id: "Yes" } });
    expect(p.changes.map((c) => `${c.field}:${c.before}>${c.after}`)).toEqual(expect.arrayContaining(["classification:>Clean", "cr:To follow>Yes", "or:No>Yes", "deed:>Yes"]));
    expect(p.changes.some((c) => c.field === "sellers_id")).toBe(false);
  });
  it("never downgrades a Yes and never overwrites what a person typed", () => {
    const p = planChanges({ caseType: "clean", present: present("official_receipt"), current: { cr: "Yes", or: "Yes", sec_cert: "Yes", chattel: "To follow" } });
    expect(p.changes.some((c) => c.field === "cr")).toBe(false);
    expect(p.changes.some((c) => c.field === "sec_cert")).toBe(false); // a person said Yes: left alone
    expect(p.changes.find((c) => c.field === "chattel")).toBeUndefined(); // To follow stays: the paper is not there
  });
  it("reports a classification that disagrees instead of changing it", () => {
    const p = planChanges({ ...base, current: { classification: "Repo (bank)" } });
    expect(p.changes.some((c) => c.field === "classification")).toBe(false);
    expect(p.notes.join(" ")).toMatch(/Repo \(bank\).*Clean/);
  });
  it("says so when a paper is in the folder but the sheet says N/A", () => {
    const p = planChanges({ caseType: "clean", present: present(...CLEAN_PAPERS, "secretary_certificate"), current: { sec_cert: "N/A" } });
    expect(p.notes.join(" ")).toMatch(/SEC CERT is N\/A/);
  });
  it("has nothing to write when the sheet already matches", () => {
    const current = Object.fromEntries(Object.entries(desiredValues({ ...base, current: {} })));
    expect(planChanges({ ...base, current }).changes).toEqual([]);
  });
});

describe("the dated notes", () => {
  it("writes the time the way the CHANGELOG does", () => {
    expect(phtStamp(new Date("2026-11-13T08:38:00Z"))).toBe("13 Nov 2026, 4:38 PM PHT");
    expect(phtStamp(new Date("2026-10-03T07:58:00Z"))).toBe("3 Oct 2026, 3:58 PM PHT");
  });
  it("lists the papers and flags, and the car's details", () => {
    const note = scanNote({
      now: new Date("2026-11-13T08:38:00Z"), carName: "17 Toyota Wigo (NBU4875)",
      items: [{ label: "Official receipt (OR)", present: true, stage: "available" }, { label: "Deed of sale", present: false, stage: "available" }, { label: "Buyer's ID", present: false, stage: "sold" }],
      flags: ["The plate on the deed reads UHK173"], details: { ...EMPTY_DETAILS, spareKey: "yes", batteryWhen: "June 2026" },
    });
    expect(note.split("\n").slice(0, 2)).toEqual(["13 Nov 2026, 4:38 PM PHT", "17 Toyota Wigo (NBU4875)"]);
    expect(note).toContain("✅ Official receipt (OR)");
    expect(note).toContain("❌ Deed of sale");
    expect(note).not.toContain("Buyer's ID");
    expect(note).toContain("⚠ The plate on the deed reads UHK173");
    expect(note).toContain("Spare key: yes | Battery: June 2026");
  });
  it("writes the handoff sentences as the sheet already has them", () => {
    expect(submittedText("jep", "2026-09-28")).toBe("SUBMITTED TO JEP 9/28");
    expect(receivedText("Jep", "2026-11-07")).toBe("ORIG DOCS RECEIVED FROM JEP 11/07/2026");
  });
});
