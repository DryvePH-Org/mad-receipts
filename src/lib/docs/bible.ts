import type { UnitDetails } from "./details";
import type { CaseType } from "./types";

// How the app's documents checklist is written into the Docs Bible workbook (tab "DOCS 2026" and the monthly tabs).
// Pure rules, no network: the grokbot does the writing, this decides WHAT to write. See Docs/sheets-study.md.

/** The typed columns the app may fill in DOCS 2026, by the header the sheet shows. Everything else (the imported B:U, column A, the COMPLETE DOCS? formula) is never written. */
export const DOCS_FIELDS = {
  classification: { header: "CLASSIFICATION", list: ["Clean", "Repo (bank)", "Encumbered (Indiv)"] },
  cr: { header: "CR", list: ["Yes", "No", "To follow", "N/A"] },
  or: { header: "OR", list: ["Yes", "No", "To follow", "N/A", "FOR RENEWAL"] },
  deed: { header: "DEED OF SALE", list: ["Yes", "No", "To follow", "N/A"] },
  sellers_id: { header: "SELLER'S ID", list: ["Yes", "No", "To follow", "N/A"] },
  sec_cert: { header: "SEC CERT", list: ["Yes", "No", "To follow", "N/A"] },
  sec_ids: { header: "SEC ID'S", list: ["Yes", "No", "To follow", "N/A"] },
  boards_reso: { header: "BOARDS RESO", list: ["Yes", "No", "To follow", "N/A"] },
  encumbered: { header: "Encumbered", list: ["Yes", "No", "To follow", "N/A"] },
  chattel: { header: "CHATTEL", list: ["Yes", "No", "To follow", "N/A"] },
  promissory: { header: "PROMISSORY", list: ["Yes", "No", "To follow", "N/A"] },
  remarks_1: { header: "REMARKS I", list: null },
} as const;
export type DocsField = keyof typeof DOCS_FIELDS;

/** The sheet only knows three classifications. A company car is filed as a normal car (usually Clean) with the three secretary columns Yes. */
export const SHEET_CLASS: Record<CaseType, string> = { clean: "Clean", encumbered: "Encumbered (Indiv)", repo_bank: "Repo (bank)", company: "Clean" };

export interface Change { field: DocsField; before: string; after: string; mode: "set" | "append" }

export interface BibleInput {
  caseType: CaseType;
  /** what this app itself last wrote in each cell: such a cell may be corrected by the app, a cell a person typed never is */
  appWrote?: Partial<Record<string, string>>;
  /** which checklist items have a file in the car's folder: the app's DocType keys */
  present: ReadonlySet<string>;
  /** what the sheet shows now for this unit, by field (blank when empty) */
  current: Partial<Record<DocsField, string>>;
}

const has = (i: BibleInput, ...types: string[]) => types.some((t) => i.present.has(t));

/** The value the app's checklist says each column should hold, or null to leave the column alone. */
export function desiredValues(i: BibleInput): Partial<Record<Exclude<DocsField, "remarks_1">, string>> {
  const c = i.caseType, secretary = c === "company" || c === "repo_bank";
  const want = (present: boolean, required: boolean): string | null => (present ? "Yes" : required ? null : "N/A");
  const out: Partial<Record<Exclude<DocsField, "remarks_1">, string | null>> = {
    classification: SHEET_CLASS[c],
    cr: want(has(i, "certificate_of_registration"), true),
    or: want(has(i, "official_receipt"), true),
    deed: want(has(i, "deed_owner_to_dealer"), true),
    sellers_id: want(has(i, "owner_id", "representative_id"), true),
    sec_cert: want(has(i, "secretary_certificate"), secretary),
    sec_ids: want(has(i, "secretary_id"), secretary),
    boards_reso: want(has(i, "board_resolution"), c === "company"),
    encumbered: c === "encumbered" || c === "repo_bank" ? "Yes" : "N/A",
    chattel: want(has(i, "chattel_cancellation"), c === "encumbered" || c === "repo_bank"),
    promissory: want(has(i, "promissory_note"), c === "encumbered" || c === "repo_bank"),
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== null)) as Partial<Record<Exclude<DocsField, "remarks_1">, string>>;
}

export interface Plan { changes: Change[]; notes: string[] }

/**
 * What to write: only what moves the sheet forward. A cell a person already filled is left alone, except that a "No" or "To follow"
 * becomes "Yes" once the paper is in the folder; a "Yes" is never downgraded; a classification that disagrees is reported, not overwritten.
 */
export function planChanges(i: BibleInput): Plan {
  const changes: Change[] = [], notes: string[] = [];
  for (const [field, after] of Object.entries(desiredValues(i)) as [Exclude<DocsField, "remarks_1">, string][]) {
    const before = (i.current[field] ?? "").trim();
    if (before === after) continue;
    const mine = i.appWrote?.[field] !== undefined && i.appWrote[field] === before; // the app's own earlier value, still there
    if (mine && !(after === "N/A" && before === "Yes")) { changes.push({ field, before, after, mode: "set" }); continue; }
    if (field === "classification") {
      if (!before) changes.push({ field, before, after, mode: "set" });
      else notes.push(`The sheet says ${before} but the documents suggest ${after}. Left as it is: change it in the sheet if the documents are right.`);
      continue;
    }
    const blank = before === "";
    const upgrade = after === "Yes" && (before === "No" || before.toLowerCase() === "to follow");
    if (blank || upgrade) changes.push({ field, before, after, mode: "set" });
    else if (after === "Yes" && before === "N/A") notes.push(`${DOCS_FIELDS[field].header} is N/A in the sheet but a paper is in the folder.`);
  }
  return { changes, notes };
}

