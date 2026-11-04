import { describe, expect, it } from "vitest";
import { crossCheck } from "@/lib/extraction/crosscheck";
import { ExtractedReceipt } from "@/lib/extraction/schema";

const read = (over: Record<string, unknown>) => ExtractedReceipt.parse({ receipt_no: "2556", plate_no: "NKF4771", buyer_name: "Jose Rizal", amount: 50000, buyer_contact: "09173216078", ...over });

describe("crossCheck", () => {
  it("keeps everything when both readings agree (ignoring formatting)", () => {
    const r = crossCheck(read({}), read({ plate_no: "nkf-4771", buyer_name: "JOSE RIZAL", amount: "50,000", buyer_contact: "0917 321 6078" }));
    expect(r.uncertain).toEqual({});
    expect(r.fields.plate_no).toBe("NKF4771");
  });

  it("blanks a field the two readings disagree on and offers both", () => {
    const r = crossCheck(read({}), read({ plate_no: "NKF4971", amount: 60000 }));
    expect(r.fields.plate_no).toBeNull();
    expect(r.fields.amount).toBeNull();
    expect(r.fields.buyer_name).toBe("Jose Rizal");
    expect(r.uncertain).toEqual({ plate_no: ["NKF4771", "NKF4971"], amount: ["50000", "60000"] });
  });

  it("a value one reading could not read at all is also unsure", () => {
    const r = crossCheck(read({}), read({ buyer_contact: null }));
    expect(r.fields.buyer_contact).toBeNull();
    expect(r.uncertain.buyer_contact).toEqual(["09173216078"]);
  });

  it("does not compare the ticked type or the words", () => {
    const r = crossCheck(read({ paper_payment_type: "earnest", amount_words: "Fifty Thousand" }), read({ paper_payment_type: "partial", amount_words: "Fifty Thousand Only" }));
    expect(r.uncertain).toEqual({});
    expect(r.fields.paper_payment_type).toBe("earnest");
  });

  it("with no second reading nothing changes", () => {
    const first = read({});
    expect(crossCheck(first, null)).toEqual({ fields: first, uncertain: {} });
  });
});
