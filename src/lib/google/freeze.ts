// The Google Sheets freeze: while it is on, the app writes to NO sheet. Reading is not affected, and the work waits as pending
// sync jobs, so nothing is lost. SHEETS_WRITES decides: empty = everything frozen; "docs" = only the Docs Bible edits through the
// grokbot are allowed (the receipts log and the inventory status stay frozen); "on" = everything is allowed.
// Every write goes through the places that call this, so there is no way around it by accident.

/** "app": the receipts log and the inventory status. "docs": the Docs Bible edits through the grokbot. */
export type WriteScope = "app" | "docs";

const mode = () => (process.env.SHEETS_WRITES ?? "").trim().toLowerCase();

export const sheetsFrozen = (scope: WriteScope = "app"): boolean => (scope === "docs" ? mode() !== "on" && mode() !== "docs" : mode() !== "on");

export const FROZEN_MESSAGE = "Google Sheets are frozen: the app is not writing to any sheet right now. Reading still works, and the updates wait and are not lost.";

export class SheetsFrozenError extends Error {
  constructor() { super(FROZEN_MESSAGE); }
}

export function assertSheetsWritable(scope: WriteScope = "app"): void {
  if (sheetsFrozen(scope)) throw new SheetsFrozenError();
}
