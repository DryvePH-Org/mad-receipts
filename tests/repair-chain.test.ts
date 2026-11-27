import { describe, expect, it } from "vitest";
import { askButtons, askText, decidedText, isDue, parseAskCallback, pickNext, waitFor, type ChainPerson } from "@/lib/repairs/chain";

const p = (userId: string, chatId: number | null, waitMinutes = 120): ChainPerson => ({ userId, name: userId.toUpperCase(), position: 1, waitMinutes, chatId });
const chain = [p("a", 1), p("b", 2, 60), p("c", 3)];

describe("the repair approval chain", () => {
  it("asks the first person first, then the next, and goes round", () => {
    expect(pickNext(chain, null)?.userId).toBe("a");
    expect(pickNext(chain, "a")?.userId).toBe("b");
    expect(pickNext(chain, "c")?.userId).toBe("a");
  });
  it("skips someone who has not connected Telegram", () => {
    const c = [p("a", 1), p("b", null), p("c", 3)];
    expect(pickNext(c, "a")?.userId).toBe("c");
    expect(pickNext([p("a", null), p("b", null)], null)).toBeNull();
    expect(pickNext([], null)).toBeNull();
  });
  it("starts again from the top when the last person left the chain", () => {
    expect(pickNext(chain, "gone")?.userId).toBe("a");
  });
  it("waits as long as the person last asked was given", () => {
    expect(waitFor(chain, "b")).toBe(60);
    expect(waitFor(chain, "gone")).toBe(120);
    const t = new Date("2026-11-27T10:00:00Z");
    expect(isDue(t, 120, new Date("2026-11-27T11:59:00Z"))).toBe(false);
    expect(isDue(t, 120, new Date("2026-11-27T12:00:00Z"))).toBe(true);
  });
  it("the message names the car and the problems, and the second ask says why it came", () => {
    const r = { plate: "NBA9058", vehicle: "TOYOTA INNOVA", problems: ["Aircon not cold", "Brake pads"], reportedBy: "Noel" };
    const first = askText(r, 1, 120, "Aaron");
    expect(first).toContain("NBA9058 · TOYOTA INNOVA");
    expect(first).toContain("• Brake pads");
    expect(first).toContain("2 hours");
    const second = askText(r, 2, 120, "Karl");
    expect(second).toContain("Still waiting");
    expect(second).not.toContain("the next person in line is asked");
  });
  it("the buttons carry the ask and read back", () => {
    const id = "0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0";
    const kb = askButtons(id, "https://x/repairs").inline_keyboard;
    const data = kb.flat().flatMap((b) => ("callback_data" in b ? [b.callback_data] : []));
    expect(data.every((d) => d.length <= 64)).toBe(true);
    expect(data.map((d) => parseAskCallback(d)?.action)).toEqual(["ok", "okd", "no"]);
    expect(parseAskCallback("ra:nope:ok")).toBeNull();
    expect(parseAskCallback(undefined)).toBeNull();
  });
  it("the decision is written under the message", () => {
    expect(decidedText("X", true, "Aaron", "")).toBe("X\n\n✅ Approved by Aaron");
    expect(decidedText("X", false, "Aaron", "too costly")).toBe("X\n\n❌ Rejected by Aaron: too costly");
  });
});
