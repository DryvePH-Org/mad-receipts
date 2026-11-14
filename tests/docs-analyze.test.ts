import { describe, expect, it } from "vitest";
import { analyze, checklist, folderStatus, type FileInput } from "@/lib/docs/analyze";
import { normName, sameName } from "@/lib/docs/names";
import type { Detection } from "@/lib/docs/types";

let n = 0;
const det = (type: Detection["type"], over: Partial<Detection> = {}): Detection => ({ type, confidence: 0.95, ...over });
const file = (detections: Detection[] | null, over: Partial<FileInput> = {}): FileInput => ({
  id: `f${++n}`, filename: `IMG_${n}.HEIC`, createdAt: `2026-10-27T00:00:${String(n).padStart(2, "0")}Z`, detections,
  readStatus: detections ? "done" : "pending", manualTypes: null, ...over,
});
const folder = { plate: "WMO752", caseType: null };
const deal = { buyerName: "Juan Dela Cruz", hasReceipt: true };
const OWNER = "LIM, MARIA LEONILA";
const types = (a: ReturnType<typeof analyze>, i: number) => a.files[i].types;

describe("the paper copy of the acknowledgement of payment", () => {
  it("counts as the AR even when the app has no receipt for the car", () => {
    const a = analyze([file([det("acknowledgement_receipt", { buyerName: "Juan Dela Cruz", documentNumber: "2516" })])], folder, { ...deal, hasReceipt: false });
    expect(types(a, 0)).toEqual(["acknowledgement_receipt"]);
    expect(checklist("clean", a.files, { ...deal, hasReceipt: false }).items.find((i) => i.key === "ack")?.present).toBe(true);
  });
});

describe("names", () => {
  it("match whatever the order, the middle name or one wrong letter", () => {
    expect(sameName("LIM, MARIA LEONILA", "Maria Leonila Lim")).toBe(true);
    expect(sameName("Maria Leonila P. Lim", "LIM MARIA LEONILA")).toBe(true);
    expect(sameName("Juan Dela Cruz", "DELA CRUZ, JUAN")).toBe(true);
    expect(sameName("Maria Leonila Lim", "Maria Leonila Lym")).toBe(true); // one letter misread
  });
  it("do not match different people", () => {
    expect(sameName("Maria Lim", "Jose Lim")).toBe(false);
    expect(sameName("Juan Dela Cruz", "Juan Santos")).toBe(false);
    expect(sameName(null, "Juan")).toBe(false);
    expect(normName("  PEÑA, José  ")).toBe("pena jose");
  });
});

describe("what each photo is for", () => {
  it("one photo can hold the OR and the CR together", () => {
    const a = analyze([file([det("official_receipt", { plate: "WMO752" }), det("certificate_of_registration", { plate: "WMO752", ownerName: OWNER })])], folder, deal);
    expect(types(a, 0)).toEqual(["official_receipt", "certificate_of_registration"]);
  });
  it("an ID is tied to a person by name: owner, secretary, representative or buyer", () => {
    const files = [
      file([det("certificate_of_registration", { ownerName: "ACME TRADING CORP" })]),
      file([det("secretary_certificate", { secretaryName: "Ana Reyes", representativeName: "Pedro Santos" })]),
      file([det("government_id", { holderName: "REYES, ANA B." })]),
      file([det("government_id", { holderName: "Pedro Santos" })]),
      file([det("government_id", { holderName: "Juan Dela Cruz" })]),
      file([det("government_id", { holderName: "Someone Else" })]),
    ];
    const a = analyze(files, folder, deal);
    expect([2, 3, 4, 5].map((i) => types(a, i)[0])).toEqual(["secretary_id", "representative_id", "buyer_id", "id_unmatched"]);
    expect(a.files[5].flags.join(" ")).toContain("Choose whose ID this is");
  });
  it("the owner's ID matches the owner on the CR", () => {
    const a = analyze([file([det("certificate_of_registration", { ownerName: OWNER })]), file([det("government_id", { holderName: "Maria Leonila Lim" })])], folder, deal);
    expect(types(a, 1)).toEqual(["owner_id"]);
  });
  it("an ID is not tied to anyone until the CR is in the folder, then it is", () => {
    const id = file([det("government_id", { holderName: "Maria Leonila Lim" })]);
    expect(types(analyze([id], folder, deal), 0)).toEqual(["id_unmatched"]);
    expect(types(analyze([id, file([det("certificate_of_registration", { ownerName: OWNER })])], folder, deal), 0)).toEqual(["owner_id"]);
  });
  it("a deed is to the dealership or to the buyer, by who the buyer on it is", () => {
    const a = analyze([
      file([det("deed_of_sale", { sellerName: OWNER, buyerName: "Manila Auto Display" })]),
      file([det("deed_of_sale", { sellerName: OWNER, buyerName: "DELA CRUZ, JUAN" })]),
      file([det("deed_of_sale", { sellerName: OWNER, buyerName: "Pedro Nobody" })]),
    ], folder, deal);
    expect([0, 1, 2].map((i) => types(a, i)[0])).toEqual(["deed_owner_to_dealer", "deed_to_buyer", "deed_unmatched"]);
  });
  it("an open deed (the owner signed, the buyer's line is blank) is the owner's deed to the dealership", () => {
    const a = analyze([file([det("deed_of_sale", { sellerName: OWNER })])], folder, deal);
    expect(types(a, 0)).toEqual(["deed_owner_to_dealer"]);
  });
  it("what a person chose wins over the reading", () => {
    const a = analyze([file([det("government_id", { holderName: "Someone Else" })], { manualTypes: ["buyer_id"] })], folder, deal);
    expect(types(a, 0)).toEqual(["buyer_id"]);
  });
  it("an unread photo has no type yet; a read photo that is nothing is 'other'", () => {
    const a = analyze([file(null), file([det("other")])], folder, deal);
    expect([types(a, 0), types(a, 1)]).toEqual([[], ["other"]]);
  });
});

