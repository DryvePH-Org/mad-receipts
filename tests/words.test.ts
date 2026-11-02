import { describe, expect, it } from "vitest";
import { amountToWords, wordsMatchAmount, wordsToCentavos } from "@/lib/rules/words";

describe("amountToWords", () => {
  it.each([
    [5_000_000, "Fifty Thousand Pesos Only"],
    [45_000_000, "Four Hundred Fifty Thousand Pesos Only"],
    [100_050, "One Thousand Pesos and 50/100 Only"],
    [100, "One Peso Only"],
    [0, "Zero Pesos Only"],
    [1_250_000_00, "One Million Two Hundred Fifty Thousand Pesos Only"],
    [99_999_999_999, "Nine Hundred Ninety Nine Million Nine Hundred Ninety Nine Thousand Nine Hundred Ninety Nine Pesos and 99/100 Only"],
    [2_100_000_000_00, "Two Billion One Hundred Million Pesos Only"],
    [1_115_00, "One Thousand One Hundred Fifteen Pesos Only"],
  ])("%d → %s", (centavos, words) => {
    expect(amountToWords(centavos)).toBe(words);
  });

  it("round-trips through wordsToCentavos", () => {
    for (const c of [0, 1, 99, 100, 1_115_00, 5_000_000, 45_000_000, 123_456_789, 999_999_999_999]) {
      expect(wordsToCentavos(amountToWords(c))).toBe(c);
    }
  });

  it("rejects bad input", () => {
    expect(() => amountToWords(-1)).toThrow(RangeError);
    expect(() => amountToWords(1.5)).toThrow(RangeError);
  });
});

describe("wordsMatchAmount", () => {
  it.each([
    // From the sample form.
    ["Fifty Thousand Only", 5_000_000],
    ["Four Hundred Fifty Thousand", 45_000_000],
    // Case, hyphens, "and", currency words.
    ["FIFTY THOUSAND PESOS ONLY", 5_000_000],
    ["fifty-five thousand", 5_500_000],
    ["One Hundred and Twenty-Five Thousand Pesos", 12_500_000],
    ["Php Fifty Thousand", 5_000_000],
    // Centavos written either way.
    ["One Thousand Pesos and 50/100", 100_050],
    ["One Thousand Pesos and Fifty Centavos", 100_050],
    // Minor misspellings.
    ["Fourty Thousand", 4_000_000],
    ["Ninty Thousnd", 9_000_000],
    ["Four Hundered Fifty Thousand", 45_000_000],
    ["One Milion Pesos", 100_000_000],
    // Implied "one".
    ["Thousand Pesos", 100_000],
    ["Hundred Thousand", 10_000_000],
  ])("%j matches %d", (words, centavos) => {
    expect(wordsMatchAmount(words, centavos)).toBe(true);
  });

  it.each([
    ["Fifty Thousand", 4_500_000],
    ["Four Hundred Fifty Thousand", 5_000_000],
    ["One Thousand Pesos", 100_050], // centavos missing in words
    ["", 0],
    ["Fifty Banana", 5_000_000], // unknown word: don't guess
    ["Fifty Thousand Pesos Five", 5_000_500], // stray number after pesos
  ])("%j does not match %d", (words, centavos) => {
    expect(wordsMatchAmount(words, centavos)).toBe(false);
  });

  it("returns null for unreadable words", () => {
    expect(wordsToCentavos("Fifty Banana")).toBeNull();
    expect(wordsToCentavos("")).toBeNull();
    expect(wordsToCentavos("Pesos Only")).toBeNull();
  });
});
