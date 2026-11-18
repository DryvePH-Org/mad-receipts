/** Quiet hours in Manila time: nothing is sent from 21:00 to 07:00 (urgent messages ignore this); held messages go out at 07:00. */
export const QUIET_FROM = 21, QUIET_TO = 7;

const MANILA_OFFSET_MS = 8 * 3_600_000;
const manilaHour = (now: Date) => new Date(now.getTime() + MANILA_OFFSET_MS).getUTCHours();

export function isQuiet(now: Date): boolean {
  const h = manilaHour(now);
  return h >= QUIET_FROM || h < QUIET_TO;
}

/** When a message held for quiet hours may go: the coming 07:00 Manila (now, when it is not quiet). */
export function sendAfter(now: Date): Date {
  if (!isQuiet(now)) return now;
  const m = new Date(now.getTime() + MANILA_OFFSET_MS);
  const day = Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate() + (m.getUTCHours() >= QUIET_FROM ? 1 : 0), QUIET_TO, 0, 0);
  return new Date(day - MANILA_OFFSET_MS);
}
