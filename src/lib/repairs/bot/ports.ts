import type { Draft, DraftData, DraftState } from "./draft";
import type { Keyboard } from "./cards";
import type { Lang } from "./texts";
import type { CarLite, Vocabulary } from "./understand";

// What the bot's flow needs from the outside world, so the flow can be tested with fakes and run for real with Telegram and the database.

export type PersonRole = "repairman" | "approver" | "admin";
export interface Person { tgId: number; name: string; role: PersonRole; lang: Lang | null }
export type AwaitKind = "edit" | "text" | "reject";

export interface Tg {
  send(chatId: number, text: string, opts?: { replyTo?: number | null; keyboard?: Keyboard | null }): Promise<number>;
  edit(chatId: number, messageId: number, text: string, keyboard?: Keyboard | null): Promise<void>;
  answer(callbackId: string, text?: string, alert?: boolean): Promise<void>;
  remove(chatId: number, messageId: number): Promise<void>;
}

export interface Store {
  person(tgId: number): Promise<Person | null>;
  approvers(): Promise<Person[]>;
  setLang(tgId: number, lang: Lang): Promise<void>;
  groupLang(): Promise<Lang | null>;
  setGroupLang(lang: Lang): Promise<void>;
  saveDraft(d: Draft): Promise<void>;
  getDraft(id: string): Promise<Draft | null>;
  /** Moves a draft from one of these states to another in one step, so two taps can never both win. Returns the draft when this call did it. */
  claim(id: string, from: DraftState[], to: DraftState): Promise<Draft | null>;
  setAwaiting(kind: AwaitKind, chatId: number, userId: number, ref: string | null): Promise<void>;
  takeAwaiting(kind: AwaitKind, chatId: number, userId: number): Promise<string | null | undefined>;
  hasAwaiting(kind: AwaitKind, chatId: number, userId: number): Promise<boolean>;
  /** False when this Telegram update was handled before (Telegram sends it again when we answer late). */
  firstTime(updateId: number): Promise<boolean>;
  /** Counts one use of today; false (and not counted) once the daily cap is reached. */
  takeCap(kind: "jobs" | "voice", cap: number): Promise<boolean>;
}

export interface Ports {
  tg: Tg;
  store: Store;
  groupChatId: number;
  defaultLang: Lang;
  today(): string;
  nowText(): string;
  newId(): string;
  caps: { jobs: number; voice: number };
  read(system: string, user: string): Promise<string>;
  cars(): Promise<CarLite[]>;
  vocabulary(): Promise<Vocabulary>;
  /** The report's problems become pending jobs of the Repairs module. */
  saveReport(d: Draft): Promise<{ ok: true } | { ok: false; error: string }>;
  /** An Approver's decision on the report's jobs. */
  decide(d: Draft, approve: boolean, by: { name: string; tgId: number }, reason: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Words from a voice note (stage 2). Missing means voice is not set up. */
  transcribe?: (fileId: string, durationSeconds: number | undefined) => Promise<string>;
}

export type { Draft, DraftData };