// ---------------- the dated note (REMARKS I) ----------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "13 Nov 2026, 4:38 PM PHT", the form the CHANGELOG and the scan notes already use. */
export function phtStamp(d: Date): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")} ${MONTHS[Number(g("month")) - 1]} ${g("year")}, ${g("hour")}:${g("minute")} ${g("dayPeriod")} PHT`;
}

export interface NoteInput { now: Date; carName: string; items: { label: string; present: boolean; stage: "available" | "sold" }[]; flags: string[]; details: UnitDetails | null }

/** The scan report for REMARKS I, in the style already in the sheet: dated, the car, one line per paper. */
export function scanNote(n: NoteInput): string {
  const lines = [phtStamp(n.now), n.carName];
  for (const i of n.items.filter((x) => x.stage === "available")) lines.push(`${i.present ? "✅" : "❌"} ${i.label}`);
  for (const f of n.flags.slice(0, 6)) lines.push(`⚠ ${f}`);
  const d = n.details;
  if (d) {
    const bits = [
      d.spareKey ? `Spare key: ${d.spareKey === "yes" ? "yes" : "no"}` : "",
      d.casaMaintained ? `Casa: ${d.casaMaintained === "yes" ? `yes${d.casaWhen || d.casaWhere ? ` (${[d.casaWhen, d.casaWhere].filter(Boolean).join(", ")})` : ""}` : "no"}` : "",
      d.batteryWhen ? `Battery: ${d.batteryWhen}` : "", d.boughtFrom ? `Bought: ${d.boughtFrom}` : "",
      d.isEv ? `EV charger: ${d.evCharger || "?"}, card: ${d.evCard || "?"}` : "", d.note ? d.note : "",
    ].filter(Boolean);
    if (bits.length) lines.push(bits.join(" | "));
  }
  return lines.join("\n").slice(0, 1800);
}

/** The note without its time line: what it says about the papers, flags and details. */
export const noteBody = (note: string): string => note.split("\n").slice(1).join("\n").trim();

/** Whether the sheet's REMARKS I already holds a note saying the same thing (only the time differs), so sending again does not stack copies. */
export function noteAlreadyThere(existing: string | undefined, note: string): boolean {
  const body = noteBody(note);
  return !body || (existing ?? "").replace(/\r/g, "").includes(body);
}

// ---------------- trusting the bot's answer ----------------

export interface WriteCheck { ok: boolean; problems: string[]; written: number }

/**
 * The bot says what it wrote. The app does not simply believe "ok": every cell it asked for must be accounted for (written and read back
 * equal, or already as wanted), nothing else may have been written, and the CHANGELOG must have a row for what was written.
 */
export function checkWriteAnswer(requested: { field: string }[], result: Record<string, unknown>): WriteCheck {
  if (result.already === true) return { ok: true, problems: [], written: 0 };
  const applied = (Array.isArray(result.applied) ? result.applied : []).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  const skipped = (Array.isArray(result.skipped) ? result.skipped : []).filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  const problems: string[] = [];
  const asked = new Set(requested.map((r) => r.field));
  const done = new Set<string>();
  for (const a of applied) {
    const f = String(a.field ?? "");
    if (!asked.has(f)) problems.push(`it wrote ${f || "a cell"} that was not asked for`);
    else if (a.verified !== true) problems.push(`${f} was written but not read back as equal`);
    else done.add(f);
  }
  for (const k of skipped) if (k.reason === "already") done.add(String(k.field ?? ""));
  for (const f of asked) if (!done.has(f) && !problems.some((p) => p.startsWith(f))) problems.push(`${f} was not confirmed`);
  if (applied.length && !(Array.isArray(result.changelog_rows) && result.changelog_rows.length >= applied.length)) problems.push("the CHANGELOG rows were not confirmed");
  return { ok: problems.length === 0, problems, written: applied.length };
}

/** A handoff entry is trusted when the bot read the cell back as exactly the sentence, or says it was already there. */
export function checkHandoffAnswer(text: string, result: Record<string, unknown>): WriteCheck {
  if (result.already === true) return { ok: true, problems: [], written: 0 };
  const problems: string[] = [];
  if (result.verified !== true) problems.push("the entry was not read back as equal");
  if (typeof result.text === "string" && result.text.trim() !== text.trim()) problems.push("the bot wrote different words than asked");
  if (!(Array.isArray(result.changelog_rows) && result.changelog_rows.length >= 1)) problems.push("the CHANGELOG row was not confirmed");
  return { ok: problems.length === 0, problems, written: problems.length ? 0 : 1 };
}

// ---------------- handoff sentences (the monthly tabs' UPDATES cells) ----------------

const mdy = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d }; };
/** `SUBMITTED TO JEP 9/28` */
export function submittedText(receiver: string, isoDate: string): string { const { m, d } = mdy(isoDate); return `SUBMITTED TO ${receiver.trim().toUpperCase()} ${m}/${d}`; }
/** `ORIG DOCS RECEIVED FROM JEP 11/07/2026` */
export function receivedText(receiver: string, isoDate: string): string { const { y, m, d } = mdy(isoDate); return `ORIG DOCS RECEIVED FROM ${receiver.trim().toUpperCase()} ${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`; }
