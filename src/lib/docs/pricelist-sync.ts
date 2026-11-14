import "server-only";
import { loadCars, readCarsNow } from "@/lib/cars/read";
import { GrokbotError, sendJob } from "@/lib/grokbot/client";
import { SheetsFrozenError, sheetsFrozen } from "@/lib/google/freeze";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";
import { BACKGROUND_WAIT_MS, carInput, saveSyncRecord, type BibleDeps } from "./bible-sync";
import { checkWriteAnswer } from "./bible";
import { detectionsOf } from "./car";
import { planPricelist, PRICELIST_FIELDS, type PricelistChange, type PricelistField, type PricelistInput } from "./pricelist";

// Updating the MAD Pricelist (INVENTORY 2026) from a car's documents, through the sheet editor bot. The instant preview is built from the
// inventory the Car status page already reads; the bot checks every cell again when the changes are sent.

type Admin = ReturnType<typeof createAdminClient>;
export const pricelistSheetId = () => process.env.PRICELIST_SHEET_ID?.trim() || process.env.CARS_SHEET_ID?.trim() || undefined;
export const pricelistTab = () => process.env.PRICELIST_TAB?.trim() || "INVENTORY 2026";

/** What the car's documents say, in the terms the pricelist rules use. */
export async function documentFacts(plate: string, admin: Admin): Promise<Omit<PricelistInput, "current">> {
  const { car, present, flags, details } = await carInput(plate, admin);
  const dets = car.files.flatMap((f) => detectionsOf(f.details) ?? []);
  const dates = dets.filter((d) => d.type === "official_receipt" && d.validUntil).map((d) => d.validUntil as string).sort();
  const lender = (dets.find((d) => d.type === "chattel_cancellation" && d.lender) ?? dets.find((d) => d.type === "promissory_note" && d.lender))?.lender ?? null;
  return {
    docsComplete: car.pending === 0 && car.files.some((f) => f.read_status === "done") && car.checklist.items.filter((i) => i.stage === "available").every((i) => i.present) && flags.length === 0,
    orValidUntil: dates.at(-1) ?? null, spareKey: details.spareKey, lender, released: present.has("chattel_cancellation"),
  };
}

export interface PricelistPreview { changes: { header: string; before: string | null; after: string }[]; notes: string[]; found: boolean }

/** The instant preview from the inventory read the Car status page uses. */
export async function previewPricelistFast(plate: string, admin: Admin = createAdminClient()): Promise<PricelistPreview> {
  const key = normalizePlate(plate);
  const [facts, data] = await Promise.all([documentFacts(key, admin), loadCars()]);
  const unit = data.cars.find((c) => c.plate === key);
  if (!unit) return { changes: [], notes: ["This plate is not in the inventory tab of the pricelist."], found: false };
  const plan = planPricelist({ ...facts, current: { docs: unit.docsCode, orExp: unit.orExp, spareKey: unit.spareKey, encumbrance: unit.encumbrance } });
  return { changes: plan.changes.map((c) => ({ header: PRICELIST_FIELDS[c.field].header, before: c.before, after: c.after })), notes: plan.notes, found: true };
}

/** Reads the unit's row through the bot (the real cells), plans, and writes only what still applies. */
export async function sendPricelist(plate: string, actor: string, deps: BibleDeps): Promise<{ ok: true; written: number } | { ok: false; status: "frozen" | "failed"; message: string }> {
  const key = normalizePlate(plate), sheet = pricelistSheetId();
  try {
    if (!sheet) throw new GrokbotError("The MAD Pricelist is not set (PRICELIST_SHEET_ID).");
    if (sheetsFrozen("docs")) throw new SheetsFrozenError();
    const facts = await documentFacts(key, deps.admin);
    // the current cells come from the inventory tab read now as plain CSV (exact, about a second); the bot checks every cell again before writing
    const unit = (await readCarsNow()).cars.find((c) => c.plate === key);
    if (!unit) { const message = "This plate is not in the pricelist's inventory tab."; await saveSyncRecord(deps.admin, key, "pricelist", "failed", {}, message, null, actor); return { ok: false, status: "failed", message }; }
    const plan = planPricelist({ ...facts, current: { docs: unit.docsCode, orExp: unit.orExp, spareKey: unit.spareKey, encumbrance: unit.encumbrance } });
    if (!plan.changes.length) { await saveSyncRecord(deps.admin, key, "pricelist", "done", { changes: [], notes: plan.notes }, null, null, actor); return { ok: true, written: 0 }; }
    if (await (await import("./bible-sync")).writeInFlight(deps.admin, key)) return { ok: true, written: 0 };
    const { jobId, result } = await sendJob("inventory_update", { plate: key, tab: pricelistTab(), changes: plan.changes, log_sheet_id: deps.sheetId ?? "", reason: "Documents approved in the MAD app", actor: actor.slice(0, 8), dry_run: false }, deps.grok, { sheetId: sheet, timeoutMs: BACKGROUND_WAIT_MS, createdBy: actor });
    const check = checkWriteAnswer(plan.changes.map((c: PricelistChange) => ({ field: c.field as PricelistField })), result);
    if (!check.ok) { const message = `The bot's answer could not be trusted (${check.problems.join("; ")}). Open the row in the pricelist and check it.`; await saveSyncRecord(deps.admin, key, "pricelist", "failed", { problems: check.problems }, message.slice(0, 500), jobId, actor); return { ok: false, status: "failed", message }; }
    await saveSyncRecord(deps.admin, key, "pricelist", "done", { applied: result.applied ?? [], notes: plan.notes }, null, jobId, actor);
    return { ok: true, written: check.written };
  } catch (err) {
    if (err instanceof SheetsFrozenError) { await saveSyncRecord(deps.admin, key, "pricelist", "frozen", {}, null, null, actor); return { ok: false, status: "frozen", message: err.message }; }
    const message = err instanceof Error ? err.message : "Could not update the pricelist.";
    await saveSyncRecord(deps.admin, key, "pricelist", "failed", {}, message.slice(0, 500), null, actor);
    return { ok: false, status: "failed", message };
  }
}
