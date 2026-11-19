import { describe, expect, it } from "vitest";
import { createFlow, type TgUpdate } from "@/lib/repairs/bot/flow";
import type { Draft, DraftState } from "@/lib/repairs/bot/draft";
import type { AwaitKind, Person, Ports, Store, Tg } from "@/lib/repairs/bot/ports";
import { hasText, tr } from "@/lib/repairs/bot/texts";
import { ground, nearPlates } from "@/lib/repairs/bot/understand";
import { missingRequired } from "@/lib/repairs/bot/draft";

const GROUP = -100;
const people: Person[] = [
  { tgId: 1, name: "Jun Repairman", role: "repairman", lang: "en" },
  { tgId: 2, name: "Ana Approver", role: "approver", lang: "en" },
];
const reading = (over: Record<string, unknown> = {}) => JSON.stringify({ not_a_report: false, plate: "NAS 3571", year_model: "2017", vehicle: "Mazda CX-5", items: [{ problem: "Flat tire", reported_on: "2026-11-19", solution: "Vulcanize", solution_is_ai: false, supplier: "Mang Jun", company: "", est_timeline: "2026-11-21", timeline_text: "Friday" }], warnings: [], ...over });

function setup(opts: { read?: () => Promise<string> } = {}) {
  const sent: { chat: number; text: string; keyboard: unknown; id: number }[] = [];
  const edits: { id: number; text: string; keyboard: unknown }[] = [];
  const answers: string[] = [];
  let mid = 100;
  const tg: Tg = {
    async send(chat, text, o) { const id = ++mid; sent.push({ chat, text, keyboard: o?.keyboard ?? null, id }); return id; },
    async edit(_c, id, text, kb) { edits.push({ id, text, keyboard: kb ?? null }); },
    async answer(_id, text) { answers.push(text ?? ""); },
    async remove() {},
  };
  const drafts = new Map<string, Draft>(); const awaiting = new Set<string>(); const refs = new Map<string, string | null>(); const seen = new Set<number>();
  const store: Store = {
    async person(id) { return people.find((p) => p.tgId === id) ?? null; },
    async approvers() { return people.filter((p) => p.role !== "repairman"); },
    async setLang() {}, async groupLang() { return null; }, async setGroupLang() {},
    async saveDraft(d) { drafts.set(d.id, structuredClone(d)); },
    async getDraft(id) { const d = drafts.get(id); return d ? structuredClone(d) : null; },
    async claim(id, from, to: DraftState) { const d = drafts.get(id); if (!d || !from.includes(d.state)) return null; d.state = to; return structuredClone(d); },
    async setAwaiting(k: AwaitKind, c, u, ref) { awaiting.add(`${k}:${c}:${u}`); refs.set(`${k}:${c}:${u}`, ref); },
    async takeAwaiting(k: AwaitKind, c, u) { const key = `${k}:${c}:${u}`; if (!awaiting.delete(key)) return undefined; return refs.get(key) ?? null; },
    async hasAwaiting(k: AwaitKind, c, u) { return awaiting.has(`${k}:${c}:${u}`); },
    async firstTime(id) { if (seen.has(id)) return false; seen.add(id); return true; },
    async takeCap() { return true; },
  };
  const saved: Draft[] = []; const decisions: { approve: boolean; by: string; reason: string }[] = [];
  let n = 0;
  const ports: Ports = {
    tg, store, groupChatId: GROUP, defaultLang: "en", today: () => "2026-11-19", nowText: () => "Nov 19, 3:00 PM", newId: () => `d${++n}`, caps: { jobs: 100, voice: 100 },
    read: opts.read ?? (async () => reading()),
    async cars() { return [{ plate: "NAS3571", display: "NAS 3571", label: "Mazda CX-5" }, { plate: "CAS1019", display: "CAS 1019", label: "Toyota Vios" }]; },
    async vocabulary() { return { suppliers: ["Mang Jun"], companies: [] }; },
    async saveReport(d) { saved.push(d); return { ok: true }; },
    async decide(_d, approve, by, reason) { decisions.push({ approve, by: by.name, reason }); return { ok: true }; },
  };
  const flow = createFlow(ports);
  let uid = 0;
  const say = (from: number, text: string, chat = GROUP) => flow.handle({ update_id: ++uid, message: { message_id: ++mid, chat: { id: chat, type: chat === GROUP ? "supergroup" : "private" }, from: { id: from, first_name: "X" }, text } } as TgUpdate);
  const press = (from: number, data: string, onMessage = 100) => flow.handle({ update_id: ++uid, callback_query: { id: `cb${uid}`, from: { id: from, first_name: "X" }, data, message: { message_id: onMessage, chat: { id: GROUP, type: "supergroup" } } } } as TgUpdate);
  return { flow, sent, edits, answers, drafts, saved, decisions, say, press, store };
}

