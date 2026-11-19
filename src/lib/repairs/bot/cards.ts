import { missingOptional, missingRequired, type Draft, type Gap, type UpdateItem } from "./draft";
import { prettyDate, tr } from "./texts";

// The cards the bot shows. HTML parse mode, so every dynamic value is escaped. Only three emojis: ✅ worked, ❌ broken, ⚠️ needs attention.

export const RULE = "────────────────";
export const esc = (v: unknown): string => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface Button { text: string; callback_data: string }
export interface Keyboard { inline_keyboard: Button[][] }
const kb = (rows: [string, string][][]): Keyboard => ({ inline_keyboard: rows.map((r) => r.map(([text, callback_data]) => ({ text, callback_data }))) });

const nothing = (lang: string) => `<i>${tr(lang, "card.not_said")}</i>`;

export function missText(lang: string, gaps: Gap[]): string[] {
  return gaps.map(([code, n]) => (n ? tr(lang, "miss.prefix", { n }) : "") + tr(lang, `miss.${code}`));
}

export const carName = (d: { year_model: string; vehicle: string }) => [d.year_model, d.vehicle].filter(Boolean).join(" ");

export function renderDraft(draft: Draft, lang: string, head = "card.draft_head", footer = true): string {
  const d = draft.data;
  if (!d) return tr(lang, "msg.reading");
  const car = carName(d);
  const lines = [`<b>${tr(lang, head)}</b>`, `${tr(lang, "card.reported_by")}: ${esc(draft.ownerName)}`, RULE, `<b>${tr(lang, "card.car")}:</b>  ${car ? esc(car) : nothing(lang)}`];
  const note = d.plate ? (d.inventory_found ? `  (${tr(lang, "card.in_inv")})` : `  ⚠️ ${tr(lang, "card.not_in_inv")}`) : "";
  lines.push(`<b>${tr(lang, "card.plate")}:</b>  ${d.plate ? `<code>${esc(d.plate)}</code>` : nothing(lang)}${note}`);
  d.items.forEach((it, i) => {
    const who = it.supplier ? esc(it.supplier) + (it.company ? ` (${esc(it.company)})` : "") : "-";
    let fix = it.solution ? esc(it.solution) : "-";
    if (it.solution && it.solution_is_ai && !it.solution.includes("(AI)")) fix += `  <i>(${tr(lang, "card.ai")})</i>`;
    const when = prettyDate(it.est_timeline, lang);
    lines.push("", `<b>${d.items.length > 1 ? tr(lang, "card.problem_n", { n: i + 1 }) : tr(lang, "card.problem")}</b>`,
      `${tr(lang, "card.issue")}:  ${it.problem ? esc(it.problem) : nothing(lang)}`, `${tr(lang, "card.fix")}:  ${fix}`, `${tr(lang, "card.who")}:  ${who}`, `${tr(lang, "card.due")}:  ${when ? esc(when) : nothing(lang)}`);
  });
  const req = missingRequired(d), opt = missingOptional(d);
  if (req.length) lines.push("", RULE, `⚠️ <b>${tr(lang, "card.must_fill")}</b>`, ...missText(lang, req).map((x) => `-  ${esc(x)}`));
  if (opt.length) lines.push("", tr(lang, "card.optional"), ...missText(lang, opt).map((x) => `-  ${esc(x)}`));
  const checks = [...d.warnings];
  if (d.plate && !d.inventory_found) checks.push(tr(lang, "card.plate_not_in_inv"));
  if (checks.length) lines.push("", `⚠️ <b>${tr(lang, "card.check")}</b>`, ...checks.map((w) => `-  ${esc(w)}`));
  if (footer) lines.push("", RULE, tr(lang, "card.footer_draft"));
  return lines.join("\n").slice(0, 3900);
}

export function decisionLine(draft: Draft, lang: string): string {
  const own = draft.selfApproved ? ` (${tr(lang, "status.own")})` : "";
  if (draft.state === "approved") return `✅ <b>${tr(lang, "status.approved")}</b>\n${tr(lang, "status.by")}:  ${esc(draft.decidedBy)}${own}\n${tr(lang, "status.on")}:  ${esc(draft.decidedAt)}`;
  if (draft.state === "rejected") return `❌ <b>${tr(lang, "status.rejected")}</b>\n${tr(lang, "status.by")}:  ${esc(draft.decidedBy)}\n${tr(lang, "status.on")}:  ${esc(draft.decidedAt)}\n${tr(lang, "status.reason")}:  ${esc(draft.comment)}`;
  return "";
}

