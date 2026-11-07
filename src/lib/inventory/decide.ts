import { applyStatus, parseStatus, readStatus, sheetName } from "./remarks";
import { UNIT_STATUS, type StatusRef, type UnitStatus } from "./types";

export type Decision = "change" | "same" | "conflict" | "missing";

/**
 * What to do with one car's note in the inventory sheet before writing it. The sheet is shared with staff, so the app only
 * writes when it is safe: an empty status, or a note that is this person's own (a reservation becoming a sale, a new date, a cancelled
 * deal being cleared). A note that names someone else, or is not in the usual format, is a conflict: nothing is written, and
 * the person is told what the sheet says, and what to do about it. Pure, so the rules are tested.
 */
export function decide(wants: UnitStatus, current: string | null, ref: StatusRef, dealNo = ""): { action: Decision; next: string; why: string; fix: string } {
  if (current === null) return { action: "missing", next: "", why: "This plate is not in the inventory sheet.", fix: "Add the car to the inventory sheet, or correct the plate on the deal, then retry." };
  const next = applyStatus(current, wants, ref);
  if (next === current.trim()) return { action: "same", next, why: "The sheet already says this.", fix: "" };
  const now = readStatus(current);
  if (now === UNIT_STATUS.available) {
    return wants === UNIT_STATUS.available ? { action: "same", next, why: "Nothing to clear.", fix: "" } : { action: "change", next, why: "The sheet has no status for this car.", fix: "" };
  }
  const ours = sheetName(ref.people[0]?.name ?? "");
  const parsed = parseStatus(current);
  const deal = dealNo ? ` (deal ${dealNo})` : "";
  if (parsed && parsed.names.includes(ours)) return { action: "change", next, why: "The note is this salesperson's own, so it is brought up to date.", fix: "" };
  if (parsed) {
    return {
      action: "conflict", next,
      why: `The sheet says "${parsed.text}", naming ${parsed.names.join(" and ")}, but this deal${deal} was opened by ${ours}.`,
      fix: `Ask ${parsed.names.join(" and ")} and ${ours} who has this car. If the sheet is right, keep its note and fix or cancel this deal. If the sheet is out of date, write the app's note: "${next.split(" | ")[0]}".`,
    };
  }
  return {
    action: "conflict", next,
    why: `The sheet's note starts with ${now.toUpperCase()} but is not in the usual format ("${current.trim().slice(0, 60)}"), so the app cannot tell whose it is.`,
    fix: `Open the row and see who wrote it. If it is the same sale, write the app's note ("${next.split(" | ")[0]}"). If not, keep the sheet's note and sort out the deal${deal}.`,
  };
}
