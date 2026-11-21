// The steps of a transfer, from the dates kept on its record (migration 48). Pure, so the rules are tested; the saving is in handoff.ts.
//   With the liaison  ->  Back at MAD  ->  Released  ->  Delivered
// "With the liaison" is the old documents handoff and "Back at MAD" its old "Mark as done".

export type StepKey = "out" | "back" | "released" | "delivered";
export const STEP_LABEL: Record<StepKey, string> = { out: "With the liaison", back: "Back at MAD", released: "Released", delivered: "Delivered" };
export const STEP_ORDER: StepKey[] = ["out", "back", "released", "delivered"];

export interface StepDates { handedOffAt: string | null; backAt: string | null; releasedOn: string | null; deliveredOn: string | null }
export interface StepView { key: StepKey; label: string; done: boolean; date: string | null; current: boolean }

/** The four steps with what is done and which one is next. A later step done counts the earlier ones as done too (a client who collects the papers himself); so does the stage. */
export function stepsOf(d: StepDates & { stage?: string | null }): { steps: StepView[]; next: StepKey | null } {
  const dates: Record<StepKey, string | null> = { out: d.handedOffAt, back: d.backAt, released: d.releasedOn, delivered: d.deliveredOn };
  // a record that came from the sold list has a stage but no dates: the stage tells how far it is (its steps are done, the day is not known)
  const floor = d.stage === "delivered" ? 3 : d.stage === "released" ? 2 : d.stage === "transferred" ? 1 : -1;
  const last = Math.max(floor, STEP_ORDER.reduce((n, k, i) => (dates[k] ? i : n), -1));
  const steps = STEP_ORDER.map((key, i) => ({ key, label: STEP_LABEL[key], done: i <= last, date: dates[key], current: i === last + 1 }));
  return { steps, next: last + 1 < STEP_ORDER.length ? STEP_ORDER[last + 1] : null };
}

/** The stage the record is in for these dates (what the lists and the filters show). */
export function stageFor(d: StepDates): "in_process" | "transferred" | "released" | "delivered" {
  if (d.deliveredOn) return "delivered";
  if (d.releasedOn) return "released";
  if (d.backAt) return "transferred";
  return "in_process";
}

/** One step back, for an Admin who made a mistake: the dates it leaves. */
export function stepBack(d: StepDates): StepDates {
  if (d.deliveredOn) return { ...d, deliveredOn: null };
  if (d.releasedOn) return { ...d, releasedOn: null };
  if (d.backAt) return { ...d, backAt: null };
  return { ...d, handedOffAt: null };
}
