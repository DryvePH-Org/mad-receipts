// A report being written in Telegram: what was read from the words, what is still missing, and the draft's life (ready → pending → approved or rejected).

export interface DraftItem { problem: string; reported_on: string; solution: string; solution_is_ai: boolean; supplier: string; company: string; est_timeline: string; timeline_text: string }
export interface DraftData {
  not_a_report: boolean; plate: string; year_model: string; vehicle: string; inventory_found: boolean; items: DraftItem[]; warnings: string[];
}

export type DraftState = "parsing" | "ready" | "failed" | "pending" | "approved" | "rejected" | "applied" | "cancelled";

export interface Draft {
  id: string; ownerId: number; ownerName: string; chatId: number; transcript: string;
  data: DraftData | null; cardId: number | null; state: DraftState; kind: "report";
  approvalId: number | null; decidedBy: string; decidedById: number; decidedAt: string; comment: string; selfApproved: boolean;
  round: number; pendingAt: number; nudgedAt: number; createdAt: number;
}

export const MAX_ITEMS = 10, FIELD_LIMIT = 300;
const s = (v: unknown, n = FIELD_LIMIT) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v)).trim().slice(0, n);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** The reader's answer is untrusted text: force the shape, trim the lengths, drop anything unexpected. */
export function cleanResult(raw: unknown): DraftData {
  const r = isObj(raw) ? raw : {};
  const items: DraftItem[] = (Array.isArray(r.items) ? r.items : []).slice(0, MAX_ITEMS).filter(isObj).map((it) => ({
    problem: s(it.problem), reported_on: s(it.reported_on, 10), solution: s(it.solution), solution_is_ai: it.solution_is_ai === true, supplier: s(it.supplier, 100), company: s(it.company, 100),
    est_timeline: s(it.est_timeline, 40), timeline_text: s(it.timeline_text, 80),
  }));
  return {
    not_a_report: r.not_a_report === true, plate: s(r.plate, 20).toUpperCase(), year_model: s(r.year_model, 4), vehicle: s(r.vehicle, 60), inventory_found: false, items,
    warnings: (Array.isArray(r.warnings) ? r.warnings : []).slice(0, 6).map((w) => s(w, 160)).filter(Boolean),
  };
}

export type Gap = [code: string, n: number | null];

/** What must be filled in before a report can be submitted. */
export function missingRequired(d: DraftData): Gap[] {
  const out: Gap[] = [];
  if (!d.plate) out.push(["plate", null]);
  if (!d.vehicle) out.push(["car", null]);
  if (!d.items.length) out.push(["problem_any", null]);
  const many = d.items.length > 1;
  d.items.forEach((it, i) => {
    if (!it.problem) out.push(["problem_text", many ? i + 1 : null]);
    if (!it.est_timeline) out.push(["due", many ? i + 1 : null]);
  });
  return out;
}

export function missingOptional(d: DraftData): Gap[] {
  const out: Gap[] = [];
  const many = d.items.length > 1;
  d.items.forEach((it, i) => {
    if (!it.solution) out.push(["fix", many ? i + 1 : null]);
    if (!it.supplier) out.push(["who", many ? i + 1 : null]);
  });
  return out;
}

/** The id the report's jobs carry (the sheet's BOT ID): R<draft>-<round>, then -<n> per problem, so a resend is never a double. */
export const reportKey = (d: Pick<Draft, "id" | "round">) => `R${d.id}-${d.round}`;
