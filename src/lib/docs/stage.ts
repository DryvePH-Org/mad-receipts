// Where a car is in the documents workflow, what the staff should do next, and which actions are allowed right now.
// Pure rules (no network): the page shows them and the server enforces the same ones, so a buttons-out-of-order mistake cannot happen.

export type StepKey = "photos" | "scan" | "review" | "approve" | "sold_docs" | "move" | "handoff" | "done";
export type StepState = "done" | "current" | "todo";
export interface Step { key: StepKey; label: string; state: StepState; group: "in" | "out" }
export interface Rule { allowed: boolean; /** why not, in words staff understand (null when allowed) */ reason: string | null; /** an Admin may still do it after a confirmation */ adminOverride?: boolean }
export interface Rules { scan: Rule; approve: Rule; sendSheet: Rule; moveToSold: Rule; handoff: Rule; markReturned: Rule }

export interface StageInput {
  linked: boolean; location: "available" | "sold";
  filesTotal: number; pending: number; failed: number; scanning: boolean;
  /** files with a flag or an ID/deed nobody owns */
  flaggedFiles: number;
  /** papers the case needs before the sale, and after it (AR, buyer's ID, deed), that are not in the folder */
  missingBefore: number; missingSold: number;
  /** the car has a deal (an AR was made) */
  hasDeal: boolean;
  approved: boolean;
  /** a person chose the case (the bot only suggests it) */
  caseChosen?: boolean;
  handoffAt: string | null; returnedAt: string | null;
  receiver: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ok: Rule = { allowed: true, reason: null };
const no = (reason: string, adminOverride = false): Rule => ({ allowed: false, reason, adminOverride });

export interface StageModel {
  steps: Step[];
  current: StepKey | "link";
  next: { title: string; body: string; /** the page section to take the person to */ anchor: string | null };
  rules: Rules;
}

export function deriveStage(i: StageInput): StageModel {
  const out = i.location === "sold";
  const handedOff = !!i.handoffAt && !i.returnedAt;
  const returned = !!i.returnedAt;
  const scanning = i.scanning;

  // ---- which step is the current one ----
  let current: StepKey | "link";
  if (!i.linked) current = "link";
  else if (returned) current = "done";
  else if (out && i.handoffAt) current = "handoff";
  else if (out) current = "handoff";
  else if (i.filesTotal === 0) current = "photos";
  else if (scanning || i.pending > 0 || i.failed > 0) current = "scan";
  else if (!i.approved && (i.caseChosen === false || i.flaggedFiles > 0 || i.missingBefore > 0)) current = "review";
  else if (!i.approved) current = "approve";
  else if (i.missingSold > 0) current = "sold_docs";
  else current = "move";

  const order: StepKey[] = ["photos", "scan", "review", "approve", "sold_docs", "move", "handoff", "done"];
  const labels: Record<StepKey, string> = { photos: "Photos in", scan: "Scanned", review: "Reviewed", approve: "Approved", sold_docs: "Sold papers", move: "In Sold", handoff: "Handoff", done: "Done" };
  const at = current === "link" ? -1 : order.indexOf(current);
  const steps: Step[] = order.map((key, n) => ({ key, label: labels[key], group: n <= 3 ? "in" : "out", state: current === "link" ? "todo" : n < at || (key === "done" && returned) ? "done" : n === at ? "current" : "todo" }));
  // a car that is already in Sold (or approved) has finished the IN steps even if nothing was scanned in this app
  if (out || i.approved) for (const s of steps) if (s.key === "photos" || s.key === "scan" || s.key === "review" || s.key === "approve") s.state = "done";
  if (out) for (const s of steps) if (s.key === "sold_docs" || s.key === "move") s.state = "done";

  // ---- what to do next ----
  const next: StageModel["next"] = (() => {
    switch (current) {
      case "link": return { title: "Link the car's folder", body: "This car has no single folder in Drive yet. Choose the right one below, or search Drive again.", anchor: "folder" };
      case "photos": return { title: "Add the car's documents", body: "No photos are in this car's folder yet. Add them with Add documents (type the plate and choose the photos).", anchor: null };
      case "scan":
        if (scanning) return { title: "The bot is scanning", body: "Wait for it to finish: the photos fill in here by themselves. Nothing else can be done until the scan ends.", anchor: "files" };
        if (i.pending > 0) return { title: `Scan the ${plural(i.pending, "waiting photo")}`, body: "The bot reads each photo: what it is, how it is turned, original or copy, and any damage. Press Scan.", anchor: "files" };
        return { title: `${plural(i.failed, "photo")} could not be read`, body: "Scan them again, or say what each one is by hand.", anchor: "files" };
      case "review": {
        const bits = [i.caseChosen === false ? "the case is not chosen yet" : "", i.flaggedFiles ? plural(i.flaggedFiles, "file") + " to check" : "", i.missingBefore ? plural(i.missingBefore, "paper") + " missing" : ""].filter(Boolean).join(" and ");
        return { title: "Review what the bot found", body: `${bits}. Choose the case under Papers needed (the bot only suggests it). Fix a wrong type with "Change what this is", add a missing paper with Add documents, then scan again. You can still approve with these open; you will be asked to confirm.`, anchor: "files" };
      }
      case "approve": return { title: "Approve the documents", body: "The scan is clean. Fill in About the car if you have not, then approve: marketing is told and the sheets are updated.", anchor: "approval" };
      case "sold_docs":
        return i.hasDeal
          ? { title: "Waiting for the sold papers", body: `Approved and ready to market. Sales uploads the signed AR, the buyer's ID and the deed (${plural(i.missingSold, "paper")} to go). Then you move the folder to Sold.`, anchor: "sold" }
          : { title: "Approved: ready to market", body: "Nothing more until this car is sold. When an AR is made, Sales uploads the signed AR, the buyer's ID and the deed.", anchor: "sold" };
      case "move": return { title: "Move the folder to Sold", body: "All the sold papers are in. Move the folder from Available units to Sold units.", anchor: "sold" };
      case "handoff":
        if (!out) return { title: "Handoff", body: "", anchor: "handoff" };
        return handedOff
          ? { title: `With ${i.receiver}`, body: `Mark it as done when the papers are back. A reminder goes out on Telegram every 3 days until then.`, anchor: "handoff" }
          : { title: `Hand the papers to ${i.receiver}`, body: "Tick each paper against the folder, then press Handed off.", anchor: "handoff" };
      case "done": return { title: "All done", body: "The papers came back. Nothing more to do for this car.", anchor: null };
    }
  })();

  // ---- what may be pressed now ----
  const rules: Rules = {
    scan: !i.linked ? no("Link the folder first.")
      : scanning ? no("The bot is already scanning this car.")
      : i.pending + i.failed === 0 ? no(i.filesTotal === 0 ? "There are no photos to scan." : "Every photo has been read.") : ok,
    approve: !i.linked ? no("Link the folder first.")
      : i.approved ? no("These documents are already approved.")
      : i.filesTotal === 0 ? no("Add the car's documents first.")
      : scanning ? no("Wait for the scan to finish.")
      : i.pending > 0 ? no(`${plural(i.pending, "photo")} still to be scanned.`)
      : i.failed > 0 ? no(`${plural(i.failed, "photo")} could not be read: scan them again or say what they are.`)
      : i.caseChosen === false ? no("Choose the case first (Papers needed). The bot only suggests it; you decide.") : ok,
    sendSheet: !i.approved ? no("Approve the documents first.") : ok,
    moveToSold: !i.linked ? no("Link the folder first.")
      : out ? no("This car is already in Sold units.")
      : !i.approved ? no("Approve the documents first.", true)
      : i.missingSold > 0 ? no(`${plural(i.missingSold, "sold paper")} not uploaded yet (the signed AR, the buyer's ID, the deed).`, true) : ok,
    handoff: !out ? no("Move the folder to Sold first.") : handedOff ? no(`Already with ${i.receiver}.`) : ok,
    markReturned: !handedOff ? no(i.returnedAt ? "The papers are already back." : "The papers have not been handed off.") : ok,
  };
  return { steps, current, next, rules };
}

/** The same rules for the server to enforce (it must not trust the page). */
export const allowed = (rule: Rule, isAdmin: boolean): boolean => rule.allowed || (!!rule.adminOverride && isAdmin);
