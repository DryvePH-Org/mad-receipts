// One list for the Car documents module: every car of the register, with what the folder and the scan know about it. Pure helpers here;
// the server function that reads the tables is in unified-server.ts.

export type StageKey = "none" | "link" | "scan" | "review" | "ready" | "approved" | "sold" | "handoff" | "done";
export type StageTone = "zinc" | "blue" | "amber" | "teal" | "emerald" | "purple";
export const STAGES: Record<StageKey, { label: string; tone: StageTone }> = {
  none: { label: "Not started", tone: "zinc" }, link: { label: "Folder not linked", tone: "zinc" }, scan: { label: "Needs scan", tone: "blue" }, review: { label: "In review", tone: "amber" },
  ready: { label: "Ready to approve", tone: "teal" }, approved: { label: "Approved", tone: "emerald" }, sold: { label: "In Sold, handoff next", tone: "blue" },
  handoff: { label: "With the processor", tone: "purple" }, done: { label: "Papers done", tone: "emerald" },
};

export interface StageFacts {
  hasFolder: boolean; linked: boolean; files: number; location: "available" | "sold" | null;
  /** the scan/checklist result of the folder: unread photos, flagged or missing papers, complete */
  folderStatus: "unlinked" | "unread" | "review" | "missing" | "complete" | null;
  approved: boolean; handoffAt: string | null; returnedAt: string | null;
}

/** Where a car stands, in one word for the list. */
export function stageOf(f: StageFacts): StageKey {
  if (f.returnedAt) return "done";
  if (f.handoffAt) return "handoff";
  if (f.location === "sold") return "sold";
  if (f.approved) return "approved";
  if (!f.hasFolder || f.files === 0) return f.hasFolder && !f.linked ? "link" : "none";
  if (!f.linked || f.folderStatus === "unlinked") return "link";
  if (f.folderStatus === "unread") return "scan";
  if (f.folderStatus === "complete") return "ready";
  return "review";
}

const REQUIRED: Record<string, string[]> = {
  "Clean": ["cr", "or_receipt", "deed", "sellers_id"],
  "Repo (bank)": ["cr", "or_receipt", "deed", "sellers_id", "chattel", "sec_cert", "sec_ids"],
  "Encumbered (Indiv)": ["cr", "or_receipt", "deed", "sellers_id", "encumbered", "chattel"],
};
/** "5 of 7 papers": how many of the papers this classification needs are marked Yes. Null for a car with no classification. */
export function paperProgress(values: Record<string, string | null>): { have: number; need: number } | null {
  const need = REQUIRED[values.classification ?? ""];
  return need ? { have: need.filter((k) => values[k] === "Yes").length, need: need.length } : null;
}

export interface UnifiedRow {
  /** the register row (null for a car that has a folder but is not in the register yet) */
  unitId: string | null;
  plate: string; plateDisplay: string; car: string;
  caseLabel: string; stage: StageKey; papers: { have: number; need: number } | null;
  flagged: boolean; decisions: number; files: number; location: "available" | "sold" | null;
  /** which Drive folder the car is in right now: Available units, Sold units, or none (no folder linked) */
  folder: FolderKey;
  buyer: string | null; complete: string | null; searchText: string;
}

export type FolderKey = "available" | "sold" | "none";
export type FolderFilter = "all" | FolderKey;
export const FOLDER_FILTERS: { key: FolderFilter; label: string }[] = [
  { key: "all", label: "Any folder" }, { key: "available", label: "In Available units" }, { key: "sold", label: "In Sold units" }, { key: "none", label: "No folder" },
];

export type ChipKey = "all" | "scan" | "review" | "approved" | "sold" | "handoff" | "none";
export const CHIPS: { key: ChipKey; label: string; stages: StageKey[] }[] = [
  { key: "all", label: "All", stages: [] }, { key: "scan", label: "Needs scan", stages: ["scan", "link"] }, { key: "review", label: "In review", stages: ["review", "ready"] },
  { key: "approved", label: "Approved", stages: ["approved"] }, { key: "sold", label: "In Sold", stages: ["sold"] }, { key: "handoff", label: "With processor", stages: ["handoff"] },
  { key: "none", label: "Not started", stages: ["none"] },
];
export function filterUnified(rows: UnifiedRow[], chip: ChipKey, q: string, onlyAttention: boolean, folder: FolderFilter = "all"): UnifiedRow[] {
  const stages = CHIPS.find((c) => c.key === chip)?.stages ?? [];
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((r) => (chip === "all" || stages.includes(r.stage)) && (folder === "all" || r.folder === folder) && (!onlyAttention || r.flagged || r.decisions > 0) && words.every((w) => r.searchText.includes(w)));
}
