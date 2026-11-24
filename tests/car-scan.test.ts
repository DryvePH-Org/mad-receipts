import { describe, expect, it } from "vitest";
import { scanCarPhoto, scanToForm, fakeScan, CarScanError } from "@/lib/cars/car-scan";

const mvInquiry = {
  legible: true, plate: "NBD2426", make_brand: "Nissan", series: "TERRA 2.5L EL M", year_model: "2019", color: "FIERY RED", body_type: "SUV", fuel: "DIESEL",
  odometer: "0 km", owner_name: null, encumbered_to: "PHILIPPNE BUSINESS BANK",
};

describe("car scan: a reading becomes form values", () => {
  it("maps the LTO MV Inquiry sample through the standards", () => {
    const { values, unread } = scanToForm(mvInquiry);
    expect(values).toEqual({
      plate: "NBD 2426", make: "NISSAN", model_variant: "TERRA 2.5L EL M", year_model: "2019", color: "FIERY RED", body_type: "SUV", fuel: "DIESEL",
      encumbrance: "PHILIPPNE BUSINESS BANK",
    });
    expect(unread).toEqual([]);
  });
  it("ignores a zero odometer, keeps a real one", () => {
    expect(scanToForm(mvInquiry).values.mileage).toBeUndefined();
    expect(scanToForm({ ...mvInquiry, odometer: "45,000 km" }).values.mileage).toBe("45000");
  });
  it("leaves out what does not fit and lists the expected boxes it could not fill", () => {
    const { values, unread } = scanToForm({ legible: true, plate: "12", make_brand: "Toyota", fuel: "kerosene", encumbered_to: "N/A" });
    expect(values).toEqual({ make: "TOYOTA" });
    expect(unread).toEqual(["plate", "model_variant", "year_model", "color"]);
  });
  it("takes the owner from a CR", () => {
    expect(scanToForm({ legible: true, owner_name: "lim,  maria" }).values.reg_owner_name).toBe("LIM, MARIA");
  });
});

describe("car scan: the reader call", () => {
  const img = { base64: "AAAA", mime: "image/jpeg" };
  it("reads a fenced JSON answer", async () => {
    const r = await scanCarPhoto(img, async () => "```json\n" + JSON.stringify(mvInquiry) + "\n```");
    expect(r.values.make).toBe("NISSAN");
  });
  it("retries once on a bad answer, then gives up", async () => {
    let n = 0;
    await expect(scanCarPhoto(img, async () => { n++; return "nope"; })).rejects.toBeInstanceOf(CarScanError);
    expect(n).toBe(2);
  });
  it("says so when the photo is not legible", async () => {
    await expect(scanCarPhoto(img, async () => JSON.stringify({ legible: false }))).rejects.toThrow(/blurry/);
  });
  it("has a fake reader by file name", () => {
    expect(fakeScan("scan.jpg").make_brand).toBe("NISSAN");
    expect(fakeScan("blurry.jpg").legible).toBe(false);
  });
});
