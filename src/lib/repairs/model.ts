// Repairs: one row per problem of a car. Pure code (the reading and saving are in server.ts).

/** The sheet's own status words, kept as they were. A job is OPEN while its status is one of the first four and a person approved it. */
export const OPEN_STATUSES = ["IN PROGRESS", "FOR REPAIR", "OPEN", "ONGOING"] as const;
export const CLOSED_STATUSES = ["DONE", "PULLED OUT", "SOLD", "SELL AS IS", "CLOSED", "CANCELLED"] as const;
export const PENDING_STATUS = "PENDING APPROVAL", REJECTED_STATUS = "REJECTED";

export type Approval = "pending" | "approved" | "rejected";

export interface Repair {
  id: string; key: string | null; unitId: string | null; plate: string; ym: string | null; brand: string | null; vehicle: string | null; problem: string | null; happenedOn: string | null; happenedRaw: string | null;
  solution: string | null; supplier: string | null; company: string | null; estTimeline: string | null; dueOn: string | null; status: string | null; approval: Approval;
  approvedBy: string | null; approvedAt: string | null; rejectReason: string | null; reportedBy: string | null; createdAt: string;
  /** a job the car can be shown with: it stays on sale while the job is open. false: the car cannot be displayed until it is done. */
  canDisplay: boolean;
}

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toUpperCase();

export const isOpen = (r: Pick<Repair, "status" | "approval">): boolean => r.approval === "approved" && (OPEN_STATUSES as readonly string[]).includes(norm(r.status));

/** Pending, open or closed: the three places a job can be. */
export function stageOf(r: Pick<Repair, "status" | "approval">): "pending" | "open" | "closed" | "rejected" {
  if (r.approval === "pending") return "pending";
  if (r.approval === "rejected") return "rejected";
  return isOpen(r) ? "open" : "closed";
}

export function isOverdue(r: Pick<Repair, "status" | "approval" | "dueOn">, today: string): boolean {
  return isOpen(r) && !!r.dueOn && r.dueOn < today;
}

export const dueDate = (v: string | null | undefined): string | null => (/^\d{4}-\d{2}-\d{2}$/.test((v ?? "").trim()) ? (v as string).trim() : null);

/** A status typed or sent: only the known words are kept (anything else is refused, never guessed). */
export function cleanStatus(v: string | null | undefined): string | null {
  const s = norm(v);
  return [...OPEN_STATUSES, ...CLOSED_STATUSES].includes(s as never) ? s : null;
}

export interface ItemInput { problem: string; reportedOn?: string; solution?: string; supplier?: string; company?: string; estTimeline?: string; status?: string }

const text = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** One problem of a report, from the bot or the form: trimmed, and the problem must say something. */
export function cleanItem(raw: Partial<Record<keyof ItemInput, unknown>>): ItemInput | null {
  const problem = text(raw.problem, 300);
  if (!problem) return null;
  const on = text(raw.reportedOn, 10);
  return { problem, reportedOn: dueDate(on) ?? undefined, solution: text(raw.solution, 300), supplier: text(raw.supplier, 100), company: text(raw.company, 100), estTimeline: text(raw.estTimeline, 40), status: cleanStatus(text(raw.status, 20)) ?? "IN PROGRESS" };
}

/** "m/d" as the sheet wrote its notes at the end of SOLUTION. */
export const noteStamp = (today: string) => `${Number(today.slice(5, 7))}/${Number(today.slice(8, 10))}`;

/** A note is added to the end of the solution, never replacing it; the oldest bracketed notes drop first past 480 characters (the sheet's rule). */
export function appendNote(solution: string | null, note: string, today: string): string {
  let out = `${(solution ?? "").trim()} [${noteStamp(today)}] ${note.trim()}`.trim();
  while (out.length > 480) {
    const m = /\s\[\d{1,2}\/\d{1,2}\][^[]*/.exec(out);
    if (!m || m.index === 0 && out.indexOf(m[0], 1) < 0) { out = out.slice(out.length - 480); break; }
    out = (out.slice(0, m.index) + out.slice(m.index + m[0].length)).trim();
  }
  return out;
}

export interface CarRepairState { openCount: number; state: string | null }

/** What the car's one status should become from its open jobs. Only a car that is Onhand goes to For repair, and only For repair comes back; a car that is reserved, sold or not for sale keeps its state. */
export function stateAfterRepairs(current: string | null, openCount: number): string | null {
  if (openCount > 0 && (current === "Onhand" || current === null)) return "For repair";
  if (openCount === 0 && current === "For repair") return "Onhand";
  return null;
}
