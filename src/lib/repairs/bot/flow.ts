import { RULE, type Keyboard, approvalKeyboard, confirmDoneKeyboard, draftKeyboard, renderOpen, renderUpdate, updateKeyboard, esc, failedKeyboard, fixKeyboard, missText, renderDraft, renderStatus, selfApproveKeyboard, carName } from "./cards";
import { missingRequired, type Draft } from "./draft";
import type { Ports, Person } from "./ports";
import { isLang, LANG_NAMES, LANGS, tr, type Lang } from "./texts";
import { ground, understand } from "./understand";

// The bot's behaviour, the same the repairmen know: a voice note or text in the group becomes a draft card (Submit, Edit, Read again, Cancel);
// a submitted report waits for an Approver, who approves or rejects it here or on the Repairs page; a rejected report can be fixed and sent again.

export interface TgUser { id: number; first_name?: string; last_name?: string; username?: string }
export interface TgMessage { message_id: number; chat: { id: number; type: string }; from?: TgUser; text?: string; voice?: { file_id: string; duration?: number }; reply_to_message?: unknown }
export interface TgCallback { id: string; from: TgUser; data?: string; message?: TgMessage }
export interface TgUpdate { update_id: number; message?: TgMessage; callback_query?: TgCallback }

const fullName = (u: TgUser) => [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "Someone";
const label = (d: Draft) => `${d.data?.plate ?? ""} ${d.data ? carName(d.data) : ""}`.trim() || "this report";
const mention = (p: Pick<Person, "tgId" | "name">) => `<a href="tg://user?id=${p.tgId}">${esc(p.name)}</a>`;

export function createFlow(ports: Ports) {
  const { tg, store } = ports;
  const langOf = async (tgId: number): Promise<Lang> => (await store.person(tgId))?.lang ?? ports.defaultLang;
  const groupLang = async (): Promise<Lang> => (await store.groupLang()) ?? ports.defaultLang;
  const inScope = (m: TgMessage) => m.chat.id === ports.groupChatId || m.chat.type === "private";
  const safeEdit = async (chatId: number, messageId: number | null, text: string, kb?: Parameters<typeof tg.edit>[3]) => {
    if (messageId === null) return;
    try { await tg.edit(chatId, messageId, text, kb ?? null); } catch { /* the card may be gone or unchanged: nothing to do */ }
  };
  const tell = (chatId: number, text: string, replyTo?: number | null, keyboard?: Keyboard | null) => tg.send(chatId, text, { replyTo, keyboard }).catch(() => 0);

  // ---------------------------------------------------------------- reading a report
  async function runParse(draft: Draft, instruction = ""): Promise<void> {
    const L = await langOf(draft.ownerId);
    if (!(await store.takeCap("jobs", ports.caps.jobs))) { await safeEdit(draft.chatId, draft.cardId, `⚠️ ${tr(L, "msg.daily_cap")}`); return; }
    draft.state = "parsing";
    await store.saveDraft(draft);
    await safeEdit(draft.chatId, draft.cardId, tr(L, "msg.reading"));
    try {
      const [cars, vocab, open] = await Promise.all([ports.cars(), ports.vocabulary(), instruction ? Promise.resolve([]) : ports.openJobs()]);
      const openJobs = open.map((j, i) => ({ ref: `J${i + 1}`, jobId: j.jobId, plate: j.plate, problem: j.problem }));
      const got = await understand(ports.read, { transcript: draft.transcript, today: ports.today(), currentDraft: instruction ? draft.data : null, instruction, openJobs }, vocab);
      if (got.kind === "update") {
        // the car comes from the jobs the updates matched (not from the words): one car is named, several cars are warned about
        const matched = got.update.updates.map((u) => open.find((j) => j.jobId === u.jobId)).filter((j): j is NonNullable<typeof j> => !!j);
        const plates = [...new Set(matched.map((j) => j.plate))];
        if (plates.length === 1) { got.update.plate = plates[0]; got.update.year_model = ""; got.update.vehicle = matched[0].car; }
        else if (plates.length > 1) got.update.warnings.push(`These updates are for more than one car (${plates.join(", ")}). Check each one.`);
        draft.kind = "update"; draft.update = got.update; draft.data = null; draft.state = "ready";
        await store.saveDraft(draft);
        await safeEdit(draft.chatId, draft.cardId, renderUpdate(draft, L), updateKeyboard(draft, L));
        return;
      }
      const raw = got.report;
      draft.kind = "report";
      if (raw.not_a_report) { draft.state = "cancelled"; await store.saveDraft(draft); await safeEdit(draft.chatId, draft.cardId, tr(L, "msg.not_report")); return; }
      draft.data = ground(raw, cars);
      draft.state = "ready";
      await store.saveDraft(draft);
      await safeEdit(draft.chatId, draft.cardId, renderDraft(draft, L), draftKeyboard(draft, L));
    } catch (e) {
      draft.state = "failed";
      await store.saveDraft(draft);
      await safeEdit(draft.chatId, draft.cardId, `❌ ${tr(L, "msg.read_failed", { why: esc((e instanceof Error ? e.message : "unknown").slice(0, 100)), heard: esc(draft.transcript.slice(0, 600)) })}`, failedKeyboard(draft, L));
    }
  }

  async function startDraft(m: TgMessage, p: Person, text: string): Promise<void> {
    const L = p.lang ?? ports.defaultLang;
    const draft: Draft = { id: ports.newId(), ownerId: p.tgId, ownerName: p.name, chatId: m.chat.id, transcript: text, data: null, cardId: null, state: "parsing", kind: "report", approvalId: null, decidedBy: "", decidedById: 0, decidedAt: "", comment: "", selfApproved: false, round: 1, pendingAt: 0, nudgedAt: 0, createdAt: Date.now() };
    draft.cardId = await tg.send(m.chat.id, tr(L, "msg.reading"), { replyTo: m.message_id });
    await store.saveDraft(draft);
    await runParse(draft);
  }

  /** A person's words arrived (typed or heard): a reason for a rejection, a correction, or a new report. */
  async function handleInput(m: TgMessage, p: Person, text: string): Promise<void> {
    const L = p.lang ?? ports.defaultLang;
    const rejectRef = await store.takeAwaiting("reject", m.chat.id, p.tgId);
    if (rejectRef) {
      const d = await store.getDraft(rejectRef);
      if (!d || p.role === "repairman") return;
      await decide(d, false, p, text);
      return;
    }
    const editRef = await store.takeAwaiting("edit", m.chat.id, p.tgId);
    const draft = editRef ? await store.getDraft(editRef) : null;
    if (draft && draft.state === "ready") {
      await safeEdit(draft.chatId, draft.cardId, tr(L, "msg.updating"));
      await runParse(draft, text);
      return;
    }
    await startDraft(m, p, text);
  }

  // ---------------------------------------------------------------- approval
  /** The report's problems become pending jobs and the Approvers are asked. Two taps on Submit can never both go through (the draft moves to pending once). */
  async function sendForApproval(d: Draft): Promise<boolean> {
    const won = await store.claim(d.id, ["ready"], "pending");
    if (!won) return false;
    const L = await langOf(d.ownerId);
    const saved = await ports.saveReport(won);
    if (!saved.ok) { await store.claim(d.id, ["pending"], "ready"); await tg.send(d.chatId, `❌ ${esc(saved.error)}`, { replyTo: d.cardId }).catch(() => 0); return false; }
    d = won; d.pendingAt = Date.now();
    const GL = await groupLang();
    const approvers = await store.approvers();
    const who = approvers.filter((a) => a.tgId !== d.ownerId).map(mention).join(" ");
    d.approvalId = await tell(ports.groupChatId, `${tr(GL, "approval.review", { who })}\n\n${renderStatus(d, GL)}`, null, approvalKeyboard(d, GL));
    await store.saveDraft(d);
    await safeEdit(d.chatId, d.cardId, renderStatus(d, L));
    return true;
  }

  /** Approve or reject: the first decision wins. Everyone's card follows. */
  async function decide(d: Draft, approve: boolean, by: Person, reason: string): Promise<void> {
    const won = await store.claim(d.id, ["pending"], approve ? "approved" : "rejected");
    const L = await langOf(by.tgId);
    if (!won) { await tell(ports.groupChatId, tr(L, "approval.already_msg", { who: esc((await store.getDraft(d.id))?.decidedBy || "-") }), d.approvalId); return; }
    const r = await ports.decide(won, approve, { name: by.name, tgId: by.tgId }, reason);
    if (!r.ok) { await store.claim(d.id, ["approved", "rejected"], "pending"); await tell(ports.groupChatId, `❌ ${esc(r.error)}`, d.approvalId); return; }
    won.decidedBy = by.name; won.decidedById = by.tgId; won.decidedAt = ports.nowText(); won.comment = reason.trim().slice(0, 300); won.selfApproved = approve && by.tgId === won.ownerId;
    await store.saveDraft(won);
    await finishDecision(won);
  }

  /** Cards follow a decision (also used when the Approver decided on the Repairs page). */
  async function finishDecision(d: Draft): Promise<void> {
    const OL = await langOf(d.ownerId), GL = await groupLang();
    await safeEdit(d.chatId, d.cardId, renderStatus(d, OL), d.state === "rejected" ? fixKeyboard(d, OL) : null);
    if (d.approvalId) await safeEdit(ports.groupChatId, d.approvalId, renderStatus(d, GL));
    const owner = await store.person(d.ownerId);
    const ownerMention = owner ? mention(owner) : esc(d.ownerName);
    const text = d.state === "approved"
      ? (d.selfApproved ? `✅ ${tr(GL, "notify.self_approved", { by: esc(d.decidedBy), label: esc(label(d)) })}` : `✅ ${tr(GL, "notify.approved", { owner: ownerMention, label: esc(label(d)), by: esc(d.decidedBy) })}`)
      : `❌ ${tr(GL, "notify.rejected", { owner: ownerMention, label: esc(label(d)), by: esc(d.decidedBy), why: esc(d.comment) })}`;
    await tell(ports.groupChatId, text, d.cardId);
  }

  // ---------------------------------------------------------------- open jobs
  async function showOpen(chatId: number, p: Person, plateText: string, replyTo?: number | null): Promise<void> {
    const L = p.lang ?? ports.defaultLang;
    const plate = plateText.toUpperCase().replace(/[^A-Z0-9]/g, "");
    let jobs;
    try { jobs = await ports.openJobs(plate || undefined); } catch (e) { await tg.send(chatId, `❌ ${tr(L, "open.failed", { why: esc(e instanceof Error ? e.message.slice(0, 80) : "error") })}`, { replyTo }); return; }
    const out = renderOpen(jobs, L, plateText.trim().toUpperCase());
    await tg.send(chatId, out.text, { replyTo });
    for (const card of out.keyboards) await tg.send(chatId, card.text, { keyboard: card.keyboard });
  }

  // ---------------------------------------------------------------- messages
  async function menu(m: TgMessage, p: Person): Promise<void> {
    const L = p.lang ?? ports.defaultLang;
    await tg.send(m.chat.id, `<b>${tr(L, "menu.title")}</b>`, { replyTo: m.message_id, keyboard: { inline_keyboard: [[{ text: tr(L, "menu.report"), callback_data: "m:report" }], [{ text: tr(L, "menu.help"), callback_data: "m:help" }, { text: tr(L, "menu.whoami"), callback_data: "m:whoami" }], [{ text: tr(L, "menu.language"), callback_data: "m:language" }]] } });
  }
  const helpText = (L: Lang, p: Person) => [`<b>${tr(L, "help.title")}</b>`, tr(L, "help.report"), tr(L, "help.update"), "", tr(L, "help.help"), tr(L, "help.menu"), tr(L, "help.whoami"), tr(L, "help.language")].join("\n") + (p.role === "admin" ? "" : "");
  const languageKeyboard = (L: Lang, group: boolean) => ({ inline_keyboard: [LANGS.map((c) => ({ text: LANG_NAMES[c], callback_data: `l:u:${c}` })), ...(group ? [LANGS.map((c) => ({ text: tr(L, "lang.group_btn", { name: LANG_NAMES[c] }), callback_data: `l:g:${c}` }))] : [])] });

  async function onMessage(m: TgMessage): Promise<void> {
    if (!m.from || !inScope(m)) return;
    const person = await store.person(m.from.id);
    const text = (m.text ?? "").trim();
    const L = person?.lang ?? ports.defaultLang;
    if (text.startsWith("/")) {
      const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, "");
      if (cmd === "/whoami") { await tg.send(m.chat.id, `Telegram ID: <code>${m.from.id}</code>\n${tr(L, `role.${person?.role ?? "none"}`)}`, { replyTo: m.message_id }); return; }
      if (!person) { await tg.send(m.chat.id, tr(L, "not_registered"), { replyTo: m.message_id }); return; }
      if (cmd === "/start") { await tg.send(m.chat.id, `${tr(L, "welcome.hi", { name: esc(person.name), roles: tr(L, `role.${person.role}`) })}\n${tr(L, "welcome.report")}`, { replyTo: m.message_id }); await menu(m, person); }
      else if (cmd === "/help") await tg.send(m.chat.id, helpText(L, person), { replyTo: m.message_id });
      else if (cmd === "/menu") await menu(m, person);
      else if (cmd === "/language") await tg.send(m.chat.id, tr(L, "lang.choose", { cur: LANG_NAMES[L] }), { replyTo: m.message_id, keyboard: languageKeyboard(L, person.role === "admin" && m.chat.type !== "private") });
      else if (cmd === "/open") await showOpen(m.chat.id, person, text.split(/\s+/).slice(1).join(" "), m.message_id);
      else if (cmd === "/report") { await store.setAwaiting("text", m.chat.id, person.tgId, null); await tg.send(m.chat.id, tr(L, "report_prompt"), { replyTo: m.message_id }); }
      return;
    }
    if (!person) { if (m.voice) await tg.send(m.chat.id, tr(L, "not_registered"), { replyTo: m.message_id }); return; }
    if (m.voice) {
      if (!ports.transcribe) { await tg.send(m.chat.id, `❌ ${tr(L, "msg.not_set_up")}`, { replyTo: m.message_id }); return; }
      if (m.voice.duration && m.voice.duration > 180) { await tg.send(m.chat.id, `⚠️ ${tr(L, "msg.too_long")}`, { replyTo: m.message_id }); return; }
      if (!(await store.takeCap("voice", ports.caps.voice))) { await tg.send(m.chat.id, `⚠️ ${tr(L, "msg.daily_cap")}`, { replyTo: m.message_id }); return; }
      const note = await tg.send(m.chat.id, tr(L, "msg.listening"), { replyTo: m.message_id });
      let heard = "";
      try { heard = await ports.transcribe(m.voice.file_id, m.voice.duration); } catch { await safeEdit(m.chat.id, note, `❌ ${tr(L, "msg.no_hear")}`); return; }
      if (heard.trim().length < 4) { await safeEdit(m.chat.id, note, `⚠️ ${tr(L, "msg.no_catch")}`); return; }
      await tg.remove(m.chat.id, note).catch(() => undefined);
      await handleInput(m, person, heard.trim().slice(0, 4000));
      return;
    }
    if (!text) return;
    const waitingReject = await store.hasAwaiting("reject", m.chat.id, person.tgId);
    if (waitingReject) { if (person.role !== "repairman") await handleInput(m, person, text.slice(0, 600)); return; }
    if (await store.hasAwaiting("edit", m.chat.id, person.tgId) || await store.hasAwaiting("text", m.chat.id, person.tgId)) {
      await store.takeAwaiting("text", m.chat.id, person.tgId);
      await handleInput(m, person, text.slice(0, 4000));
    }
  }

  // ---------------------------------------------------------------- buttons
  async function onCallback(c: TgCallback): Promise<void> {
    const m = c.message;
    const ack = (text?: string, alert = false) => tg.answer(c.id, text, alert).catch(() => undefined);
    if (!m || !c.data || !(m.chat.id === ports.groupChatId || m.chat.type === "private")) return ack();
    const person = await store.person(c.from.id);
    if (!person) return ack(tr(ports.defaultLang, "not_registered"), true);
    const L = person.lang ?? ports.defaultLang;
    const [kind, a, b] = c.data.split(":");

    if (kind === "l") {
      if (!isLang(b)) return ack();
      if (a === "g") { if (person.role !== "admin") return ack(tr(L, "admin_only"), true); await store.setGroupLang(b); await ack(); await tg.send(m.chat.id, tr(b, "lang.group_saved", { name: LANG_NAMES[b] })); return; }
      await store.setLang(person.tgId, b); await ack(); await tg.send(m.chat.id, tr(b, "lang.saved", { name: LANG_NAMES[b] })); return;
    }
    if (kind === "m") {
      await ack();
      if (a === "report") { await store.setAwaiting("text", m.chat.id, person.tgId, null); await tg.send(m.chat.id, tr(L, "report_prompt")); }
      else if (a === "help") await tg.send(m.chat.id, helpText(L, person));
      else if (a === "open") await showOpen(m.chat.id, person, "");
      else if (a === "whoami") await tg.send(m.chat.id, `Telegram ID: <code>${person.tgId}</code>\n${tr(L, `role.${person.role}`)}`);
      else if (a === "language") await tg.send(m.chat.id, tr(L, "lang.choose", { cur: LANG_NAMES[L] }), { keyboard: languageKeyboard(L, person.role === "admin" && m.chat.type !== "private") });
      return;
    }
    if (kind === "j") {
      const job = (await ports.openJobs()).find((j) => j.jobId === a);
      if (b === "mute") { await store.mute(a, ports.today()); await ack(); await tg.send(m.chat.id, tr(L, "job.muted")); return; }
      if (b === "no") { await ack(); await tg.send(m.chat.id, tr(L, "job.left_open")); return; }
      if (!job) return ack(tr(L, "open.none"), true);
      if (b === "ask") { await ack(); await tg.send(m.chat.id, tr(L, "job.ask", { what: `${esc(job.problem)} (<code>${esc(job.plate)}</code>)` }), { keyboard: confirmDoneKeyboard(job.jobId, L) }); return; }
      if (b === "yes") {
        await ack();
        const r = await ports.markDone(job.jobId, { name: person.name });
        await tg.send(m.chat.id, r.ok ? `✅ <b>${tr(L, "job.marked_done")}</b>\n${RULE}\n<b>${tr(L, "job.job")}:</b>  ${esc(job.problem)}\n<b>${tr(L, "card.plate")}:</b>  <code>${esc(job.plate)}</code>` : `❌ ${tr(L, "job.failed", { why: esc(r.error.slice(0, 100)) })}`);
        return;
      }
      return ack();
    }
    const draft = a ? await store.getDraft(a) : null;
    if (!draft) return ack(tr(L, kind === "a" ? "approval.gone" : "msg.draft_expired"), true);

    if (kind === "a") {
      if (person.role === "repairman") return ack(tr(L, "approval.only_approvers"), true);
      if (draft.state !== "pending") return ack(tr(L, "approval.already", { who: draft.decidedBy || "-" }), true);
      if (b === "approve") { await ack(); await decide(draft, true, person, ""); return; }
      if (b === "reject") { await store.setAwaiting("reject", m.chat.id, person.tgId, draft.id); await ack(); await tg.send(m.chat.id, tr(L, "approval.why_reject", { name: esc(person.name.split(" ")[0]) }), { replyTo: m.message_id }); return; }
      return ack();
    }

    // draft buttons: only the person who sent the report (or an admin)
    if (person.tgId !== draft.ownerId && person.role !== "admin") return ack(tr(L, "msg.only_owner"), true);
    const OL = await langOf(draft.ownerId);
    if (draft.state === "parsing" && b !== "cancel") return ack(tr(L, "msg.busy"));
    if (b === "cancel") { if (!(await store.claim(draft.id, ["ready", "failed", "parsing"], "cancelled"))) return ack(tr(L, "msg.not_possible")); await store.takeAwaiting("edit", draft.chatId, draft.ownerId); await safeEdit(draft.chatId, draft.cardId, tr(OL, "msg.cancelled")); return ack(); }
    if (b === "redo") { await ack(); if (draft.state !== "ready" && draft.state !== "failed") return; await runParse(draft); return; }
    if (b === "apply") {
      if (draft.kind !== "update" || !draft.update?.updates.length) return ack(tr(L, "msg.nothing_apply"));
      const won = await store.claim(draft.id, ["ready"], "applied");
      if (!won) return ack(tr(L, "msg.not_possible"));
      await ack();
      const failed = await ports.applyUpdates(won, { name: draft.ownerName });
      await safeEdit(won.chatId, won.cardId, renderUpdate(won, OL, false, failed));
      return;
    }
    if (b === "edit" && draft.kind === "update") return ack(tr(L, "msg.edit_update_hint"), true);
    if (b === "edit") { if (draft.state !== "ready") return ack(tr(L, "msg.nothing_edit")); await store.setAwaiting("edit", draft.chatId, draft.ownerId, draft.id); await ack(); await tg.send(draft.chatId, tr(OL, "edit_prompt"), { replyTo: draft.cardId }); return; }
    if (b === "back") { if (draft.state === "ready" && draft.data) await safeEdit(draft.chatId, draft.cardId, renderDraft(draft, OL), draftKeyboard(draft, OL)); return ack(); }
    if (b === "submit") {
      if (draft.state !== "ready" || !draft.data) return ack(tr(L, "msg.not_ready"));
      const gaps = missingRequired(draft.data);
      if (gaps.length) return ack(tr(L, "msg.fill_first", { items: missText(L, gaps).join("; ").slice(0, 170) }), true);
      const owner = await store.person(draft.ownerId);
      if (owner && owner.role !== "repairman") { await safeEdit(draft.chatId, draft.cardId, `${renderDraft(draft, OL, "card.draft_head", false)}\n\n${tr(OL, "msg.self_prompt")}`, selfApproveKeyboard(draft, OL)); return ack(); }
      await ack();
      if (!(await sendForApproval(draft))) await tg.answer(c.id, tr(L, "msg.not_possible")).catch(() => undefined);
      return;
    }
    if (b === "selfok") {
      if (draft.state !== "ready" || person.role === "repairman" || !draft.data) return ack(tr(L, "msg.not_possible"));
      await ack();
      const won = await store.claim(draft.id, ["ready"], "pending");
      if (!won) return;
      const saved = await ports.saveReport(won);
      if (!saved.ok) { await store.claim(draft.id, ["pending"], "ready"); await tg.send(draft.chatId, `❌ ${esc(saved.error)}`, { replyTo: draft.cardId }).catch(() => 0); return; }
      won.pendingAt = Date.now(); await store.saveDraft(won);
      await decide(won, true, person, "");
      return;
    }
    if (b === "fix") {
      const reopened = await store.claim(draft.id, ["rejected"], "ready");
      if (!reopened) return ack(tr(L, "msg.cannot_change"), true);
      reopened.round += 1; await store.saveDraft(reopened);
      await safeEdit(reopened.chatId, reopened.cardId, `${tr(OL, "msg.rejected_why", { why: esc(reopened.comment) })}\n\n${renderDraft(reopened, OL)}`, draftKeyboard(reopened, OL));
      return ack();
    }
    return ack();
  }

  async function handle(u: TgUpdate): Promise<void> {
    if (!(await store.firstTime(u.update_id))) return;
    if (u.callback_query) await onCallback(u.callback_query);
    else if (u.message) await onMessage(u.message);
  }

  return { handle, finishDecision, runParse };
}

export { fullName };