/** The report with its approval status, for the owner's card and the approval card. */
export function renderStatus(draft: Draft, lang: string): string {
  const tail = draft.state === "pending" ? `<b>${tr(lang, "status.waiting")}</b>` : decisionLine(draft, lang);
  return `${renderDraft(draft, lang, "card.report_head", false)}\n\n${RULE}\n${tail}`;
}

export const draftKeyboard = (d: Draft, lang: string) => kb([[[tr(lang, "btn.submit"), `d:${d.id}:submit`], [tr(lang, "btn.edit"), `d:${d.id}:edit`]], [[tr(lang, "btn.read_again"), `d:${d.id}:redo`], [tr(lang, "btn.cancel"), `d:${d.id}:cancel`]]]);
export const failedKeyboard = (d: Draft, lang: string) => kb([[[tr(lang, "btn.try_again"), `d:${d.id}:redo`], [tr(lang, "btn.cancel"), `d:${d.id}:cancel`]]]);
export const approvalKeyboard = (d: Draft, lang: string) => kb([[[tr(lang, "btn.approve"), `a:${d.id}:approve`], [tr(lang, "btn.reject"), `a:${d.id}:reject`]]]);
export const selfApproveKeyboard = (d: Draft, lang: string) => kb([[[tr(lang, "btn.yes_approve"), `d:${d.id}:selfok`], [tr(lang, "btn.back"), `d:${d.id}:back`]]]);
export const fixKeyboard = (d: Draft, lang: string) => kb([[[tr(lang, "btn.fix_resubmit"), `d:${d.id}:fix`]]]);

function changeLines(u: UpdateItem, lang: string): string[] {
  const out: string[] = [];
  if (u.status_change === "done") out.push(tr(lang, "upd.mark_done"));
  if (u.est_timeline) out.push(`${tr(lang, "upd.new_due")}:  ${esc(prettyDate(u.est_timeline, lang))}`);
  if (u.supplier) out.push(`${tr(lang, "card.who")}:  ${esc(u.supplier)}`);
  if (u.company) out.push(`${tr(lang, "upd.company")}:  ${esc(u.company)}`);
  if (u.note) out.push(`${tr(lang, "sum.note")}:  ${esc(u.note)}`);
  return out;
}

export function renderUpdate(draft: Draft, lang: string, footer = true, saved?: Map<string, string | null>): string {
  const d = draft.update;
  if (!d) return tr(lang, "msg.reading");
  const lines = [saved ? `✅ <b>${tr(lang, "upd.saved")}</b>` : `<b>${tr(lang, "upd.head")}</b>`, `${tr(lang, "card.reported_by")}: ${esc(draft.ownerName)}`, RULE, `<b>${tr(lang, "card.car")}:</b>  ${esc(carName(d)) || "-"}`, `<b>${tr(lang, "card.plate")}:</b>  <code>${esc(d.plate)}</code>`];
  d.updates.forEach((u, i) => {
    const failed = saved && saved.get(u.jobId);
    const ch = changeLines(u, lang);
    lines.push("", `<b>${i + 1}.  ${esc(u.problem)}</b>`, ...ch.map((x, k) => (failed && k === 0 ? `❌ ${tr(lang, "upd.not_saved")}:  ${x}` : x)));
  });
  if (!d.updates.length) lines.push("", `⚠️ <b>${tr(lang, "upd.no_match")}</b>`, tr(lang, "upd.type_open"));
  if (d.unmatched.length) lines.push("", `⚠️ <b>${tr(lang, "upd.unmatched")}</b>`, ...d.unmatched.map((x) => `-  ${esc(x)}`), tr(lang, "upd.new_problem_hint"));
  for (const w of d.warnings) lines.push(`⚠️ ${esc(w)}`);
  if (d.updates.length && footer) lines.push("", RULE, tr(lang, "upd.footer"));
  return lines.join("\n").slice(0, 3900);
}