describe("what does not agree", () => {
  it("flags a plate that is not this folder's", () => {
    const a = analyze([file([det("certificate_of_registration", { plate: "ABC 1234", ownerName: OWNER })])], folder, deal);
    expect(a.files[0].flags.join(" ")).toContain("reads ABC 1234, but this folder is WMO752");
  });
  it("forgives a plate with a dash, spaces or a missing letter the reader dropped", () => {
    for (const plate of ["WMO-752", "wmo 752", "WMO752"]) expect(analyze([file([det("official_receipt", { plate })])], folder, deal).files[0].flags).toEqual([]);
  });
  it("flags motor or chassis numbers that differ between documents", () => {
    const a = analyze([file([det("certificate_of_registration", { motorNo: "2NZ5160482", ownerName: OWNER })]), file([det("deed_of_sale", { motorNo: "1NZ9999999", buyerName: "Manila Auto Display" })])], folder, deal);
    expect(a.files[0].flags.join(" ")).toContain("motor number does not match");
    expect(a.files[1].flags.join(" ")).toContain("motor number does not match");
    expect(analyze([file([det("certificate_of_registration", { motorNo: "2NZ5160482" })]), file([det("official_receipt", { motorNo: "2NZ-5160482" })])], folder, deal).files[0].flags).toEqual([]);
  });
  it("flags a deed whose seller is not the registered owner", () => {
    const a = analyze([file([det("certificate_of_registration", { ownerName: OWNER })]), file([det("deed_of_sale", { sellerName: "Pedro Nobody", buyerName: "Manila Auto Display" })])], folder, deal);
    expect(a.files[1].flags.join(" ")).toContain("is not the registered owner");
  });
  it("marks two photos of one document", () => {
    const a = analyze([
      file([det("certificate_of_registration", { documentNumber: "163769933", ownerName: OWNER })]),
      file([det("certificate_of_registration", { documentNumber: "163-769933" })]),
      file([det("government_id", { holderName: "Maria Leonila Lim", idType: "Driver's license" })]),
      file([det("government_id", { holderName: "LIM, MARIA LEONILA", idType: "driver's license" })]),
    ], folder, deal);
    expect(a.files[1].duplicateOf).toBe(a.files[0].id);
    expect(a.files[3].duplicateOf).toBe(a.files[2].id);
    expect(a.files[0].duplicateOf).toBeNull();
  });
  it("flags a reading that is not confident, and a file that could not be read", () => {
    const a = analyze([file([det("promissory_note", { confidence: 0.4 })]), file(null, { readStatus: "failed" }), file(null, { readStatus: "unreadable" })], folder, deal);
    expect(a.files[0].flags.join(" ")).toContain("Not sure");
    expect(a.files[1].flags.join(" ")).toContain("Could not read");
    expect(a.files[2].flags.join(" ")).toContain("too unclear");
  });
});

