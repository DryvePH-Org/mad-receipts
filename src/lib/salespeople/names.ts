import { editDistance } from "@/lib/rules/words";

/** A salesperson as the voice step needs them. Aliases are nicknames or common mishearings. */
export interface SalespersonRef {
  id: string;
  name: string;
  aliases: string[];
}

export const MAX_ALIASES = 10;
export const MAX_NAME_LENGTH = 60;

/** Lowercase, no accents or punctuation, single spaces: "Peña, J." → "pena j". */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Dave, Dabid" or one per line → ["Dave", "Dabid"]. Drops blanks and repeats (ignoring case). */
export function parseAliases(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n;]/)) {
    const alias = raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
    const key = normalizeName(alias);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out.slice(0, MAX_ALIASES);
}

export interface NameMatch {
  spoken: string;
  salespersonId: string | null;
  /** exact: the full name or an alias. close: first name or a small misspelling. none: no safe match. */
  confidence: "exact" | "close" | "none";
}

/**
 * Matches a name heard in the voice note to the salespeople list. It only ever returns a person
 * when exactly one fits: two people matching equally well (or none) gives "none", and staff pick.
 */
export function matchSalesperson(spoken: string, people: SalespersonRef[]): NameMatch {
  const heard = normalizeName(spoken);
  const none: NameMatch = { spoken, salespersonId: null, confidence: "none" };
  if (!heard) return none;

  const keys = people.map((p) => ({
    id: p.id,
    full: [p.name, ...p.aliases].map(normalizeName).filter(Boolean),
  }));

  const unique = (ids: string[]) => {
    const set = [...new Set(ids)];
    return set.length === 1 ? set[0] : null;
  };

  // 1. The whole name or an alias.
  const exact = unique(keys.filter((k) => k.full.includes(heard)).map((k) => k.id));
  if (exact) return { spoken, salespersonId: exact, confidence: "exact" };
  if (keys.some((k) => k.full.includes(heard))) return none; // two people share it

  // 2. Just a first name or any one word of a longer name: "David" for "David Santos".
  const word = unique(
    keys.filter((k) => k.full.some((f) => f.split(" ").includes(heard))).map((k) => k.id),
  );
  if (word) return { spoken, salespersonId: word, confidence: "close" };
  if (keys.some((k) => k.full.some((f) => f.split(" ").includes(heard)))) return none;

  // 3. A small misspelling of a name, alias or one word of them: "Dabid" for "David".
  const allowed = heard.length <= 3 ? 0 : heard.length <= 7 ? 1 : 2;
  if (allowed === 0) return none;
  let best = allowed + 1;
  let bestIds: string[] = [];
  for (const k of keys) {
    const candidates = k.full.flatMap((f) => [f, ...f.split(" ")]);
    const distance = Math.min(...candidates.map((c) => editDistance(heard, c)));
    if (distance < best) {
      best = distance;
      bestIds = [k.id];
    } else if (distance === best) {
      bestIds.push(k.id);
    }
  }
  const fuzzy = best <= allowed ? unique(bestIds) : null;
  return fuzzy ? { spoken, salespersonId: fuzzy, confidence: "close" } : none;
}

/** A hint for speech-to-text: the names it should expect to hear. Kept short (the limit is ~224 tokens). */
export function transcriptionPrompt(people: SalespersonRef[]): string {
  const names = people.flatMap((p) => [p.name, ...p.aliases]);
  const list: string[] = [];
  let length = 0;
  for (const name of names) {
    if (length + name.length > 500) break;
    list.push(name);
    length += name.length + 2;
  }
  return [
    list.length ? `Salespeople: ${list.join(", ")}.` : "",
    "Acknowledgement of payment: receipt number, plate number, earnest money, partial payment, full payment, commission percent.",
  ]
    .filter(Boolean)
    .join(" ");
}