const draftOf = (t: ReturnType<typeof setup>) => [...t.drafts.values()][0];

describe("repairs bot flow", () => {
  it("every message the bot can say exists in all three languages", () => {
    for (const k of ["card.draft_head", "btn.submit", "approval.review", "notify.approved", "msg.reading", "msg.fill_first"]) expect(hasText(k)).toBe(true);
    expect(tr("tl", "btn.submit")).not.toBe(tr("en", "btn.submit"));
  });

  it("a typed report becomes a draft card with the car and the problem, ready to submit", async () => {
    const t = setup();
    await t.say(1, "/report"); await t.say(1, "NAS 3571 flat tire, vulcanize by Mang Jun, Friday");
    const card = t.edits.at(-1)!;
    expect(card.text).toContain("DRAFT REPORT"); expect(card.text).toContain("NAS 3571"); expect(card.text).toContain("Flat tire"); expect(card.text).toContain("found in MAD");
    expect(JSON.stringify(card.keyboard)).toContain(":submit");
    expect(draftOf(t).state).toBe("ready");
  });

  it("ignores ordinary chat in the group (the bot only answers a report started by /report, a voice note or a button)", async () => {
    const t = setup();
    await t.say(1, "good morning everyone");
    expect(t.sent).toHaveLength(0);
  });

  it("a stranger is told to register and nothing is read", async () => {
    const t = setup();
    await t.say(999, "/report");
    expect(t.sent.at(-1)!.text).toContain("not registered");
    expect(t.drafts.size).toBe(0);
  });

  it("the same Telegram update twice is handled once", async () => {
    const t = setup();
    const u = { update_id: 7, message: { message_id: 1, chat: { id: GROUP, type: "supergroup" }, from: { id: 999 }, text: "/report" } } as TgUpdate;
    await t.flow.handle(u); await t.flow.handle(u);
    expect(t.sent).toHaveLength(1);
  });

  it("Submit sends the report for approval once, even when tapped twice", async () => {
    const t = setup();
    await t.say(1, "/report"); await t.say(1, "flat tire");
    const id = draftOf(t).id;
    await Promise.all([t.press(1, `d:${id}:submit`), t.press(1, `d:${id}:submit`)]);
    expect(t.saved).toHaveLength(1);
    expect(draftOf(t).state).toBe("pending");
    const approval = t.sent.find((s) => s.chat === GROUP && s.text.includes("Please review"))!;
    expect(JSON.stringify(approval.keyboard)).toContain(":approve");
  });

  it("will not submit while something required is missing", async () => {
    const t = setup({ read: async () => reading({ plate: "", items: [{ problem: "Flat tire", est_timeline: "" }] }) });
    await t.say(1, "/report"); await t.say(1, "flat tire");
    const id = draftOf(t).id;
    await t.press(1, `d:${id}:submit`);
    expect(t.saved).toHaveLength(0);
    expect(t.answers.at(-1)).toContain("Please fill in first");
  });

  it("an Approver approves: the jobs are decided and the cards and the group follow", async () => {
    const t = setup();
    await t.say(1, "/report"); await t.say(1, "flat tire");
    const id = draftOf(t).id;
    await t.press(1, `d:${id}:submit`);
    await t.press(2, `a:${id}:approve`);
    expect(t.decisions).toEqual([{ approve: true, by: "Ana Approver", reason: "" }]);
    expect(draftOf(t).state).toBe("approved");
    expect(t.sent.at(-1)!.text).toContain("was approved by Ana Approver");
  });

  it("a repairman cannot approve", async () => {
    const t = setup();
    await t.say(1, "/report"); await t.say(1, "flat tire");
    const id = draftOf(t).id;
    await t.press(1, `d:${id}:submit`);
    await t.press(1, `a:${id}:approve`);
    expect(t.decisions).toHaveLength(0);
    expect(t.answers.at(-1)).toContain("Only approvers");
  });

  it("a rejection needs the reason, then the repairman can fix and send it again", async () => {
    const t = setup();
    await t.say(1, "/report"); await t.say(1, "flat tire");
    const id = draftOf(t).id;
    await t.press(1, `d:${id}:submit`);
    await t.press(2, `a:${id}:reject`);
    expect(t.sent.at(-1)!.text).toContain("why are you rejecting");
    await t.say(2, "wrong plate");
    expect(t.decisions).toEqual([{ approve: false, by: "Ana Approver", reason: "wrong plate" }]);
    expect(draftOf(t).state).toBe("rejected");
    await t.press(1, `d:${id}:fix`);
    expect(draftOf(t).state).toBe("ready");
    expect(draftOf(t).round).toBe(2);
    await t.press(1, `d:${id}:submit`);
    expect(t.saved.map((d) => d.round)).toEqual([1, 2]);
  });

  it("an Approver who reports gets asked before approving their own report", async () => {
    const t = setup();
    await t.say(2, "/report"); await t.say(2, "flat tire");
    const id = draftOf(t).id;
    await t.press(2, `d:${id}:submit`);
    expect(t.edits.at(-1)!.text).toContain("approve your own report");
    await t.press(2, `d:${id}:selfok`);
    expect(draftOf(t).state).toBe("approved");
    expect(draftOf(t).selfApproved).toBe(true);
  });

  it("a report that cannot be read shows what was heard and a Try again button", async () => {
    const t = setup({ read: async () => { throw new Error("busy"); } });
    await t.say(1, "/report"); await t.say(1, "flat tire sa NAS 3571");
    const card = t.edits.at(-1)!;
    expect(card.text).toContain("flat tire sa NAS 3571"); expect(JSON.stringify(card.keyboard)).toContain(":redo");
    expect(draftOf(t).state).toBe("failed");
  });

  it("a correction changes the draft and keeps the rest", async () => {
    const t = setup();
    await t.say(1, "/report"); await t.say(1, "flat tire");
    const id = draftOf(t).id;
    await t.press(1, `d:${id}:edit`);
    await t.say(1, "plate is CAS 1019");
    expect(draftOf(t).state).toBe("ready");
  });
});