describe("the case, from what is in the folder", () => {
  const owned = (name: string) => file([det("certificate_of_registration", { ownerName: name })]);
  it("clean, encumbered, repo bank and company", () => {
    expect(analyze([owned(OWNER), file([det("official_receipt")])], folder, deal).suggestedCase).toBe("clean");
    expect(analyze([owned(OWNER), file([det("chattel_cancellation")]), file([det("promissory_note")])], folder, deal).suggestedCase).toBe("encumbered");
    expect(analyze([owned("BDO UNIBANK INC"), file([det("secretary_certificate", { secretaryName: "Ana" })]), file([det("chattel_cancellation")])], folder, deal).suggestedCase).toBe("repo_bank");
    expect(analyze([owned("ACME TRADING CORP"), file([det("secretary_certificate", { secretaryName: "Ana" })]), file([det("board_resolution")])], folder, deal).suggestedCase).toBe("company");
  });
});

describe("the checklist", () => {
  const clean = [
    file([det("official_receipt"), det("certificate_of_registration", { ownerName: OWNER })]),
    file([det("government_id", { holderName: "Maria Leonila Lim" })]),
    file([det("deed_of_sale", { sellerName: OWNER, buyerName: "Manila Auto Display" })]),
  ];
  it("a clean car needs OR, CR, owner ID and the deed; the sold extras come on top", () => {
    const a = analyze(clean, folder, deal);
    const c = checklist("clean", a.files, deal);
    expect(c.items.filter((i) => i.stage === "available").every((i) => i.present)).toBe(true);
    expect(c.missing.map((m) => m.key)).toEqual(["ack", "buyer_id", "deed_to_buyer"]);
    expect(c.complete).toBe(false);
  });
  it("complete once the buyer's ID, the signed deed and the signed AR are uploaded", () => {
    const more = [...clean, file([det("government_id", { holderName: "Juan Dela Cruz" })]), file([det("deed_of_sale", { sellerName: OWNER, buyerName: "Juan Dela Cruz" })]), file([det("acknowledgement_receipt", { buyerName: "Juan Dela Cruz" })])];
    const a = analyze(more, folder, deal);
    expect(checklist("clean", a.files, deal).complete).toBe(true);
    expect(checklist("clean", analyze(more.slice(0, -1), folder, deal).files, deal).missing.map((m) => m.key)).toEqual(["ack"]); // the app's own receipt does not count: the signed paper must be uploaded
  });
  it("each case asks for its own papers", () => {
    const a = analyze(clean, folder, deal);
    expect(checklist("encumbered", a.files, deal).missing.map((m) => m.key)).toEqual(["chattel_cancellation", "promissory_note", "ack", "buyer_id", "deed_to_buyer"]);
    expect(checklist("repo_bank", a.files, deal).missing.map((m) => m.key)).toEqual(["chattel_cancellation", "promissory_note", "secretary_certificate", "secretary_id", "ack", "buyer_id", "deed_to_buyer"]);
    expect(checklist("company", a.files, deal).missing.map((m) => m.key)).toEqual(["representative_id", "secretary_certificate", "secretary_id", "board_resolution", "ack", "buyer_id", "deed_to_buyer"]);
  });
  it("a duplicate photo does not count twice but the document still counts", () => {
    const a = analyze([file([det("certificate_of_registration", { documentNumber: "1" })]), file([det("certificate_of_registration", { documentNumber: "1" })])], folder, deal);
    const item = checklist("clean", a.files, deal).items.find((i) => i.key === "certificate_of_registration")!;
    expect(item.present).toBe(true);
    expect(item.fileIds).toEqual([a.files[0].id]);
  });
});

