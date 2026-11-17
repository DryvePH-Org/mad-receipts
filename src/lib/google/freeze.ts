// The Google Sheets freeze: while it is on, the app writes to NO sheet (the receipts log and the inventory status). Reading is not affected, and
// the work waits as pending sync jobs, so nothing is lost. SHEETS_WRITES decides: empty = frozen; "on" = writing is allowed.
// (The Docs Bible is in the database and is never written to a sheet.)
// Every write goes through the places that call this, so there is no way around it by accident.

const mode = () => (process.env.SHEETS_WRITES ?? "").trim().toLowerCase();

export const sheetsFrozen = (): boolean => mode() !== "on";

export const FROZEN_MESSAGE = "Google Sheets are frozen: the app is not writing to any sheet right now. Reading still works, and the updates wait and are not lost.";

export class SheetsFrozenError extends Error {
  constructor() { super(FROZEN_MESSAGE); }
}

export function assertSheetsWritable(): void {
  if (sheetsFrozen()) throw new SheetsFrozenError();
}
