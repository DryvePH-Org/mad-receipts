// A person's own work in the documents, as they see it on their Home: for each car they uploaded photos to, where it is now (waiting for the scanner, being
// scanned, read, approved). Pure code, so the words and the steps are tested; the reading is in work-server.ts.

export type WorkStage = "in" | "out" | "transfer";
export type StepKey = "uploaded" | "scanning" | "read" | "approved";
export type Tone = "zinc" | "blue" | "amber" | "emerald" | "red";

export const STAGE_LABEL: Record<WorkStage, string> = { in: "IN documents", out: "OUT documents", transfer: "Papers back from the transfer" };
/** Who approves each stage (the words on the card). */
export const APPROVER: Record<WorkStage, string> = { in: "Buying", out: "Sales", transfer: "Documentation" };
export const SCANNER: Record<WorkStage, string> = { in: "The scanner", out: "The OUT scanner", transfer: "The transfer scanner" };

export interface QueueJob { action: string; bot: string; status: "queued" | "sent"; priority: number; createdAt: string; plate: string | null }

/** Where a waiting scan is in its bot's line: 1 = next (or running). Counts the scans of the same bot that run now or come before it. */
export function queuePosition(active: readonly QueueJob[], job: QueueJob): number {
  if (job.status === "sent") return 1;
  const ahead = active.filter((j) => j !== job && j.bot === job.bot && (j.status === "sent" || j.priority > job.priority || (j.priority === job.priority && j.createdAt < job.createdAt))).length;
  return ahead + 1;
}

export interface WorkInput {
  stage: WorkStage;
  /** photos of this stage, still waiting to be read / that could not be read */
  pending: number; failed: number;
  /** the bot's job for this car and stage, when there is one */
  job: { status: "queued" | "sent"; position: number } | null;
  /** how many of the stage's papers are on the checklist now, how many it needs, and how many photos have a warning */
  placed: number; needed: number; flagged: number;
  approved: boolean;
}

export interface WorkState {
  step: StepKey;
  label: string;
  detail: string;
  tone: Tone;
  /** finished: approved, nothing more to wait for */
  done: boolean;
  /** still moving by itself (the page keeps looking) */
  active: boolean;
  steps: { key: StepKey; label: string; state: "done" | "now" | "later" }[];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ord = (n: number) => { const v = n % 100; return `${n}${v >= 11 && v <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`; };

const ORDER: StepKey[] = ["uploaded", "scanning", "read", "approved"];
const NAMES: Record<StepKey, string> = { uploaded: "Uploaded", scanning: "Scanning", read: "Read", approved: "Approved" };

export function workState(i: WorkInput): WorkState {
  const waiting = i.pending > 0 || !!i.job;
  let step: StepKey, label: string, detail: string, tone: Tone, active = false;
  if (i.approved && !waiting) { step = "approved"; label = "Approved"; detail = `${APPROVER[i.stage]} approved ${STAGE_LABEL[i.stage].toLowerCase()}.`; tone = "emerald"; }
  else if (i.job?.status === "sent") { step = "scanning"; label = "Being scanned"; detail = `${SCANNER[i.stage]} is reading ${i.pending ? plural(i.pending, "photo") : "your photos"} now. This page updates by itself.`; tone = "blue"; active = true; }
  else if (waiting) {
    step = "uploaded"; tone = "amber"; active = true;
    if (i.job) { label = i.job.position > 1 ? `Waiting: ${ord(i.job.position)} in line` : "Waiting: next in line"; detail = `${plural(i.pending, "photo")} sent. ${SCANNER[i.stage]} reads them in turn.`; }
    else { label = "Photos sent"; detail = "The scan starts a moment after your last photo, so photos added together are read together."; }
  }
  else if (i.failed > 0) { step = "uploaded"; label = "Needs a look"; detail = `${plural(i.failed, "photo")} could not be read. Open the car and press Scan again, or say what each one is.`; tone = "red"; }
  else {
    step = "read";
    const missing = Math.max(0, i.needed - i.placed);
    label = `Read: ${i.placed} of ${i.needed} papers in`;
    detail = [i.flagged ? `${plural(i.flagged, "photo")} to check` : "", missing ? `${plural(missing, "paper")} still needed` : "", !i.flagged && !missing ? `Waiting for ${APPROVER[i.stage]} to approve.` : ""].filter(Boolean).join(". ") + (i.flagged || missing ? "." : "");
    tone = i.flagged || missing ? "amber" : "emerald";
  }
  const at = ORDER.indexOf(step);
  return { step, label, detail, tone, done: step === "approved", active, steps: ORDER.map((key, n) => ({ key, label: NAMES[key], state: n < at || (key === "approved" && step === "approved") ? "done" : n === at ? "now" : "later" })) };
}

/** Who sees the car as theirs: the photos they uploaded in the last days, grouped by car and stage, newest car first, unfinished before finished. */
export interface WorkItem { plate: string; plateDisplay: string; car: string; stage: WorkStage; photos: number; lastAt: string; state: WorkState }

export function sortWork(items: WorkItem[]): { open: WorkItem[]; done: WorkItem[] } {
  const byNew = (a: WorkItem, b: WorkItem) => b.lastAt.localeCompare(a.lastAt);
  return { open: items.filter((x) => !x.state.done).sort(byNew), done: items.filter((x) => x.state.done).sort(byNew) };
}
