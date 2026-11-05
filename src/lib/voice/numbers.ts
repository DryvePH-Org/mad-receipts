import { normalizeName } from "./text";

/**
 * Finds the numbers in what someone said or typed, in English, Tagalog and mixed sentences:
 * "450K", "50,000", "fifty thousand", "limampung libo", "singkwenta mil", "isang daan at tatlumpung libo",
 * "kalahating milyon", "isa't kalahati", "one point five". Used to check that a number the AI claims
 * to have heard was really said. A number this cannot read is simply not found, which is the safe side.
 */

const UNITS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  // Tagalog and the Spanish-derived words Filipinos use
  isa: 1, dalawa: 2, tatlo: 3, apat: 4, lima: 5, anim: 6, pito: 7, walo: 8, siyam: 9, sampu: 10,
  uno: 1, dos: 2, tres: 3, kuwatro: 4, kwatro: 4, singko: 5, sais: 6, siyete: 7, otso: 8, nuwebe: 9, diyes: 10,
  onse: 11, dose: 12, trese: 13, katorse: 14, kinse: 15,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  dalawampu: 20, tatlumpu: 30, apatnapu: 40, limampu: 50, animnapu: 60, pitumpu: 70, walumpu: 80, siyamnapu: 90,
  bente: 20, beinte: 20, trenta: 30, kuwarenta: 40, kwarenta: 40, singkwenta: 50, sisenta: 60, sitenta: 70, otsenta: 80, nobenta: 90,
};
const HUNDRED = new Set(["hundred", "daan", "raan", "dang", "daang", "raang"]);
const THOUSAND = new Set(["thousand", "k", "grand", "libo", "libong", "mil"]);
const MILLION = new Set(["million", "milyon", "milyong", "m"]);
const HALF = new Set(["kalahati", "kalahating", "half"]);
const SKIP = new Set(["and", "at", "na", "ng", "ang", "pesos", "peso", "piso", "php", "p", "a", "of", "the", "t", "s"]);

/** Splits "limampung" into "limampu" + "ng" so the tens table matches; keeps everything else. */
function tokens(text: string): string[] {
  // Punctuation ends a number ("seven one, limampung libo" is two numbers), so keep it as a marker.
  const marked = text.replace(/[,;:!?]\s|\.\s|\n/g, " zzbreak ");
  const t = normalizeName(marked.replace(/(\d),(\d{3})/g, "$1$2").replace(/(\d)\s*(k|m)\b/gi, "$1 $2").replace(/(\d)\.(\d)/g, "$1dot$2"))
    .split(" ")
    .filter(Boolean)
    .map((w) => (w === "zzbreak" ? "|" : w.replace("dot", ".")))
    .flatMap((w) => {
      if (/^(dalawampu|tatlumpu|apatnapu|limampu|animnapu|pitumpu|walumpu|siyamnapu)ng$/.test(w)) return [w.slice(0, -2)];
      if (/^(dalawa|tatlo|apat|lima|anim|pito|walo|siyam)ng$/.test(w)) return [w.slice(0, -2)];
      if (w === "isang") return ["isa"];
      if (w === "isat") return ["isa"]; // "isa't" -> "isa t"
      if (/^labin/.test(w) || /^labing/.test(w)) return [w]; // handled below
      return [w];
    });
  return t;
}

const TEEN_PREFIX = /^labin?g?-?(.*)$/;

function unitValue(word: string): number | null {
  if (word in UNITS) return UNITS[word];
  if (/^\d+(\.\d+)?$/.test(word)) return Number(word);
  const teen = TEEN_PREFIX.exec(word);
  if (teen && teen[1] in UNITS) return 10 + UNITS[teen[1]];
  return null;
}

