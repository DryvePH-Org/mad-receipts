import "server-only";
import { formatDate, manilaToday } from "@/lib/dates";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createTelegramClient } from "@/lib/telegram";
import { tell, appUrl } from "@/lib/notify";
import { loadCar } from "./service";
import { docsDb } from "@/lib/docsbible/review-server";
import { spareKeyState } from "@/lib/pricelist/import";
import { adminChange, carsOut, handoffOf, isSoldCar, markBack, sendOut, setChecked, stampReminded } from "@/lib/transfers/handoff";
import { getSettings } from "@/lib/data";
import { cleanDetails, EMPTY_DETAILS, missingDetails, type UnitDetails } from "./details";

// What happens after the reading: the details checklist, approval (ready to market), and the Handoff of a sold car's papers.

type Admin = ReturnType<typeof createAdminClient>;
export interface WorkflowDeps { admin: Admin; notify: (text: string) => Promise<void> }

/** Telegram to the documents team (TELEGRAM_DOCS_CHAT_ID, else the main chat). A message that cannot be sent never stops the work. */
export const defaultWorkflowDeps = (): WorkflowDeps => ({
  admin: createAdminClient(),
  notify: async (text) => {
    try { await createTelegramClient(process.env.TELEGRAM_DOCS_CHAT_ID).sendMessage(text); }
    catch (e) { console.warn(`[docs] telegram not sent: ${e instanceof Error ? e.message : "unknown"}`); throw e; }
  },
});

/** The days between two reminders for a handed-off car. */
export const HANDOFF_EVERY_DAYS = 3;

export interface Workflow {
  scanNotifiedAt: string | null; soldReadyNotifiedAt: string | null;
  approvedAt: string | null; approvedByName: string | null; marketingNotifiedAt: string | null;
  handoffAt: string | null; handoffNote: string | null; handoffChecked: string[]; handoffReturnedAt: string | null;
}
const EMPTY: Workflow = { scanNotifiedAt: null, soldReadyNotifiedAt: null, approvedAt: null, approvedByName: null, marketingNotifiedAt: null, handoffAt: null, handoffNote: null, handoffChecked: [], handoffReturnedAt: null };

export async function loadWorkflow(plate: string, admin: Admin = createAdminClient()): Promise<{ workflow: Workflow; details: UnitDetails; detailsSaved: boolean }> {
  const key = normalizePlate(plate);
  const [{ data: w }, { data: d }] = await Promise.all([
    admin.from("unit_workflow").select("*").eq("plate_no", key).maybeSingle(),
    admin.from("unit_details").select("data").eq("plate_no", key).maybeSingle(),
  ]);
  // who approved the documents (the name, so the page can say who and when)
  const approver = w?.docs_approved_by ? (await admin.from("profiles").select("full_name").eq("id", w.docs_approved_by).maybeSingle()).data : null;
  // the handoff is kept on the car's sale/transfer record (migration 48), not in unit_workflow any more
  const hand = await handoffOf(key).catch(() => null);
  const handoff = { handoffAt: hand?.handedOffAt ?? null, handoffNote: hand?.note ?? null, handoffChecked: hand?.checked ?? [], handoffReturnedAt: hand?.backAt ?? null };
  return {
    workflow: { ...(w ? { scanNotifiedAt: w.scan_notified_at, soldReadyNotifiedAt: w.sold_ready_notified_at, approvedAt: w.docs_approved_at, approvedByName: approver?.full_name?.trim() || null, marketingNotifiedAt: w.marketing_notified_at, handoffAt: w.handoff_at, handoffNote: w.handoff_note, handoffChecked: w.handoff_checked ?? [], handoffReturnedAt: w.handoff_returned_at } : EMPTY), ...handoff },
    details: await withDocsSpareKey(key, d ? cleanDetails(d.data) : EMPTY_DETAILS), detailsSaved: !!d,
  };
}

/** The spare key is ONE fact, kept in the car's record. The car page always shows the record's answer; a stored answer of the checklist is only used when the record has none. */
async function withDocsSpareKey(plate: string, details: UnitDetails): Promise<UnitDetails> {
  try {
    const { data } = await docsDb().from("docs_units").select("spare_key").eq("plate_no", plate).is("archived_at", null).order("arrival_date", { ascending: false }).limit(1);
    const state = spareKeyState((data?.[0]?.spare_key as string | null) ?? null);
    return state === "unknown" ? details : { ...details, spareKey: state }; // the record wins, so the two can never drift apart
  } catch { return details; }
}

