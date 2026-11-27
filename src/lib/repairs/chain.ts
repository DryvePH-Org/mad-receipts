// The escalation chain for repair approvals: who is asked, when the next person is asked, and what the Telegram message says. Pure code (tested); the sending is in approval-chain.ts.

export const REPAIR_TOPIC = "repair_approval";
export const DEFAULT_WAIT_MINUTES = 120;
/** A report is chased at most this many times (the chain can go round a few times; then the group and the Repairs page still show it). */
export const MAX_ASKS = 12;

export interface ChainPerson { userId: string; name: string; position: number; waitMinutes: number; chatId: number | null }

/** Who to ask next: the person after the one asked last (the chain goes round), skipping anyone who has not connected Telegram. Null when nobody can be asked. */
export function pickNext(chain: readonly ChainPerson[], lastUserId: string | null, skipUserIds: readonly string[] = []): ChainPerson | null {
  if (!chain.length) return null;
  const at = lastUserId ? chain.findIndex((p) => p.userId === lastUserId) : -1;
  for (let i = 1; i <= chain.length; i++) {
    const p = chain[(at + i + chain.length) % chain.length];
    if (p.chatId !== null && !skipUserIds.includes(p.userId)) return p;
  }
  return null;
}

/** The time to wait before the next person: the one the last person was given (2 hours when they left the chain). */
export const waitFor = (chain: readonly ChainPerson[], lastUserId: string): number => chain.find((p) => p.userId === lastUserId)?.waitMinutes ?? DEFAULT_WAIT_MINUTES;

export const isDue = (sentAt: Date, waitMinutes: number, now: Date): boolean => now.getTime() - sentAt.getTime() >= waitMinutes * 60_000;

export interface AskReport { plate: string; vehicle: string | null; problems: string[]; reportedBy: string | null }

export function askText(r: AskReport, level: number, waitMinutes: number, who: string): string {
  const head = level === 1 ? `🔧 Repair report: your approval, ${who}` : `⏰ Still waiting: nobody decided yet, so it is your turn, ${who}`;
  const hours = waitMinutes % 60 === 0 ? `${waitMinutes / 60} hour${waitMinutes === 60 ? "" : "s"}` : `${waitMinutes} minutes`;
  return [head, `${r.plate}${r.vehicle ? ` · ${r.vehicle}` : ""}`, ...r.problems.slice(0, 8).map((p) => `• ${p}`), r.reportedBy ? `Reported by ${r.reportedBy}` : "", level === 1 ? `If you do not decide in ${hours}, the next person in line is asked.` : ""].filter(Boolean).join("\n");
}

export const askButtons = (askId: string, openUrl: string) => ({
  inline_keyboard: [
    [{ text: "✅ Approve", callback_data: `ra:${askId}:ok` }, { text: "✅ Approve · can display", callback_data: `ra:${askId}:okd` }],
    [{ text: "❌ Reject", callback_data: `ra:${askId}:no` }],
    [{ text: "Open in MAD", url: openUrl }],
  ],
});

export type AskAction = "ok" | "okd" | "no";
export function parseAskCallback(data: string | undefined): { askId: string; action: AskAction } | null {
  const m = /^ra:([0-9a-f-]{36}):(ok|okd|no)$/.exec(data ?? "");
  return m ? { askId: m[1], action: m[2] as AskAction } : null;
}

export const decidedText = (original: string, approve: boolean, by: string, reason: string): string =>
  `${original}\n\n${approve ? `✅ Approved by ${by}` : `❌ Rejected by ${by}${reason ? `: ${reason}` : ""}`}`;
