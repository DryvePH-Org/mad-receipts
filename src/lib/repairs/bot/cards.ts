import { missingOptional, missingRequired, type Draft, type Gap } from "./draft";
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
