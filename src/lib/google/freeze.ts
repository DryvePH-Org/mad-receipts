// The Google Sheets freeze: while it is on, the app writes to NO sheet (the receipts log, the inventory status, the replay).
// Reading is not affected, and the work waits as pending sync jobs, so nothing is lost. It is ON unless SHEETS_WRITES=on.
// Every write goes through the two places that call this, so there is no way around it by accident.

export const sheetsFrozen = (): boolean => process.env.SHEETS_WRITES?.trim().toLowerCase() !== "on";

export const FROZEN_MESSAGE = "Google Sheets are frozen: the app is not writing to any sheet right now. Reading still works, and the updates wait and are not lost.";

export class SheetsFrozenError extends Error {
  constructor() { super(FROZEN_MESSAGE); }
}

export function assertSheetsWritable(): void {
  if (sheetsFrozen()) throw new SheetsFrozenError();
}
