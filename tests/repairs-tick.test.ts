import { describe, expect, it, vi } from "vitest";
import { renderReminder } from "@/lib/repairs/bot/cards";

vi.mock("server-only", () => ({}));
const { overdueByCar, reminderHours } = await import("@/lib/repairs/bot/tick");

const job = (id: string, plate: string, due: string, overdue: boolean) => ({ jobId: id, key: null, plate, car: "2019 Toyota Vios", problem: `Problem ${id}`, supplier: "LMR", due, overdue });

describe("repairs reminders", () => {
  it("reminds at 8, 12 and 16 by default", () => {
    expect(reminderHours()).toEqual([8, 12, 16]);
    expect(reminderHours(9, 17, 2)).toEqual([9, 11, 13, 15]);
  });
  it("groups the overdue jobs by car, with the days late, and leaves out muted and not-late jobs", () => {
    const cars = overdueByCar([job("a", "CAS1019", "2026-11-10", true), job("b", "CAS1019", "2026-11-18", true), job("c", "NAS3571", "2026-11-25", false), job("d", "NAS3571", "2026-11-01", true)], "2026-11-19", new Set(["d"]));
    expect([...cars.keys()]).toEqual(["CAS1019"]);
    expect(cars.get("CAS1019")!.map((j) => j.daysLate)).toEqual([9, 1]);
  });
  it("the reminder card has Done and Mute for each job and names who reported", () => {
    const card = renderReminder("CAS1019", [{ ...job("a", "CAS1019", "2026-11-10", true), daysLate: 9 }], "en", "Jun");
    expect(card.text).toContain("OVERDUE JOBS"); expect(card.text).toContain("9 days late"); expect(card.text).toContain("Jun");
    expect(JSON.stringify(card.keyboard)).toContain("j:a:ask"); expect(JSON.stringify(card.keyboard)).toContain("j:a:mute");
  });
});
