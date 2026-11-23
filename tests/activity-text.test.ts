import { describe, expect, it } from "vitest";
import { describeActivity } from "@/lib/docs/activity-text";

describe("what the activity history says", () => {
  it("says what was done, with the file or the tag when there is one", () => {
    expect(describeActivity("docs.upload", { file: "ar.jpg" })).toBe("Uploaded a photo (ar.jpg)");
    expect(describeActivity("docs.archive_add", { tag: "Down payment", file: "PAY_1.jpg" })).toBe("Added a payment paper: Down payment (PAY_1.jpg)");
    expect(describeActivity("docs.sale_add", { buyer: "JUAN DELA CRUZ" })).toBe("Added the sale for JUAN DELA CRUZ");
    expect(describeActivity("docs.sale_from_ar", { buyer: "JUAN" })).toMatch(/made from the uploaded AR/);
    expect(describeActivity("docs.payment_status", { status: "Fully paid" })).toBe("Set the payment status to Fully paid");
    expect(describeActivity("docs.payment_status", { status: "" })).toBe("Cleared the payment status");
    expect(describeActivity("docs.save_details", {})).toBe("Saved the details about the car");
  });
  it("says whether the approval or the move to Sold left things open", () => {
    expect(describeActivity("docs.approve", { missing: [] })).toBe("Approved the documents");
    expect(describeActivity("docs.approve", { missing: ["OR", "CR"] })).toBe("Approved the documents with 2 still open");
    expect(describeActivity("docs.move_to_sold", { missing: ["Deed"] })).toBe("Moved the folder to Sold with 1 still open");
  });
  it("names the case in words, and a thing it does not know is still readable", () => {
    expect(describeActivity("docs.set_case", { case: "encumbered_bank" })).toBe("Chose the case: Encumbered to Bank");
    expect(describeActivity("docs.set_case", { case: "auto" })).toBe("Let the bot suggest the case");
    expect(describeActivity("docs.something_new", null)).toBe("Something new");
  });
});