/** Every number phrase in the text, as numbers (digits, words, shorthand), ignoring order. */
export function numbersIn(text: string): Set<number> {
  const out = new Set<number>();
  const words = tokens(text);
  const isNumberWord = (w: string | undefined) =>
    w !== undefined && (unitValue(w) !== null || w in TENS || HUNDRED.has(w) || THOUSAND.has(w) || MILLION.has(w) || HALF.has(w));

  let i = 0;
  while (i < words.length) {
    // A number is built left to right with a few grammar rules, so "four seven seven one" is not 19 and
    // "seven one, limampung libo" is two numbers.
    let total = 0;
    let current = 0;
    let last: "none" | "unit" | "tens" | "hundred" | "scale" | "half" = "none";
    let j = i;
    const parts: number[] = [];
    for (; j < words.length; j++) {
      const w = words[j];
      const next = words[j + 1];
      if (SKIP.has(w)) {
        // "isa't kalahati", "four hundred and fifty": a linking word only counts if more number follows.
        if (last !== "none" && isNumberWord(next)) continue;
        break;
      }
      if (HALF.has(w)) {
        if (next && MILLION.has(next)) { total += 500_000; j++; last = "scale"; parts.push(500_000); continue; }
        if (next && THOUSAND.has(next)) { total += 500; j++; last = "scale"; continue; }
        if (last === "unit" || last === "tens" || last === "hundred") { current += 0.5; last = "half"; continue; }
        break;
      }
      if (w === "point" || w === "punto") {
        let frac = "";
        let k = j + 1;
        while (k < words.length && unitValue(words[k]) !== null && unitValue(words[k])! < 10) frac += String(unitValue(words[k++]));
        if (frac && last !== "none") { current += Number(`0.${frac}`); j = k - 1; last = "half"; continue; }
        break;
      }
      const u = unitValue(w);
      if (u !== null) {
        const big = /^\d+$/.test(w) && Number(w) >= 10;
        // A unit may start a number, or follow tens ("twenty one"), a hundred or a scale; never another unit.
        if (last === "none" || ((last === "tens" || last === "hundred" || last === "scale") && !big && u < 20)) {
          current += u; parts.push(u); last = "unit"; continue;
        }
        break;
      }
      if (w in TENS) {
        if (last === "none" || last === "hundred" || last === "scale") { current += TENS[w]; parts.push(TENS[w]); last = "tens"; continue; }
        break;
      }
      if (HUNDRED.has(w)) {
        if (last === "unit" || (last === "none" && w === "hundred")) { current = (current || 1) * 100; last = "hundred"; continue; }
        break;
      }
      if (THOUSAND.has(w)) {
        if (last !== "none" && last !== "scale") { total += current * 1000; current = 0; last = "scale"; continue; }
        break;
      }
      if (MILLION.has(w)) {
        if (last !== "none" && last !== "scale") { total += current * 1_000_000; current = 0; last = "scale"; continue; }
        break;
      }
      break;
    }
    if (last !== "none") {
      out.add(Math.round((total + current) * 100) / 100);
      for (const p of parts) out.add(p);
      i = Math.max(j, i + 1);
    } else {
      i++;
    }
  }
  return out;
}

/**
 * Digit strings the speaker could have meant: digits said one at a time ("zero nine one seven"),
 * and numbers said in groups ("twenty five fifty six" is 2556, "twenty twenty one" is 2021).
 */
export function digitStringsIn(text: string): Set<string> {
  const out = new Set<string>();
  const words = tokens(text).filter((w) => !SKIP.has(w) || w === "t");
  // runs of consecutive number words/digits
  let run: number[] = [];
  const flush = () => {
    if (run.length) {
      out.add(run.join(""));
      for (let a = 0; a < run.length; a++) for (let b = a + 1; b <= run.length; b++) out.add(run.slice(a, b).join(""));
    }
    run = [];
  };
  const spokenGroups = numbersGroups(words);
  for (const g of spokenGroups) {
    if (g === null) flush();
    else run.push(g);
  }
  flush();
  return out;
}

/** The number groups of the text in order, with null between groups that are not next to each other. */
function numbersGroups(words: string[]): (number | null)[] {
  const result: (number | null)[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const u = unitValue(w);
    if (u !== null || w in TENS) {
      let value = u ?? TENS[w];
      let j = i + 1;
      // tens + unit: "twenty one"
      if (w in TENS && j < words.length && unitValue(words[j]) !== null && unitValue(words[j])! < 10) { value += unitValue(words[j])!; j++; }
      result.push(value);
      i = j;
    } else {
      // A pause inside a dictated number ("zero nine one seven, three two one") does not end it.
      if (w !== "|" && result.length && result[result.length - 1] !== null) result.push(null);
      i++;
    }
  }
  return result;
}

/** The text with spoken digits turned into digits and everything but letters and digits removed: "N K F four seven" -> "NKF47". */
export function compactSpoken(text: string): string {
  return tokens(text)
    .map((w) => {
      const v = unitValue(w);
      return v !== null && Number.isInteger(v) && v < 10 && w !== "0" ? String(v) : /^\d+$/.test(w) ? w : w;
    })
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