/** Answering "spare key" on the car page writes the same fact into the car's record, so Car status, the Table and the Excel all show it. */
async function writeSpareKeyToRecord(plate: string, answer: "yes" | "no" | "", actor: string): Promise<void> {
  if (!answer) return;
  try {
    const db = docsDb();
    const { data } = await db.from("docs_units").select("id, spare_key").eq("plate_no", plate).is("archived_at", null).order("arrival_date", { ascending: false }).limit(1);
    const unit = data?.[0];
    if (!unit || spareKeyState(unit.spare_key as string | null) === answer) return; // already says it (in the staff's own words)
    await db.from("docs_units").update({ spare_key: answer === "yes" ? "W/SPAREKEY" : "W/O SPAREKEY", last_change_source: "about", updated_by: actor }).eq("id", unit.id as string);
  } catch (e) { console.warn(`[docs] spare key not copied to the car's record: ${e instanceof Error ? e.message : "unknown"}`); }
}

const log = (admin: Admin, actor: string, action: string, plate: string, after: Json) =>
  admin.from("audit_logs").insert({ actor_id: actor, action, entity: "unit_folder", entity_id: null, after: { plate, ...(after as object) } as Json });

const upsertWorkflow = async (admin: Admin, plate: string, patch: Record<string, unknown>) => {
  const { error } = await admin.from("unit_workflow").upsert({ plate_no: plate, ...patch }, { onConflict: "plate_no" });
  if (error) throw new Error(/unit_workflow/.test(error.message) ? "This needs the latest database update (migration 24)." : "Could not save. Try again.");
};

const carName = (c: { folder: { folder_name: string | null; plate_display: string } }) => c.folder.folder_name ?? c.folder.plate_display;

export async function saveDetails(plate: string, data: unknown, actor: string, deps: Pick<WorkflowDeps, "admin"> = { admin: createAdminClient() }): Promise<void> {
  const key = normalizePlate(plate);
  const clean = cleanDetails(data);
  const { error } = await deps.admin.from("unit_details").upsert({ plate_no: key, data: clean as unknown as Json, updated_by: actor }, { onConflict: "plate_no" });
  if (error) throw new Error(/unit_details/.test(error.message) ? "Saving needs the latest database update (migration 24)." : "Could not save. Try again.");
  await writeSpareKeyToRecord(key, clean.spareKey, actor);
}

export type StepResult = { ok: true; notified?: boolean } | { ok: false; needsConfirm: true; missing: string[] } | { ok: false; error: string };

/** The staff checked everything: the documents are OK. Anything still open needs the person to say so; marketing is told on Telegram. */
export async function approveUnit(plate: string, actor: string, confirmIncomplete: boolean, deps: WorkflowDeps = defaultWorkflowDeps()): Promise<StepResult> {
  const key = normalizePlate(plate);
  const car = await loadCar(key, deps);
  if (!car?.folder.folder_id) return { ok: false, error: "This car has no folder linked." };
  const { workflow, details } = await loadWorkflow(key, deps.admin);
  if (workflow.approvedAt) return { ok: false, error: "These documents are already approved." };
  const before = car.checklist.items.filter((i) => i.stage === "available" && !i.present && !i.optional).map((i) => i.label);
  const flagged = car.analysis.files.filter((r) => r.flags.length || r.types.some((t) => t === "id_unmatched" || t === "deed_unmatched")).length;
  const missing = [
    ...before, ...(car.pending ? [`${car.pending} photo${car.pending === 1 ? "" : "s"} not read yet`] : []),
    ...(flagged ? [`${flagged} file${flagged === 1 ? "" : "s"} still to check`] : []), ...missingDetails(details),
  ];
  if (missing.length && !confirmIncomplete) return { ok: false, needsConfirm: true, missing };
  await upsertWorkflow(deps.admin, key, { docs_approved_at: new Date().toISOString(), docs_approved_by: actor });
  await log(deps.admin, actor, "docs.approve", key, { complete: missing.length === 0, missing });
  let notified = false;
  try { await deps.notify(`✅ Documents OK, ready to market\n${carName(car)}\nTake the photos and videos and post it.`); notified = true; } catch { /* the approval stands; the screen says it was not sent */ }
  if (notified) await upsertWorkflow(deps.admin, key, { marketing_notified_at: new Date().toISOString() });
  return { ok: true, notified };
}

