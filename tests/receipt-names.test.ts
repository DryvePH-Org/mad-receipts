import { describe, expect, it } from "vitest";
import { isReceiptFile, receiptCopyName, receiptCopyNames, receiptFileBase } from "../src/lib/docs/receipt-names";

describe("receipt copies in a car's folder", () => {
  it("are named by receipt number and plate, so the same receipt is never filed twice", () => {
    expect(receiptFileBase("2556", "NKF 4771")).toBe("RECEIPT-2556_NKF4771");
    expect(receiptFileBase("ZZT-E2E-D101", "zzt-7001")).toBe("RECEIPT-ZZT-E2E-D101_ZZT7001");
  });
  it("are recognised by their name, so the scanner leaves them alone", () => {
    expect(isReceiptFile("RECEIPT-2556_NKF4771.html")).toBe(true);
    expect(isReceiptFile("receipt-2556_NKF4771_proof-1.jpg")).toBe(true);
    expect(isReceiptFile("IMG_9371.HEIC")).toBe(false);
    expect(isReceiptFile("OR RECEIPT photo.jpg")).toBe(false);
  });
  it("the copy the app makes is named UNSIGNED, and an older plain copy still counts as filed", () => {
    expect(receiptCopyName("2556", "NKF 4771")).toBe("RECEIPT-2556_NKF4771_UNSIGNED.html");
    expect(receiptCopyNames("2556", "NKF 4771")).toEqual(["RECEIPT-2556_NKF4771_UNSIGNED.html", "RECEIPT-2556_NKF4771.html"]);
    expect(isReceiptFile(receiptCopyName("2556", "NKF 4771"))).toBe(true); // still never scanned as a car document
  });
});