export const updateKeyboard = (d: Draft, lang: string) => kb([[...(d.update?.updates.length ? [[tr(lang, "btn.apply"), `d:${d.id}:apply`] as [string, string]] : []), [tr(lang, "btn.cancel"), `d:${d.id}:cancel`]], [[tr(lang, "btn.read_again"), `d:${d.id}:redo`]]]);

export interface OpenLine { jobId: string; plate: string; car: string; problem: string; supplier: string; due: string; overdue: boolean }

/** /open: the open jobs by car, each with a button to mark it done. */
export function renderOpen(jobs: OpenLine[], lang: string, plate: string): { text: string; keyboards: { text: string; keyboard: Keyboard }[] } {
  if (!jobs.length) return { text: plate ? tr(lang, "open.none_plate", { plate: esc(plate) }) : tr(lang, "open.none"), keyboards: [] };
  const byCar = new Map<string, OpenLine[]>();
  for (const j of jobs) (byCar.get(j.plate) ?? byCar.set(j.plate, []).get(j.plate)!).push(j);
  const overdue = jobs.filter((j) => j.overdue).length;
  const head = `<b>${tr(lang, "open.head", { n: jobs.length, c: byCar.size })}</b>${overdue ? `   ${tr(lang, "open.overdue", { n: overdue })}` : ""}`;
  const cards = [...byCar.entries()].slice(0, 8).map(([p, items]) => {
    const lines = [`<b>${tr(lang, "job.head")}</b>`, RULE, `<b>${tr(lang, "card.car")}:</b>  ${esc(items[0].car) || "-"}`, `<b>${tr(lang, "card.plate")}:</b>  <code>${esc(p)}</code>`];
    items.slice(0, 8).forEach((it, n) => lines.push("", `<b>${n + 1}.  ${esc(it.problem)}</b>`, `${tr(lang, "card.who")}:  ${esc(it.supplier) || "-"}`, `${tr(lang, "card.due")}:  ${esc(prettyDate(it.due, lang)) || tr(lang, "job.no_date")}${it.overdue ? `   ⚠️ <b>${tr(lang, "job.overdue")}</b>` : ""}`));
    if (items.length > 8) lines.push("", tr(lang, "job.more", { n: items.length - 8 }));
    return { text: lines.join("\n").slice(0, 3900), keyboard: kb(items.slice(0, 8).map((it, n) => [[tr(lang, "job.mark_n", { n: n + 1 }), `j:${it.jobId}:ask`] as [string, string]])) };
  });
  return { text: head + (byCar.size > 8 ? `\n${tr(lang, "open.more_cars", { n: byCar.size - 8 })}` : ""), keyboards: cards };
}

export const confirmDoneKeyboard = (jobId: string, lang: string) => kb([[[tr(lang, "job.yes"), `j:${jobId}:yes`], [tr(lang, "job.no"), `j:${jobId}:no`]]]);

/** The reminder for one car with overdue jobs (the group's message), each job with Done and Mute buttons. */
export function renderReminder(plate: string, items: (OpenLine & { daysLate: number })[], lang: string, mentions: string): { text: string; keyboard: Keyboard } {
  const lines = [`⚠️ <b>${tr(lang, "rem.head")}</b>`, RULE, `<b>${tr(lang, "card.car")}:</b>  ${esc(items[0].car) || "-"}`, `<b>${tr(lang, "card.plate")}:</b>  <code>${esc(plate)}</code>`];
  items.slice(0, 8).forEach((it, n) => lines.push("", `<b>${n + 1}.  ${esc(it.problem)}</b>`, `${tr(lang, "card.who")}:  ${esc(it.supplier) || "-"}`, `${tr(lang, "card.due")}:  ${esc(prettyDate(it.due, lang))}  (${tr(lang, it.daysLate === 1 ? "rem.late_one" : "rem.late_many", { n: it.daysLate })})`));
  if (mentions) lines.push("", `${tr(lang, "rem.reported_by")}:  ${mentions}`);
  lines.push("", RULE, tr(lang, "rem.footer", { plate: esc(plate) }));
  return { text: lines.join("\n").slice(0, 3900), keyboard: kb(items.slice(0, 8).map((it, n) => [[tr(lang, "rem.done_n", { n: n + 1 }), `j:${it.jobId}:ask`] as [string, string], [tr(lang, "rem.mute_n", { n: n + 1 }), `j:${it.jobId}:mute`] as [string, string]])) };
}
