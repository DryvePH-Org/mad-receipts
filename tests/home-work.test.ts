import { describe, expect, it } from "vitest";
import { queuePosition, sortWork, workState, type QueueJob, type WorkInput, type WorkItem } from "@/lib/home/work";

const base: WorkInput = { stage: "out", pending: 0, failed: 0, job: null, placed: 3, needed: 3, flagged: 0, approved: false };
const job = (o: Partial<QueueJob> = {}): QueueJob => ({ action: "docs_scan_out", bot: "scan_out", status: "queued", priority: 0, createdAt: "2026-11-27T10:00:00Z", plate: "AAA1111", ...o });

describe("where a waiting scan is in its line", () => {
  it("counts the scans of the same bot that run now or came first", () => {
    const mine = job({ createdAt: "2026-11-27T10:05:00Z" });
    const active = [job({ status: "sent" }), job({ createdAt: "2026-11-27T10:01:00Z" }), mine, job({ createdAt: "2026-11-27T10:09:00Z" }), job({ bot: "scan", createdAt: "2026-11-27T09:00:00Z" })];
    expect(queuePosition(active, mine)).toBe(3); // one running, one before it
    expect(queuePosition(active, active[0])).toBe(1);
    expect(queuePosition([mine], mine)).toBe(1);
  });
  it("a higher priority goes first", () => {
    const a = job({ priority: 8, createdAt: "2026-11-27T10:09:00Z" }), b = job({ createdAt: "2026-11-27T10:00:00Z" });
    expect(queuePosition([a, b], b)).toBe(2);
  });
});

describe("the steps of a person's own work", () => {
  it("photos waiting in line: Uploaded, with the place in line", () => {
    const s = workState({ ...base, pending: 3, placed: 0, job: { status: "queued", position: 3 } });
    expect([s.step, s.label, s.active, s.done, s.tone]).toEqual(["uploaded", "Waiting: 3rd in line", true, false, "amber"]);
    expect(workState({ ...base, pending: 1, job: { status: "queued", position: 1 } }).label).toBe("Waiting: next in line");
    expect(workState({ ...base, pending: 2 }).label).toBe("Photos sent"); // the scan has not started yet
  });
  it("being scanned: the bot is on it", () => {
    const s = workState({ ...base, pending: 2, job: { status: "sent", position: 1 } });
    expect([s.step, s.label, s.active, s.tone]).toEqual(["scanning", "Being scanned", true, "blue"]);
    expect(s.detail).toContain("The OUT scanner is reading 2 photos");
    expect(s.steps.map((x) => x.state)).toEqual(["done", "now", "later", "later"]);
  });
  it("read with everything in: waiting for the right person to approve", () => {
    const s = workState(base);
    expect([s.step, s.label, s.tone, s.active, s.done]).toEqual(["read", "Read: 3 of 3 papers in", "emerald", false, false]);
    expect(s.detail).toBe("Waiting for Sales to approve.");
    expect(workState({ ...base, stage: "in", needed: 4, placed: 4 }).detail).toBe("Waiting for Buying to approve.");
    expect(workState({ ...base, stage: "transfer", needed: 4, placed: 4 }).detail).toBe("Waiting for Documentation to approve.");
  });
  it("read with something to check or missing: says what", () => {
    const s = workState({ ...base, placed: 2, flagged: 1 });
    expect([s.tone, s.detail]).toEqual(["amber", "1 photo to check. 1 paper still needed."]);
  });
  it("a photo that could not be read needs a look", () => {
    const s = workState({ ...base, failed: 2, placed: 1 });
    expect([s.label, s.tone, s.active]).toEqual(["Needs a look", "red", false]);
  });
  it("approved is done; new photos after an approval are work again", () => {
    const s = workState({ ...base, approved: true });
    expect([s.step, s.done, s.tone]).toEqual(["approved", true, "emerald"]);
    expect(s.steps.map((x) => x.state)).toEqual(["done", "done", "done", "done"]);
    expect(workState({ ...base, approved: true, pending: 1 }).done).toBe(false);
  });
});

describe("the list", () => {
  it("unfinished work first, newest first, and the finished apart", () => {
    const item = (plate: string, lastAt: string, approved: boolean): WorkItem => ({ plate, plateDisplay: plate, car: plate, stage: "out", photos: 3, lastAt, state: workState({ ...base, approved }) });
    const { open, done } = sortWork([item("A", "2026-11-27T08:00:00Z", false), item("B", "2026-11-27T09:00:00Z", true), item("C", "2026-11-27T10:00:00Z", false)]);
    expect(open.map((x) => x.plate)).toEqual(["C", "A"]);
    expect(done.map((x) => x.plate)).toEqual(["B"]);
  });
});
