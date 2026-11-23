import { describe, expect, it } from "vitest";
import { buildCar, type FileRow, type FolderRow } from "@/lib/docs/car";
import { archiveTotal, cleanAmount, isPaymentStatus, isPaymentTag, PAYMENT_LABEL, PAYMENT_STATUSES } from "@/lib/docs/payments";

describe("payments", () => {
  it("an amount typed with a peso sign or commas is read; nothing else is an amount", () => {
    expect(cleanAmount("₱ 150,000")).toBe(150000);
    expect(cleanAmount("12,345.678")).toBe(12345.68);
    for (const bad of ["", "abc", "0", "-5", null, undefined, "9999999999"]) expect(cleanAmount(bad)).toBeNull();
  });
  it("the total only adds up the amounts that were typed", () => {
    expect(archiveTotal([{ amount: 100000 }, { amount: null }, { amount: 50000.5 }])).toBe(150000.5);
    expect(archiveTotal([])).toBe(0);
  });
  it("only the known statuses and tags are accepted, and each status has a label", () => {
    expect(PAYMENT_STATUSES.every((s) => isPaymentStatus(s) && PAYMENT_LABEL[s])).toBe(true);
    expect(isPaymentStatus("refunded")).toBe(false);
    expect(isPaymentTag("Proof of payment")).toBe(true);
    expect(isPaymentTag("Receipt")).toBe(false);
  });
});

const folder = { plate_no: "ZZP1", plate_display: "ZZP 1", folder_id: "f1", match_status: "linked", case_source: "auto", case_type: null, deal_id: null } as unknown as FolderRow;
const file = (id: string, over: Record<string, unknown> = {}) => ({ id, plate_no: "ZZP1", filename: `${id}.jpg`, created_at: "2026-11-24T00:00:00Z", read_status: "pending", doc_types: [], doc_types_source: "auto", details: {}, archive: null, ...over }) as unknown as FileRow;

describe("the car and its payment archive", () => {
  it("payment papers are kept apart: not read, not on the checklist, not counted as photos", () => {
    const car = buildCar(folder, [file("a"), file("pay1", { archive: "payment", archive_tag: "Proof of payment", read_status: "done" })], { buyerName: null, hasReceipt: false });
    expect(car.files.map((f) => f.id)).toEqual(["a"]);
    expect(car.archive.map((f) => f.id)).toEqual(["pay1"]);
    expect(car.pending).toBe(1);
    expect(car.analysis.files.map((f) => f.id)).toEqual(["a"]);
  });
  it("a sale recorded by hand asks for the sold papers like an AR does; with no sale and no AR the checklist leaves them out", () => {
    const sold = buildCar(folder, [], { buyerName: "JUAN DELA CRUZ", hasReceipt: false, linked: true });
    expect(sold.checklist.items.map((i) => i.key)).toEqual(expect.arrayContaining(["ack", "buyer_id", "deed_to_buyer"]));
    const none = buildCar(folder, [], { buyerName: null, hasReceipt: false });
    expect(none.checklist.items.some((i) => i.key === "ack")).toBe(false);
  });
});
