import { describe, expect, it } from "vitest";
import { categoriesForRole, NOTIFY_CATEGORIES } from "@/lib/notify/categories";
import { digestText, weeklyText } from "@/lib/notify/digests";
import { makeLinkToken, readLinkToken, webhookSecret } from "@/lib/notify/link";
import { isQuiet, sendAfter } from "@/lib/notify/quiet";

const manila = (iso: string) => new Date(`${iso}+08:00`);

describe("quiet hours (Manila)", () => {
  it("are 21:00 to 07:00", () => {
    expect(isQuiet(manila("2026-11-18T06:59:00"))).toBe(true);
    expect(isQuiet(manila("2026-11-18T07:00:00"))).toBe(false);
    expect(isQuiet(manila("2026-11-18T20:59:00"))).toBe(false);
    expect(isQuiet(manila("2026-11-18T21:00:00"))).toBe(true);
    expect(isQuiet(manila("2026-11-18T00:30:00"))).toBe(true);
  });
  it("holds a message until 07:00 of the right day", () => {
    expect(sendAfter(manila("2026-11-18T22:15:00")).toISOString()).toBe(manila("2026-11-19T07:00:00").toISOString());
    expect(sendAfter(manila("2026-11-19T02:15:00")).toISOString()).toBe(manila("2026-11-19T07:00:00").toISOString());
    const noon = manila("2026-11-18T12:00:00");
    expect(sendAfter(noon).getTime()).toBe(noon.getTime());
  });
});

describe("the connect link", () => {
  const token = "123456:test-bot-token";
  const user = "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0";
  it("gives back the user it was made for", () => {
    const t = makeLinkToken(token, user, 1_000_000);
    expect(t).toMatch(/^[0-9a-z_]+$/);
    expect(t.length).toBeLessThanOrEqual(64);
    expect(readLinkToken(token, t, 1_000_000 + 60_000)).toBe(user);
  });
  it("expires after 30 minutes and cannot be altered or used with another bot", () => {
    const t = makeLinkToken(token, user, 1_000_000);
    expect(readLinkToken(token, t, 1_000_000 + 31 * 60_000)).toBeNull();
    expect(readLinkToken(token, t.replace(/.$/, (c) => (c === "0" ? "1" : "0")), 1_000_000)).toBeNull();
    expect(readLinkToken("other-token", t, 1_000_000)).toBeNull();
    expect(readLinkToken(token, "garbage", 1_000_000)).toBeNull();
  });
  it("makes a webhook secret Telegram accepts", () => {
    expect(webhookSecret(token)).toMatch(/^[A-Za-z0-9_-]{1,256}$/);
    expect(webhookSecret(token)).not.toBe(webhookSecret("other"));
  });
});

describe("categories", () => {
  it("every role that gets messages has some, and ids are unique", () => {
    const ids = NOTIFY_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const role of ["sales", "buying", "admin", "super_admin"] as const) expect(categoriesForRole(role).length).toBeGreaterThanOrEqual(1);
  });
  it("only the Admin alert ignores quiet hours", () => {
    expect(NOTIFY_CATEGORIES.filter((c) => c.urgent).map((c) => c.id)).toEqual(["system_alert"]);
  });
  it("nothing mentions PCF", () => {
    expect(JSON.stringify(NOTIFY_CATEGORIES)).not.toMatch(/pcf|voucher|petty/i);
  });
});

describe("digest words", () => {
  it("is empty when there is nothing to say", () => {
    expect(digestText("⏰ Your deals", "2026-11-18", [], "link")).toBeNull();
  });
  it("lists items and stays short when there are many", () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ title: `Deal ${i}`, detail: "late" }));
    const text = digestText("⏰ Your deals", "2026-11-18", items, "https://x")!;
    expect(text).toContain("Deal 0");
    expect(text).toContain("and 35 more");
    expect(text.length).toBeLessThan(4096);
  });
  it("writes the weekly summary", () => {
    const text = weeklyText("2026-11-23", { receiptsSaved: 12, overdueDeals: 5, overdueBalance: "₱120,000.00", carsNeedScan: 7, carsHandedOff: 2, reviewOpen: 56 }, "https://x");
    expect(text).toContain("Receipts this week: 12");
    expect(text).toContain("56 in the data check");
  });
});
