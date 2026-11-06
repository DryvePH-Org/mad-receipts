import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => undefined, cacheTag: () => undefined }));
vi.mock("server-only", () => ({}));

const csv = (text: string) => new Response(text, { status: 200 });
const htmlTabs = (names: string[]) => csv(names.map((n, i) => `items.push({name: "${n}", pageUrl: "x", gid: "${i + 1}"});`).join("\n"));
const router = (map: Record<string, () => Response>) => vi.fn(async (url: string) => {
  const hit = Object.entries(map).find(([k]) => url.includes(k));
  if (!hit) throw new Error("no route " + url);
  return hit[1]();
});

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("reading the sheets safely", () => {
  it("keeps the last good copy, and says it is old, when Google cannot be reached", async () => {
    let down = false;
    vi.stubGlobal("fetch", router({ htmlview: () => (down ? new Response("", { status: 503 }) : htmlTabs(["HOLD"])), "sheet=HOLD": () => (down ? new Response("", { status: 503 }) : csv("a,b\n1,2")) }));
    const { readTabs } = await import("@/lib/dashboard/sheets");
    const fresh = await readTabs("sheetA", ["HOLD"]);
    expect(fresh.tabs[0].rows).toEqual([["a", "b"], ["1", "2"]]);
    expect(fresh.notes).toEqual({ failed: [], staleSince: null });
    down = true;
    const old = await readTabs("sheetA", ["HOLD"]);
    expect(old.tabs[0].rows).toEqual([["a", "b"], ["1", "2"]]);
    expect(old.notes.staleSince).not.toBeNull();
  });

  it("reports a tab it could not read instead of showing it as empty", async () => {
    vi.stubGlobal("fetch", router({ htmlview: () => htmlTabs(["A", "B"]), "sheet=A": () => csv("x\n1"), "sheet=B": () => new Response("", { status: 404 }) }));
    const { readTabs } = await import("@/lib/dashboard/sheets");
    const r = await readTabs("sheetB", ["A", "B", "NoSuchTab"]);
    expect(r.tabs.map((t) => t.tab)).toEqual(["A"]);
    expect(r.notes.failed).toEqual(["B"]); // a tab that does not exist is simply skipped, one that fails is reported
  });

  it("tries again once when Google hiccups, and not at all when the sheet is private", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", router({ htmlview: () => (++calls === 1 ? new Response("", { status: 500 }) : htmlTabs(["A"])) }));
    const { listTabInfo } = await import("@/lib/dashboard/sheets");
    expect((await listTabInfo("sheetC"))[0].name).toBe("A");
    expect(calls).toBe(2);
    vi.resetModules();
    let privateCalls = 0;
    vi.stubGlobal("fetch", router({ htmlview: () => { privateCalls++; return new Response("", { status: 403 }); } }));
    const again = await import("@/lib/dashboard/sheets");
    await expect(again.listTabInfo("sheetD")).rejects.toThrow(/shared as/);
    expect(privateCalls).toBe(1);
  });

  it("refuses an answer that is far too large", async () => {
    vi.stubGlobal("fetch", router({ htmlview: () => new Response("x", { status: 200, headers: { "content-length": String(50 * 1024 * 1024) } }) }));
    const { listTabInfo } = await import("@/lib/dashboard/sheets");
    await expect(listTabInfo("sheetE")).rejects.toThrow(/far more data/);
  });
});

describe("the new year", () => {
  it("in January a December reservation is still found (last year's tabs are read too)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-10T02:00:00Z"));
    const row = (cells: Record<number, string>) => Array.from({ length: 30 }, (_, i) => (cells[i] ?? "").replace(/,/g, "")).join(",");
    const head = row({ 1: "SALESMAN", 7: "PLATE" });
    const dec = [head, row({ 1: "JUAN", 4: "TOYOTA", 5: "VIOS", 7: "ZZT 123", 10: "500000", 12: "20000", 13: "December 20", 22: "480000", 26: "RESERVATION", 27: "ZZT Buyer" })].join("\n");
    vi.stubGlobal("fetch", router({ htmlview: () => htmlTabs(["Dec2026_Sold", "Jan2027_Sold", "Jan2027_Entries"]), "sheet=Dec2026_Sold": () => csv(dec), "sheet=Jan2027_Sold": () => csv(head), "sheet=Jan2027_Entries": () => csv("") }));
    const { getSellDashboard } = await import("@/lib/dashboard");
    const { DEFAULT_SETTINGS } = await import("@/lib/deal/settings");
    const d = await getSellDashboard(DEFAULT_SETTINGS.dashboard);
    vi.useRealTimers();
    expect(d.pending.map((p) => p.plate)).toEqual(["ZZT123"]);
    expect(d.pending[0].alert).toBe("overdue");
    expect(d.notes.failed).toEqual([]);
  });
});
