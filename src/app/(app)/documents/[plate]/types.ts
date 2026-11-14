import type { Detection } from "@/lib/docs/types";
import type { CaseType } from "@/lib/docs/types";
import type { Rules, StageModel } from "@/lib/docs/stage";

export interface FileView {
  id: string; rotation: number; name: string; url: string | null; source: string; readStatus: string; readError: string | null;
  types: string[]; manual: boolean; edited: boolean; reviewed: string[]; flags: string[]; duplicateOf: string | null; confidence: number | null;
  /** what the bot saw on this photo, shown under "What the bot saw" */
  seen: { detections: Detection[]; notes: string | null };
}

export interface CarViewData {
  plate: string; plateDisplay: string; name: string; location: "available" | "sold"; match: "linked" | "none" | "several"; folderUrl: string | null;
  candidates: { id: string; name: string; url: string; root: string }[];
  caseType: CaseType; suggestedCase: CaseType; caseReason: string; caseSource: "auto" | "manual";
  deal: { id: string; dealNo: string; buyerName: string; hasReceipt: boolean } | null;
  items: { key: string; label: string; stage: "available" | "sold"; present: boolean; fileIds: string[] }[];
  files: FileView[];
  /** the grokbot reads the photos (together, in the background) instead of a picture API */
  botMode: boolean; scanning: boolean;
  /** what the bots are doing or waiting to do for this car, with the place in line */
  botWork: { label: string; waiting: boolean }[];
  scanned: boolean; pending: number; failed: number; statusLabel: string; statusKey: string;
  isAdmin: boolean;
}

export type { Rules, StageModel };
