import { z } from "zod";

// Control characters, invisible/format characters (zero-width, bidi overrides
// used for "Trojan Source" spoofing) and line/paragraph separators.
const UNSAFE_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

export function cleanText(value: string, multiline = false) {
  let text = value.normalize("NFC");
  text = multiline
    ? text.replace(/\r\n?/g, "\n").replace(/\t/g, " ")
    : text.replace(/[\r\n\t]+/g, " ");
  text = text.replace(multiline ? /[^\S\n]+/g : /\s+/g, " ");
  text = text.replace(multiline ? /(?!\n)[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu : UNSAFE_CHARS, "");
  // Angle brackets are never needed in a payee, name or description and are
  // the building block of markup injection.
  text = text.replace(/[<>]/g, "");
  if (multiline) text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

type TextOptions = {
  max: number;
  min?: number;
  multiline?: boolean;
  requiredMessage?: string;
  tooLongMessage?: string;
};

// Every free-text input goes through this: cleaned first, then length-checked.
// The raw length is capped before cleaning so huge payloads are refused early.
export function text({
  max,
  min = 0,
  multiline = false,
  requiredMessage = "This field is required.",
  tooLongMessage,
}: TextOptions) {
  return z
    .string()
    .max(max * 4, tooLongMessage ?? `Keep this under ${max} characters.`)
    .transform((value) => cleanText(value, multiline))
    .pipe(
      z
        .string()
        .min(min, requiredMessage)
        .max(max, tooLongMessage ?? `Keep this under ${max} characters.`),
    );
}

// People's names: letters, marks, spaces and a few separators only.
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}\p{N} .,'’-]*$/u;
export function personName(max = 100) {
  return text({ max, min: 1, requiredMessage: "Full name is required" }).refine(
    (value) => NAME_PATTERN.test(value),
    "Use letters, spaces, dots, apostrophes and hyphens only",
  );
}

// Fund / category labels: words, digits and common punctuation.
const LABEL_PATTERN = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .,'’()&/#+_-]*$/u;
export function labelText(max: number, requiredMessage: string) {
  return text({ max, min: 1, requiredMessage }).refine(
    (value) => LABEL_PATTERN.test(value),
    "Use letters, numbers, spaces and basic punctuation only",
  );
}

export const emailField = z
  .string()
  .max(254)
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address"));
