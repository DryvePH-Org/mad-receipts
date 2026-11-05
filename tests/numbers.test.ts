import { describe, expect, it } from "vitest";
import { compactSpoken, digitStringsIn, numbersIn } from "@/lib/voice/numbers";

const has = (text: string, ...values: number[]) => {
  const found = numbersIn(text);
  for (const v of values) expect([...found], `"${text}" should contain ${v}`).toContain(v);
};

describe("numbersIn", () => {
  it("digits and shorthand", () => {
    has("paid 50,000 pesos", 50000);
    has("balance is 450K", 450000);
    has("price 1.5M", 1500000);
    has("three percent and 2.5 percent", 3, 2.5);
    has("₱20000 down", 20000);
  });

  it("English words", () => {
    has("fifty thousand", 50000);
    has("four hundred fifty thousand", 450000);
    has("one hundred thirty thousand pesos", 130000);
    has("seven hundred twenty thousand", 720000);
    has("twenty five thousand", 25000);
    has("one point five percent", 1.5);
    has("five hundred K", 500000);
    has("one million two hundred thousand", 1200000);
  });

  it("Tagalog and Taglish", () => {
    has("limampung libo ang binayad", 50000);
    has("singkwenta mil", 50000);
    has("dalawampung libo", 20000);
    has("isang daan at tatlumpung libo", 130000);
    has("apat na raan limampung libo", 450000);
    has("kalahating milyon", 500000);
    has("isa't kalahating porsyento", 1.5);
    has("tatlong porsyento", 3);
    has("isang daang libo", 100000);
    has("isang milyon", 1000000);
  });

  it("does not invent numbers that were not said", () => {
    const found = numbersIn("Salesman David, plate NKF 4771, earnest money fifty thousand");
    expect([...found]).not.toContain(450000);
    expect([...found]).not.toContain(500000);
    expect([...found]).toContain(50000);
  });
});

describe("digitStringsIn / compactSpoken", () => {
  it("digits said one at a time", () => {
    expect(digitStringsIn("zero nine one seven, three two one, six zero seven eight")).toContain("09173216078");
    expect(compactSpoken("plate N K F four seven seven one")).toContain("NKF4771");
  });
  it("numbers said in groups", () => {
    expect(digitStringsIn("receipt number twenty five fifty six")).toContain("2556");
    expect(digitStringsIn("a 2021 model, twenty twenty one")).toContain("2021");
  });
  it("digits typed with spaces or dashes", () => {
    expect(compactSpoken("plate NKF-4771")).toContain("NKF4771");
  });
});

describe("plate letters said as words", () => {
  it("phonetic alphabet and 'as in'", () => {
    expect(compactSpoken("plate november kilo foxtrot four seven seven one")).toContain("NKF4771");
    expect(compactSpoken("N as in Nancy, K as in king, F as in Frank, 4771")).toContain("NKF4771");
    expect(compactSpoken("lima")).toBe("5"); // Tagalog five, not the letter L
  });
});
