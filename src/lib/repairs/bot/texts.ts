import texts from "./texts.json";

// All the words the bot says, in English (en), Tagalog (tl) and Taglish (mix): the old bot's own wording, so the repairmen see the same messages.
export const LANGS = ["en", "tl", "mix"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_NAMES: Record<Lang, string> = { en: "English", tl: "Tagalog", mix: "Taglish" };
const M = texts as Record<string, string[]>;
const IDX: Record<string, number> = { en: 0, tl: 1, mix: 2 };

export const isLang = (v: unknown): v is Lang => v === "en" || v === "tl" || v === "mix";

/** A message in the person's language (English if unknown), with the {placeholders} filled in. */
export function tr(lang: string, key: string, params?: Record<string, string | number | null | undefined>): string {
  const entry = M[key];
  if (!entry) return key;
  const text = entry[IDX[lang] ?? 0] || entry[0];
  return params ? text.replace(/\{(\w+)\}/g, (all, k: string) => (k in params ? String(params[k] ?? "") : all)) : text;
}

const WEEK = { en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], tl: ["Lun", "Mar", "Miy", "Huw", "Biy", "Sab", "Lin"] };
const MONTH = { en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], tl: ["Ene", "Peb", "Mar", "Abr", "May", "Hun", "Hul", "Ago", "Set", "Okt", "Nob", "Dis"] };

/** 2026-11-11 → "Wed, Nov 11" (Tagalog: "Miy, Nob 11"). Anything else (like "next week") is returned as it was. */
export function prettyDate(v: string | null | undefined, lang: string): string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return v ?? "";
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return v;
  const k = lang === "tl" ? "tl" : "en";
  return `${WEEK[k][(d.getUTCDay() + 6) % 7]}, ${MONTH[k][d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export const hasText = (key: string) => key in M;