/** Right after photos are read: tell the staff once that the scan is finished, and tell them once when a sold car's papers are complete. */
export async function afterReading(plate: string, deps: WorkflowDeps = defaultWorkflowDeps()): Promise<void> {
  const key = normalizePlate(plate);
  const car = await loadCar(key, deps);
  if (!car || car.pending > 0 || !car.files.some((f) => f.read_status === "done")) return;
  await import("@/lib/docsbible/fill-papers").then((m) => m.fillFoundPapers(car)).catch(() => undefined); // empty paper boxes of the car's row say Yes for what the scan found
  const { workflow } = await loadWorkflow(key, deps.admin);
  if (!workflow.scanNotifiedAt) {
    const flagged = car.analysis.files.filter((r) => r.flags.length).length, missing = car.checklist.items.filter((i) => i.stage === "available" && !i.present && !i.optional).length;
    await upsertWorkflow(deps.admin, key, { scan_notified_at: new Date().toISOString() });
    await deps.notify(`🔎 Scanned: ${carName(car)}\n${flagged ? `${flagged} file${flagged === 1 ? "" : "s"} to check` : "No red flags"}${missing ? `, ${missing} paper${missing === 1 ? "" : "s"} missing` : ""}.\nOpen it in the app, check, add the details and approve.`).catch(() => undefined);
    const failedFiles = car.files.filter((f) => f.read_status === "failed").length;
    await tell({ category: "scan_result", dedupe: `scan:${key}:${new Date().toISOString().slice(0, 13)}`, text: `${failedFiles ? "⚠️ Scan finished, some photos could not be read" : flagged || missing ? "🔎 Scan finished with warnings" : "🔎 Scan finished, no warnings"}\n${carName(car)}${flagged ? `\n${flagged} file${flagged === 1 ? "" : "s"} to check` : ""}${missing ? `\n${missing} paper${missing === 1 ? "" : "s"} missing` : ""}${failedFiles ? `\n${failedFiles} photo${failedFiles === 1 ? "" : "s"} not readable` : ""}\n${appUrl(`/documents/${key}`)}` });
  }
  if (!workflow.soldReadyNotifiedAt && car.checklist.items.find((i) => i.key === "ack")?.present && car.folder.location === "available" && car.checklist.complete) {
    await upsertWorkflow(deps.admin, key, { sold_ready_notified_at: new Date().toISOString() });
    await deps.notify(`📦 Sold, documents complete\n${carName(car)}\nMove the folder to Sold, then review it for handoff.`).catch(() => undefined);
    await tell({ category: "ready_to_sold", dedupe: `ready:${key}`, text: `📦 Documents complete: move to Sold\n${carName(car)}\n${appUrl(`/documents/${key}`)}` });
  }
}

export async function setHandoffChecked(plate: string, keys: string[], actor: string): Promise<void> {
  await setChecked(normalizePlate(plate), keys, actor);
}

/** The staff reviewed the papers of a sold car and handed them over. From now on they are reminded every 3 days until they come back. */
export async function handoffUnit(plate: string, note: string, actor: string, confirmIncomplete: boolean, deps: WorkflowDeps = defaultWorkflowDeps()): Promise<StepResult> {
  const key = normalizePlate(plate);
  const car = await loadCar(key, deps);   // null for a sold car that has no folder in Drive: its originals can still go to the liaison
  if (car ? car.folder.location !== "sold" && !(await isSoldCar(key)) : !(await isSoldCar(key))) return { ok: false, error: car ? "Move the folder to Sold first." : "Mark the car as Sold first." };
  const { workflow } = await loadWorkflow(key, deps.admin);
  if (workflow.handoffAt && !workflow.handoffReturnedAt) return { ok: false, error: "These documents are already handed off." };
  const list = car?.checklist.items ?? [];
  const unchecked = list.filter((i) => !workflow.handoffChecked.includes(i.key)).map((i) => `Not ticked: ${i.label}`);
  const missing = [...list.filter((i) => !i.present && !i.optional).map((i) => `Missing: ${i.label}`), ...unchecked.filter((u) => !list.some((i) => !i.optional && !i.present && u.endsWith(i.label)))];
  if (missing.length && !confirmIncomplete) return { ok: false, needsConfirm: true, missing };
  const receiver = (await getSettings().catch(() => null))?.print.transmittalReceiver ?? "";
  await sendOut(key, note, workflow.handoffChecked, actor, receiver);
  await log(deps.admin, actor, "docs.handoff", key, { complete: missing.length === 0, missing });
  return { ok: true };
}