describe("the one-word status", () => {
  const ok = (type: Detection["type"]) => file([det(type)]);
  it("unlinked, to read, to check, missing, complete", () => {
    const a = analyze([ok("official_receipt")], folder, deal), c = checklist("clean", a.files, deal);
    expect(folderStatus(c, a.files, 0, false).key).toBe("unlinked");
    expect(folderStatus(c, a.files, 2, true)).toMatchObject({ key: "unread", label: "2 to read" });
    expect(folderStatus(c, a.files, 0, true).key).toBe("missing");
    const flagged = analyze([file([det("government_id", { holderName: "Nobody" })])], folder, deal);
    expect(folderStatus(checklist("clean", flagged.files, deal), flagged.files, 0, true).key).toBe("review");
  });
});

describe("small misreads are not mismatches (found on real photos)", () => {
  const f = (d: Detection[]) => file(d);
  it("a plate with one wrong letter is accepted; a clearly different plate is flagged", () => {
    const a = analyze([f([det("deed_of_sale", { plate: "WNO 752", buyerName: "Somebody Else" })]), f([det("official_receipt", { plate: "KJM 357" })])], folder, deal);
    expect(a.files[0].flags.join(" ")).not.toContain("reads WNO");
    expect(a.files[1].flags.join(" ")).toContain("reads KJM 357, but this folder is WMO752");
  });
  it("the plate is checked on an unmatched deed too", () => {
    const a = analyze([f([det("deed_of_sale", { plate: "ABC 1234", buyerName: "Somebody Else" })])], folder, deal);
    expect(a.files[0].flags.join(" ")).toContain("reads ABC 1234");
  });
  it("a photo the reader could not name, with a different plate on it, is flagged as maybe another car's", () => {
    const a = analyze([f([det("other", { plate: "KJM 3571" })])], folder, deal);
    expect(a.files[0].flags.join(" ")).toContain("reads KJM 3571, but this folder is WMO752");
  });
  it("a motor or chassis number off by one or two characters is accepted; a different one is flagged", () => {
    const close = analyze([f([det("certificate_of_registration", { motorNo: "L310543062", chassisNo: "PEZEV222D1GP02082" })]), f([det("deed_of_sale", { motorNo: "L310543052", chassisNo: "PEZEV22D1GP02082" })])], folder, deal);
    expect(close.files[0].flags.join(" ")).not.toContain("does not match");
    const far = analyze([f([det("certificate_of_registration", { motorNo: "L310543062" })]), f([det("deed_of_sale", { motorNo: "131061150671" })])], folder, deal);
    expect(far.files[0].flags.join(" ")).toContain("motor number does not match");
  });
  it("a photo that is not a vehicle paper is not compared", () => {
    const a = analyze([f([det("certificate_of_registration", { motorNo: "L310543062" })]), f([det("other", { motorNo: "131061150671" })])], folder, deal);
    expect(a.files[0].flags.join(" ")).not.toContain("does not match");
  });
});

describe("more from the real folders", () => {
  const f = (d: Detection[]) => file(d);
  it("a file number read as a 'plate' is not judged", () => {
    for (const plate of ["1340-00000542367", "L152134", "NO.1-24-0193", "BYD472QA", "LAZ140421"]) {
      expect(analyze([f([det("certificate_of_registration", { plate })])], folder, deal).files[0].flags, plate).toEqual([]);
    }
  });
  it("a 17-character chassis number with three wrong characters is accepted; a different car's is flagged", () => {
    const same = analyze([f([det("certificate_of_registration", { chassisNo: "LHGCM6630GV207975" })]), f([det("deed_of_sale", { chassisNo: "PADGM6630GV207975" })])], folder, deal);
    expect(same.files[0].flags.join(" ")).not.toContain("chassis");
    const other = analyze([f([det("certificate_of_registration", { chassisNo: "LHGCM6630GV207975" })]), f([det("deed_of_sale", { chassisNo: "MR053REF7K4012345" })])], folder, deal);
    expect(other.files[0].flags.join(" ")).toContain("chassis number does not match");
  });
  it("a name cut short by a bad photo still matches (QUEZ for ENRIQUEZ)", () => {
    expect(sameName("QUEZ, JAYSON GUAJO", "JAYSON G ENRIQUEZ")).toBe(true);
    expect(sameName("Maria Santos", "Pedro Santos")).toBe(false);
  });
  it("the owner named on the official receipt counts as the owner for the ID", () => {
    const a = analyze([f([det("official_receipt", { ownerName: "CAPILI, KARLA MEDINA" })]), f([det("government_id", { holderName: "KARLA MEDINA" })])], folder, deal);
    expect(types(a, 1)).toEqual(["owner_id"]);
  });
  it("with no AR, the buyer is the one named on a signed deed, and the AR line is left out", () => {
    const noAr = { buyerName: null, hasReceipt: false, linked: false };
    const a = analyze([f([det("deed_of_sale", { buyerName: "Rochelle Tamundong", sellerName: OWNER })]), f([det("government_id", { holderName: "TAMUNDONG, ROCHELLE G" })])], folder, noAr);
    expect([types(a, 0)[0], types(a, 1)[0]]).toEqual(["deed_to_buyer", "buyer_id"]);
    expect(checklist("clean", a.files, noAr).items.map((i) => i.key)).not.toContain("ack");
  });
});