describe("understanding checks against MAD's cars", () => {
  const cars = [{ plate: "NAS3571", display: "NAS 3571", label: "Mazda CX-5" }, { plate: "CAS1019", display: "CAS 1019", label: "Toyota Vios" }];
  const base = { not_a_report: false, plate: "", year_model: "", vehicle: "", inventory_found: false, items: [], warnings: [] as string[] };
  it("fills the car from a known plate", () => {
    expect(ground({ ...base, plate: "NAS3571" }, cars)).toMatchObject({ plate: "NAS 3571", vehicle: "Mazda CX-5", inventory_found: true });
  });
  it("warns when the said car is not the plate's car", () => {
    expect(ground({ ...base, plate: "CAS 1019", vehicle: "Honda City" }, cars).warnings.join(" ")).toContain("Toyota Vios");
  });
  it("suggests the nearest plate when it is not found (one letter off)", () => {
    expect(nearPlates("NAS 3517", cars)).toEqual([]);
    expect(nearPlates("NAS 3572", cars).map((c) => c.plate)).toEqual(["NAS3571"]);
    expect(ground({ ...base, plate: "NAS 3572" }, cars).warnings.join(" ")).toContain("NAS 3571");
  });
  it("needs the plate, the car, a problem and when", () => {
    expect(missingRequired(base).map(([c]) => c)).toEqual(["plate", "car", "problem_any"]);
  });
});
