import { describe, expect, it } from "vitest";
import { guessPaper, isTransferTag, placeFiles, transferProgress } from "@/lib/docs/transfer-papers";

describe("the papers for the new owner", () => {
  it("knows the paper from a file name, and says nothing for a phone photo", () => {
    expect(guessPaper("NEM3720-OR.jpg")).toBe("OR");
    expect(guessPaper("new cr.pdf")).toBe("CR");
    expect(guessPaper("PNP Clearance page 1.jpg")).toBe("PNP clearance");
    expect(guessPaper("macro-etching.jpeg")).toBe("Macro-etching");
    expect(guessPaper("IMG_2041.jpg")).toBeNull();
    expect(guessPaper("orange.jpg")).toBeNull(); // "or" inside a word is not the OR
  });
  it("starts each file of a batch with the paper it most likely is", () => {
    // names that say it keep their paper; the others take the next paper that has nothing yet, in the order OR, CR, PNP clearance, macro-etching
    expect(placeFiles(["IMG_1.jpg", "IMG_2.jpg", "IMG_3.jpg", "IMG_4.jpg"], new Set())).toEqual(["OR", "CR", "PNP clearance", "Macro-etching"]);
    expect(placeFiles(["IMG_1.jpg", "pnp.jpg", "IMG_3.jpg"], new Set())).toEqual(["OR", "PNP clearance", "CR"]);
    expect(placeFiles(["IMG_1.jpg", "IMG_2.jpg"], new Set(["OR", "CR"]))).toEqual(["PNP clearance", "Macro-etching"]);
    expect(placeFiles(["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"], new Set())).toEqual(["OR", "CR", "PNP clearance", "Macro-etching", "Other"]);
  });
  it("counts how many of the four papers have a copy", () => {
    expect(transferProgress(["OR", "OR", "PNP clearance", "Other"])).toEqual({ have: 2, total: 4, missing: ["CR", "Macro-etching"] });
    expect(transferProgress([])).toMatchObject({ have: 0, total: 4 });
    expect(transferProgress(["OR", "CR", "PNP clearance", "Macro-etching"]).missing).toEqual([]);
  });
  it("accepts only the four papers and Other as a tag", () => {
    expect(["OR", "CR", "PNP clearance", "Macro-etching", "Other"].every(isTransferTag)).toBe(true);
    expect(isTransferTag("Deed")).toBe(false);
  });
});
