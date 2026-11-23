import { CASE_LABELS, type CaseType } from "./types";

// What the car's activity history says for each thing a person did (the audit log keeps the action and a few facts). Pure, so it can be tested.

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function describeActivity(action: string, afterRaw: unknown): string {
  const a = asObj(afterRaw), file = str(a.file);
  const f = file ? ` (${file})` : "";
  switch (action) {
    case "docs.upload": return `Uploaded a photo${f}`;
    case "docs.archive_add": return `Added a payment paper: ${str(a.tag) || "payment"}${f}`;
    case "docs.archive_remove": return `Removed a payment paper${f}`;
    case "docs.sale_add": return `Added the sale${str(a.buyer) ? ` for ${str(a.buyer)}` : ""}`;
    case "docs.sale_from_ar": return `The sale was made from the uploaded AR${str(a.buyer) ? ` (${str(a.buyer)})` : ""}`;
    case "docs.payment_status": return str(a.status) ? `Set the payment status to ${str(a.status)}` : "Cleared the payment status";
    case "docs.save_details": return "Saved the details about the car";
    case "docs.approve": return list(a.missing).length ? `Approved the documents with ${list(a.missing).length} still open` : "Approved the documents";
    case "docs.move_to_sold": return list(a.missing).length ? `Moved the folder to Sold with ${list(a.missing).length} still open` : "Moved the folder to Sold";
    case "docs.handoff": return "Handed the originals off";
    case "docs.handoff_returned": return "The originals came back";
    case "docs.transfer_released": return `Marked the originals released${str(a.to) ? ` to ${str(a.to)}` : ""}`;
    case "docs.transfer_delivered": return "Marked the originals delivered to the buyer";
    case "docs.set_case": return str(a.case) === "auto" || !str(a.case) ? "Let the bot suggest the case" : `Chose the case: ${CASE_LABELS[str(a.case) as CaseType] ?? str(a.case)}`;
    case "docs.set_types": return `Changed what a photo is${f}`;
    case "docs.edit_reading": return `Corrected what the bot read${f}`;
    case "docs.accept_flag": return `Checked a warning: it is fine${f}`;
    case "docs.unaccept_flag": return `Brought a warning back${f}`;
    case "docs.reset_file": return `Went back to the bot's reading${f}`;
    case "docs.remove_file": return `Removed a photo from the folder${f}`;
    case "docs.transmittal": return "Saved the transmittal receipt";
    case "docs.admin_approval": return "An Admin withdrew the approval";
    case "docs.admin_handoff_reopen": return "An Admin reopened the handoff";
    case "docs.admin_handoff_undo": return "An Admin took the handoff back";
    case "docs.admin_handoff_edit": return "An Admin changed the handoff";
    case "docs.admin_step_back": return "An Admin took the last step back";
    case "unit.remove": return "The car was taken out of MAD";
    default: return action.replace(/^docs\./, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  }
}

export interface ActivityEntry { id: string; at: string; who: string; text: string }
