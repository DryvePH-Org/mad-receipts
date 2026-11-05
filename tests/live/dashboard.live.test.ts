import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/deal/settings";

// "use cache" and cacheLife only work inside Next; here they do nothing.
vi.mock("next/cache", () => ({ cacheLife: () => undefined, cacheTag: () => undefined }));

// The REAL buying and sales sheets, read live, through the same code the dashboards use. Prints counts and totals only.
describe("the real sheets", () => {
  it("buy", async () => {
    const { getBuyDashboard } = await import("@/lib/dashboard");
    const b = await getBuyDashboard(DEFAULT_SETTINGS.dashboard);
    const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-US")}`;
    console.info(["BUY", `today=${b.today}`, `todayPurchases=${b.todayPurchases.length}`,
      `month=${b.month?.tab} count=${b.month?.count} total=${peso(b.month?.total ?? 0)} withoutPrice=${b.month?.purchases.filter((p) => p.price === null).length}`,
      `holds(pending)=${b.holds.length} holdAmount=${peso(b.holds.reduce((n, h) => n + (h.holdAmount ?? 0), 0))}`,
      `payables=${b.payables.length} total=${peso(b.payables.reduce((n, p) => n + p.total, 0))}`,
      `madBank=${b.madBank.count} total=${peso(b.madBank.total)}`,
      `scoreboard=${b.scoreboard.map((s) => `${s.name}:${s.bought}`).join(",")}`,
      `sources=${b.sources.map((s) => `${s.source}:${s.count}`).join(",")}`,
      `history=${b.history.map((h) => `${h.month.slice(0, 3)}:${h.count}/${h.bought ?? "-"}`).join(",")}`].join("\n  "));
    expect(b.month).not.toBeNull();
  }, 120_000);

  it("sell", async () => {
    const { getSellDashboard } = await import("@/lib/dashboard");
    const s = await getSellDashboard(DEFAULT_SETTINGS.dashboard);
    const peso = (n: number) => `₱${Math.round(n).toLocaleString("en-US")}`;
    console.info(["SELL", `today=${s.today}`, `releasedToday=${s.releasedToday.length}`, `pending=${s.pending.length} overdue=${s.overdue.length} withDeadline=${s.pending.filter((p) => p.deadline).length}`,
      `goal=${s.goal} releasedThisMonth=${s.releasedThisMonth} releasedAll=${s.released.length} reservedMoney=${peso(s.pending.reduce((n, r) => n + (r.reservation ?? 0), 0))}`,
      `pendingList=${s.pending.map((p) => `${p.tab.slice(0, 4)}:${p.alert}:${p.daysOpen}d`).join(" ")}`,
      `score=${s.score.map((x) => `${x.name}[e${x.entriesMonth} r${x.reservedMonth} s${x.releasedMonth} ${x.conversion ?? "-"}%]`).join(" ")}`,
      `history=${s.history.slice(0, 8).map((h) => `${h.month}:${h.released}`).join(",")}`,
      `entries=${s.entryStatuses.map((e) => `${e.status}:${e.count}`).join(",")}`,
      `kinds=${[...new Set(s.pending.map((p) => p.kind))].join(" | ")}`].join("\n  "));
    expect(s.history.length).toBeGreaterThan(0);
  }, 120_000);
});
