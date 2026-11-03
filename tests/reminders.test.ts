import { describe, expect, it } from "vitest";
import { buildReminderMessage, type DueDeal } from "@/lib/reminders";

const deal = (plate: string, due_date: string, balance = 450000, buyer = "Jose Rizal"): DueDeal => ({
  plate_no: plate,
  buyer_name: buyer,
  balance,
  due_date,
});
const today = "2026-11-05";

describe("buildReminderMessage", () => {
  it("sends nothing when no balance is due", () => {
    expect(buildReminderMessage([], today)).toBeNull();
    expect(buildReminderMessage([deal("ABC1234", "2026-11-06"), deal("XYZ5678", "2026-12-01")], today)).toBeNull();
  });

  it("lists overdue (most late first) and due today", () => {
    const message = buildReminderMessage(
      [deal("DUE0001", today, 400000, "Maria Clara"), deal("LATE002", "2026-11-04"), deal("LATE001", "2026-11-03"), deal("LATER03", "2026-11-09")],
      today,
    );
    expect(message).toBe(
      [
        "⏰ Balance reminders · Nov 5, 2026",
        "Overdue:\n• LATE001 · Jose Rizal · ₱450,000 · due Nov 3, 2026 (2 days late)\n• LATE002 · Jose Rizal · ₱450,000 · due Nov 4, 2026 (1 day late)",
        "Due today:\n• DUE0001 · Maria Clara · ₱400,000 · due today",
      ].join("\n\n"),
    );
  });

  it("leaves out an empty section", () => {
    expect(buildReminderMessage([deal("DUE0001", today)], today)).not.toContain("Overdue:");
    expect(buildReminderMessage([deal("LATE001", "2026-11-01")], today)).not.toContain("Due today:");
  });

  it("stays short enough for Telegram when many are due", () => {
    const many = Array.from({ length: 120 }, (_, i) => deal(`PLT${String(i).padStart(4, "0")}`, "2026-10-01", 450000, "A Very Long Buyer Name Indeed"));
    const message = buildReminderMessage(many, today)!;
    expect(message.length).toBeLessThan(4096);
    expect(message).toContain("…and 80 more");
  });
});