/** The documents came back: no more reminders. */
export async function returnUnit(plate: string, actor: string, deps: Pick<WorkflowDeps, "admin"> = { admin: createAdminClient() }): Promise<StepResult> {
  const key = normalizePlate(plate);
  const { workflow } = await loadWorkflow(key, deps.admin);
  if (!workflow.handoffAt || workflow.handoffReturnedAt) return { ok: false, error: "These documents are not out on handoff." };
  await markBack(key, actor);
  await log(deps.admin, actor, "docs.handoff_returned", key, {});
  return { ok: true };
}

/**
 * Admin only (the action checks): change a step that was already taken. "approval" is withdrawn so it can be approved again (marketing is told again then);
 * "handoff-edit" changes the note and the ticks of a handoff; "handoff-reopen" says the papers are not back after all; "handoff-undo" takes the handoff back.
 * Nothing is deleted: the handoff history of the register keeps what was recorded, and every change is logged with who made it.
 */
export type AdminFix = { kind: "approval" } | { kind: "handoff-edit"; note: string; checked: string[] } | { kind: "handoff-reopen" } | { kind: "handoff-undo" } | { kind: "step-back" };
export async function adminFix(plate: string, fix: AdminFix, actor: string, deps: Pick<WorkflowDeps, "admin"> = { admin: createAdminClient() }): Promise<StepResult> {
  const key = normalizePlate(plate);
  const { workflow } = await loadWorkflow(key, deps.admin);
  switch (fix.kind) {
    case "approval":
      if (!workflow.approvedAt) return { ok: false, error: "These documents are not approved." };
      await upsertWorkflow(deps.admin, key, { docs_approved_at: null, docs_approved_by: null, marketing_notified_at: null });
      break;
    case "handoff-edit": case "handoff-reopen": case "handoff-undo": case "step-back": {
      const r = await adminChange(key, fix.kind === "handoff-edit" ? { kind: "edit", note: fix.note, checked: fix.checked } : fix.kind === "handoff-reopen" ? { kind: "reopen" } : fix.kind === "handoff-undo" ? { kind: "undo" } : { kind: "step-back" }, actor);
      if (!r.ok) return r;
      break;
    }
  }
  await log(deps.admin, actor, `docs.admin_${fix.kind.replace("-", "_")}`, key, fix.kind === "handoff-edit" ? { note: fix.note, checked: fix.checked } : {});
  return { ok: true };
}

// ---------------- the reminder every 3 days ----------------

export interface HandoffRow { plate: string; name: string; since: string }

export function buildHandoffReminder(rows: HandoffRow[], today: string, to: string): string | null {
  if (!rows.length) return null;
  const days = (iso: string) => Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) / 86_400_000));
  const lines = rows.slice(0, 40).map((r) => `• ${r.name} · handed off ${formatDate(r.since.slice(0, 10))} (${days(r.since)} days)`);
  return [`📋 Documents still with ${to}`, "Not yet returned. Press “Mark as done” in the app once they are back at MAD.", lines.join("\n"), rows.length > 40 ? `…and ${rows.length - 40} more.` : ""].filter(Boolean).join("\n\n");
}

/** Run once a day: one message listing every handed-off car whose last reminder (or handoff) was 3 or more days ago. */
export async function runHandoffReminders(to: string, deps: WorkflowDeps = defaultWorkflowDeps(), now = new Date()): Promise<{ sent: boolean; cars: number }> {
  const cutoff = new Date(now.getTime() - HANDOFF_EVERY_DAYS * 86_400_000 + 3_600_000).toISOString(); // an hour of slack so a daily run does not slip a day
  const out = await carsOut();
  const due = out.filter((h) => (h.lastRemindedAt ?? h.handedOffAt!) <= cutoff);
  if (!due.length) return { sent: false, cars: 0 };
  const { data: folders } = await deps.admin.from("unit_folders").select("plate_no, plate_display, folder_name").in("plate_no", due.map((d) => d.plate));
  const nameOf = new Map((folders ?? []).map((f) => [f.plate_no, f.folder_name ?? f.plate_display]));
  const message = buildHandoffReminder(due.map((d) => ({ plate: d.plate, name: nameOf.get(d.plate) ?? d.plate, since: d.handedOffAt! })).sort((a, b) => a.since.localeCompare(b.since)), manilaToday(), to);
  if (!message) return { sent: false, cars: 0 };
  await deps.notify(message);
  await tell({ category: "handoff_reminder", dedupe: `handoff:${manilaToday()}`, text: message });
  const stamp = now.toISOString();
  await stampReminded(due.map((d) => d.transferId), stamp);
  return { sent: true, cars: due.length };
}
