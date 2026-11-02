// Amount-in-words helpers for the "sum of PESOS" and "Balance of" lines.

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES: [number, string][] = [
  [1_000_000_000, "billion"],
  [1_000_000, "million"],
  [1_000, "thousand"],
];

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function underThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(ONES[Math.floor(n / 100)], "hundred");
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]);
    n %= 10;
    if (n) parts.push(ONES[n]);
  } else if (n) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

function integerToWords(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (const [value, name] of SCALES) {
    if (n >= value) {
      parts.push(underThousand(Math.floor(n / value)), name);
      n %= value;
    }
  }
  if (n) parts.push(underThousand(n));
  return parts.join(" ");
}

/**
 * Centavos → "Fifty Thousand Pesos Only", or "One Thousand Pesos and 50/100 Only"
 * when there are centavos.
 */
export function amountToWords(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0) {
    throw new RangeError(`Expected non-negative integer centavos, got ${centavos}`);
  }
  const pesos = Math.floor(centavos / 100);
  const cents = centavos % 100;
  const unit = pesos === 1 ? "Peso" : "Pesos";
  const fraction = cents ? ` and ${String(cents).padStart(2, "0")}/100` : "";
  return `${title(integerToWords(pesos))} ${unit}${fraction} Only`;
}

// ---- Parsing handwritten words back to a number ----

const NUMBER_WORDS = new Map<string, number>([
  ...ONES.map((w, i) => [w, i] as [string, number]),
  ...TENS.flatMap((w, i) => (w ? [[w, i * 10] as [string, number]] : [])),
]);
const MULTIPLIERS = new Map<string, number>([
  ["hundred", 100],
  ["thousand", 1_000],
  ["million", 1_000_000],
  ["billion", 1_000_000_000],
]);
const CURRENCY = new Set(["peso", "pesos", "php"]);
const CENTAVO = new Set(["centavo", "centavos", "cents", "cent"]);
const FILLER = new Set(["and", "only", "exactly", "the", "sum", "of", "p"]);
const VOCABULARY = [
  ...NUMBER_WORDS.keys(),
  ...MULTIPLIERS.keys(),
  ...CURRENCY,
  ...CENTAVO,
  ...FILLER,
];

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

/** Maps a possibly misspelled token to a known word ("fourty" → "forty"), or null. */
function correct(token: string): string | null {
  if (VOCABULARY.includes(token)) return token;
  // Short words must be exact: "for", "to", "tin" are too close to real numbers.
  const allowed = token.length <= 3 ? 0 : token.length <= 6 ? 1 : 2;
  let best: string | null = null;
  let bestDistance = allowed + 1;
  for (const word of VOCABULARY) {
    const d = editDistance(token, word);
    if (d < bestDistance) {
      best = word;
      bestDistance = d;
    } else if (d === bestDistance) {
      best = null; // ambiguous: refuse to guess
    }
  }
  return best;
}

/** Sums number words, e.g. ["four","hundred","fifty","thousand"] → 450000. */
function wordsToInteger(words: string[]): number | null {
  if (words.length === 0) return null;
  let total = 0;
  let current = 0;
  for (const word of words) {
    const n = NUMBER_WORDS.get(word);
    const multiplier = MULTIPLIERS.get(word);
    if (n !== undefined) {
      current += n;
    } else if (multiplier === 100) {
      current = (current || 1) * 100;
    } else if (multiplier !== undefined) {
      total += (current || 1) * multiplier;
      current = 0;
    } else {
      return null;
    }
  }
  return total + current;
}

/**
 * Reads amount words into centavos, tolerating case, hyphens, "and", "pesos only",
 * "50/100" or "fifty centavos", and one- or two-letter misspellings.
 * Returns null when the words can't be read confidently.
 */
export function wordsToCentavos(words: string): number | null {
  const tokens = words
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    .replace(/[^a-z0-9/\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const pesoWords: string[] = [];
  const centWords: string[] = [];
  let cents: number | null = null;
  let afterCurrency = false;

  for (const token of tokens) {
    const fraction = /^(\d{1,2})\/100$/.exec(token);
    if (fraction) {
      cents = Number(fraction[1]);
      continue;
    }
    const word = correct(token);
    if (word === null) return null;
    // "Php Fifty Thousand": a leading currency word is just a prefix, not the separator.
    if (CURRENCY.has(word)) afterCurrency = pesoWords.length > 0;
    else if (CENTAVO.has(word)) cents = wordsToInteger(centWords);
    else if (FILLER.has(word)) continue;
    else (afterCurrency ? centWords : pesoWords).push(word);
  }

  // Number words after "pesos" with no "centavos"/"xx/100" are not something we understand.
  if (centWords.length > 0 && cents === null) return null;
  const pesos = wordsToInteger(pesoWords);
  if (pesos === null || (cents !== null && (cents < 0 || cents > 99))) return null;
  return pesos * 100 + (cents ?? 0);
}

/** True when handwritten amount words agree with the numeric amount. */
export function wordsMatchAmount(words: string, centavos: number): boolean {
  return wordsToCentavos(words) === centavos;
}
