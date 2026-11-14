// What a bot job is, in words staff understand, and where it is in the line.

const DOING: Record<string, string> = { docs_scan: "The bot is scanning the photos", docs_row: "The bot is reading the sheet", docs_update: "The bot is writing the checklist to the sheet", docs_handoff: "The bot is writing the handoff to the sheet", ping: "The bot is answering a test" };
const WAITING: Record<string, string> = { docs_scan: "Waiting for the scanner", docs_row: "Waiting to read the sheet", docs_update: "Waiting to write to the sheet", docs_handoff: "Waiting to write the handoff", ping: "Waiting for the bot" };

export const ordinal = (n: number): string => { const v = n % 100; return `${n}${v >= 11 && v <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`; };

export function workLabel(action: string, status: "queued" | "sent", position: number | null): string {
  if (status === "sent") return DOING[action] ?? "The bot is working";
  const base = WAITING[action] ?? "Waiting for the bot";
  return position && position > 1 ? `${base}: ${ordinal(position)} in line` : `${base}: next in line`;
}

export const BOT_NAME: Record<"scan" | "sheet", string> = { scan: "Scanner", sheet: "Sheet editor" };
