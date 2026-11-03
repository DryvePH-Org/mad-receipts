import { describe, expect, it } from "vitest";
import { matchSalesperson, normalizeName, parseAliases, transcriptionPrompt, type SalespersonRef } from "@/lib/salespeople/names";

const people: SalespersonRef[] = [
  { id: "david", name: "David Santos", aliases: ["Dave", "Dabid"] },
  { id: "ella", name: "Ella", aliases: [] },
  { id: "sweet", name: "Sweet Reyes", aliases: ["Sweety"] },
  { id: "maria", name: "Maria Clara", aliases: [] },
  { id: "mario", name: "Mario Cruz", aliases: [] },
];

describe("normalizeName", () => {
  it("ignores case, accents, punctuation and spacing", () => {
    expect(normalizeName("  Peña,  J. ")).toBe("pena j");
    expect(normalizeName("DAVID")).toBe("david");
    expect(normalizeName("")).toBe("");
  });
});

describe("parseAliases", () => {
  it("splits on commas, semicolons and lines, dropping blanks and repeats", () => {
    expect(parseAliases("Dave, Dabid;\n dave ,, DAVID  ")).toEqual(["Dave", "Dabid", "DAVID"]);
    expect(parseAliases("")).toEqual([]);
  });
  it("caps how many", () => {
    expect(parseAliases(Array.from({ length: 15 }, (_, i) => `n${i}`).join(","))).toHaveLength(10);
  });
});

describe("matchSalesperson", () => {
  it.each([
    ["David Santos", "david", "exact"],
    ["david santos", "david", "exact"],
    ["Dave", "david", "exact"], // alias
    ["Dabid", "david", "exact"], // alias
    ["Ella", "ella", "exact"],
    ["sweety", "sweet", "exact"],
  ])("%j → %s (%s)", (spoken, id, confidence) => {
    expect(matchSalesperson(spoken, people)).toEqual({ spoken, salespersonId: id, confidence });
  });

  it("matches a first name when it is unique", () => {
    expect(matchSalesperson("David", people)).toMatchObject({ salespersonId: "david", confidence: "close" });
    expect(matchSalesperson("Sweet", people)).toMatchObject({ salespersonId: "sweet", confidence: "close" });
  });

  it("matches a small misspelling", () => {
    expect(matchSalesperson("Davit", people)).toMatchObject({ salespersonId: "david", confidence: "close" });
    expect(matchSalesperson("Elia", people)).toMatchObject({ salespersonId: "ella", confidence: "close" });
  });

  it("never guesses between two people", () => {
    // "Mari" is one letter from both Maria and Mario.
    expect(matchSalesperson("Mari", people)).toMatchObject({ salespersonId: null, confidence: "none" });
    const twins: SalespersonRef[] = [
      { id: "a", name: "Jon Reyes", aliases: [] },
      { id: "b", name: "Jon Cruz", aliases: [] },
    ];
    expect(matchSalesperson("Jon", twins)).toMatchObject({ salespersonId: null });
    expect(matchSalesperson("Jon Reyes", twins)).toMatchObject({ salespersonId: "a", confidence: "exact" });
  });

  it("returns none for unknown names, blanks and very short guesses", () => {
    expect(matchSalesperson("Pedro", people).salespersonId).toBeNull();
    expect(matchSalesperson("", people).salespersonId).toBeNull();
    expect(matchSalesperson("Ed", people).salespersonId).toBeNull();
    expect(matchSalesperson("David", []).salespersonId).toBeNull();
  });
});

describe("transcriptionPrompt", () => {
  it("lists the names and stays short", () => {
    expect(transcriptionPrompt(people)).toContain("Salespeople: David Santos, Dave, Dabid, Ella");
    const many = Array.from({ length: 200 }, (_, i) => ({ id: String(i), name: `Salesperson Number ${i}`, aliases: [] }));
    expect(transcriptionPrompt(many).length).toBeLessThan(800);
    expect(transcriptionPrompt([])).toMatch(/^Acknowledgement of payment/);
  });
});
