import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { cachedPreview } from "@/lib/docs/preview-cache";

const pic = (n: number) => ({ bytes: Buffer.alloc(n, 1), mime: "image/jpeg" });

describe("the photo cache", () => {
  it("fetches a picture once and answers the next ask from memory", async () => {
    const load = vi.fn(async () => pic(100));
    const a = await cachedPreview("t:one:1200", load);
    const b = await cachedPreview("t:one:1200", load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    await cachedPreview("t:one:3000", load); // another size is another picture
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("two people asking at the same moment share one trip", async () => {
    let calls = 0;
    const load = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return pic(50); };
    const [a, b] = await Promise.all([cachedPreview("t:two:1200", load), cachedPreview("t:two:1200", load)]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
  });
  it("a failed trip is not kept: the next ask tries again", async () => {
    let calls = 0;
    const load = async () => { calls++; if (calls === 1) throw new Error("Google was busy"); return pic(10); };
    await expect(cachedPreview("t:three:1200", load)).rejects.toThrow("busy");
    await expect(cachedPreview("t:three:1200", load)).resolves.toBeTruthy();
    expect(calls).toBe(2);
  });
});
