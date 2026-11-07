/** The "delete everything" buttons in Settings: what each one removes, and the words the Admin must type first. */
export type ResetKind = "transactions" | "sync" | "activity" | "documents" | "everything";

export interface ResetInfo {
  kind: ResetKind;
  title: string;
  /** what goes */
  removes: string;
  /** what stays */
  keeps: string;
  /** typed exactly, as shown */
  phrase: string;
}

export const RESETS: ResetInfo[] = [
  { kind: "transactions", title: "Delete all transactions", phrase: "DELETE ALL TRANSACTIONS",
    removes: "Every deal and receipt, their payments, the uploaded proof photos, the sync jobs waiting on them, and the car folder links to deals. Deal numbers start again at D1001.",
    keeps: "Users, settings, the activity log, and everything in Google Sheets and Drive (the inventory sheet is not changed back)." },
  { kind: "sync", title: "Delete sync jobs", phrase: "DELETE SYNC JOBS",
    removes: "The list of pending and finished sync jobs (Drive, Sheets, Telegram, inventory).",
    keeps: "Deals, receipts, and anything already sent to Google or Telegram." },
  { kind: "activity", title: "Delete the activity log", phrase: "DELETE ACTIVITY LOG",
    removes: "Every line of the activity log. One line saying who cleared it is added.",
    keeps: "Deals, receipts, users and settings." },
  { kind: "documents", title: "Delete the car documents list", phrase: "DELETE CAR DOCUMENTS LIST",
    removes: "The app's list of car folders and the files it has read and sorted.",
    keeps: "The files and folders in Google Drive. The list is rebuilt when Documentation refreshes the folders (the photos are read again)." },
  { kind: "everything", title: "Delete everything above", phrase: "DELETE EVERYTHING",
    removes: "All of the above in one go: transactions, sync jobs, the activity log and the car documents list.",
    keeps: "Users and their roles, the settings, and everything in Google Sheets and Drive." },
];

export const resetInfo = (kind: string): ResetInfo | undefined => RESETS.find((r) => r.kind === kind);

/** The typed words must match exactly (apart from spaces at either end). */
export const phraseMatches = (kind: string, typed: string): boolean => {
  const info = resetInfo(kind);
  return !!info && typed.trim() === info.phrase;
};