describe("copies and defects", () => {
  it("flags a photocopy of an original-only paper, but not a photocopied ID", () => {
    const a = analyze([file([det("certificate_of_registration", { copy: "photocopy", ownerName: OWNER })]), file([det("government_id", { copy: "photocopy", holderName: OWNER })])], folder, deal);
    expect(a.files[0].flags.some((f) => /photocopy/.test(f))).toBe(true);
    expect(a.files[1].flags.some((f) => /photocopy/.test(f))).toBe(false);
  });
  it("says what is wrong with a damaged paper", () => {
    const a = analyze([file([det("official_receipt", { defects: ["torn", "cut off"] })])], folder, deal);
    expect(a.files[0].flags.join(" ")).toMatch(/torn, cut off/);
  });
});

describe("the bot's case suggestion", () => {
  it("is Repo bank when the deed's seller is a bank, even with only the CR, OR and deed", () => {
    const a = analyze([file([det("certificate_of_registration", { ownerName: "VILLAROQUE, DAISY" })]), file([det("deed_of_sale", { sellerName: "BANK OF COMMERCE", buyerName: null })])], folder, deal);
    expect(a.suggestedCase).toBe("repo_bank");
    expect(a.caseReason).toMatch(/bank as the seller/);
  });
  it("is Clean when nothing points to a bank, company or loan, and says a person decides", () => {
    const a = analyze([file([det("certificate_of_registration", { ownerName: OWNER })])], folder, deal);
    expect(a.suggestedCase).toBe("clean");
    expect(a.caseReason).toMatch(/choose that case yourself/);
  });
});

describe("warnings a person accepted", () => {
  const photocopy = () => file([det("certificate_of_registration", { ownerName: OWNER, copy: "photocopy" })]);
  it("are not raised again, and other warnings stay", () => {
    const f = photocopy();
    const first = analyze([f], folder, deal).files[0].flags;
    expect(first.length).toBeGreaterThan(0);
    expect(analyze([{ ...f, reviewedFlags: first }], folder, deal).files[0].flags).toEqual([]);
    const other = file([det("certificate_of_registration", { ownerName: OWNER, copy: "photocopy", defects: ["torn"] })]);
    const flags = analyze([{ ...other, reviewedFlags: first }], folder, deal).files[0].flags;
    expect(flags.some((x) => /torn/.test(x))).toBe(true);
  });
  it("also silence a motor-number mismatch only on the file where it was accepted", () => {
    const a = file([det("certificate_of_registration", { motorNo: "3A92UMG5024" })]), b = file([det("official_receipt", { motorNo: "3A92UMG5999" })]);
    const flags = analyze([a, b], folder, deal).files.map((x) => x.flags.length);
    expect(flags).toEqual([1, 1]);
    const msg = analyze([a, b], folder, deal).files[0].flags[0];
    const after = analyze([{ ...a, reviewedFlags: [msg] }, b], folder, deal).files.map((x) => x.flags.length);
    expect(after).toEqual([0, 1]);
  });
});

describe("a reading that repeats another car's photo", () => {
  it("raises a warning naming the other car, and a person can accept it", () => {
    const f = { ...file([det("certificate_of_registration", { ownerName: OWNER })]), lookalike: "DAR4015" };
    const flags = analyze([f], folder, deal).files[0].flags;
    expect(flags.some((x) => /DAR4015/.test(x) && /mixed the photos up/.test(x))).toBe(true);
    expect(analyze([{ ...f, reviewedFlags: flags }], folder, deal).files[0].flags).toEqual([]);
  });
});
