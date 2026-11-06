import { describe, expect, it } from "vitest";

import { digestItemsFor, type DigestStats } from "@/lib/pcf/notifications/digest";
import { escapeHtml, renderEmail } from "@/lib/pcf/notifications/layout";

const quiet: DigestStats = {
  awaitingApproval: 0,
  readyToRelease: 0,
  pendingReviews: 0,
  oldestReviewHours: null,
  flagged: 0,
  drafts: 0,
  submittedRequests: 0,
  approvedRequests: 0,
  lowFunds: [],
};

describe("renderEmail", () => {
  const content = {
    tone: "alert" as const,
    heading: "PCV-2026-0001 was flagged",
    greeting: "Hi Maria,",
    paragraphs: ["Please check it."],
    rows: [{ label: "Reason", value: "<script>alert(1)</script> & more" }],
    cta: { label: "Open voucher", path: "/pcf/vouchers/abc" },
  };

  it("escapes user-provided text in the HTML", () => {
    const { html } = renderEmail(content);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more");
  });

  it("links the button to the app and repeats it in the text version", () => {
    const { html, text } = renderEmail(content);
    expect(html).toContain('href="https://invoice.dryveph.io/pcf/vouchers/abc"');
    expect(text).toContain("Open voucher: https://invoice.dryveph.io/pcf/vouchers/abc");
    expect(text).toContain("Reason: <script>alert(1)</script> & more");
  });

  it("omits the button and table when there is nothing to show", () => {
    const { html } = renderEmail({ tone: "info", heading: "Hi", greeting: "Hi,", paragraphs: ["x"] });
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<a ");
  });

  it("escapes all five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  });
});

describe("digestItemsFor", () => {
  it("sends nothing when nothing is pending", () => {
    for (const role of ["admin", "custodian", "approver", "accounting"] as const) {
      expect(digestItemsFor(role, quiet)).toEqual([]);
    }
  });

  it("tells approvers only about reviews, including how old the oldest is", () => {
    const stats = { ...quiet, pendingReviews: 3, oldestReviewHours: 60, flagged: 2 };
    const items = digestItemsFor("approver", stats);
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe("3 vouchers waiting for review (oldest 2 days)");
    expect(items[0].path).toBe("/pcf/approvals");
  });

  it("tells accounting about requests, flagged vouchers, and low funds", () => {
    const stats = {
      ...quiet,
      submittedRequests: 1,
      approvedRequests: 2,
      flagged: 1,
      lowFunds: [{ name: "Main Petty Cash", expectedCash: 1500 }],
      pendingReviews: 9,
    };
    const texts = digestItemsFor("accounting", stats).map((item) => item.text);
    expect(texts).toEqual([
      "1 replenishment request waiting for accounting review",
      "2 approved replenishments waiting to be closed",
      "1 flagged voucher still unresolved",
      "Main Petty Cash is low: ₱1,500.00 on hand",
    ]);
  });

  it("gives custodians their own reminders and gives admins everything", () => {
    const stats = { ...quiet, drafts: 2, flagged: 1, pendingReviews: 4, oldestReviewHours: 5 };
    expect(digestItemsFor("custodian", stats).map((i) => i.text)).toEqual([
      "1 flagged voucher still unresolved",
      "2 draft vouchers not yet released",
    ]);
    expect(digestItemsFor("admin", stats)).toHaveLength(3);
  });
});
