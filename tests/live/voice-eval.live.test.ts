import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/lib/deal/settings";
import { interpretTranscript } from "@/lib/voice/interpret";
import type { VoiceProposal } from "@/lib/voice/schema";

// How accurate is the reading on messy English / Filipino / Taglish, with corrections and repeats?
// Every expected value is scored as RIGHT, BLANK (left for staff to type: acceptable) or WRONG (never acceptable).
// Run: npm run test:live   (calls the real model; spaced out to stay inside the free plan's limits)
const vocab = { institutions: DEFAULT_SETTINGS.institutions, wallets: DEFAULT_SETTINGS.wallets, banks: DEFAULT_SETTINGS.banks, colors: DEFAULT_SETTINGS.colors.common.map(([c]) => c) };
type Get = (p: VoiceProposal) => unknown;
const F = (k: string): Get => (p) => (p.fields as unknown as Record<string, unknown>)[k];
const U = (i: number, k: string): Get => (p) => (p.fields.units[i] as unknown as Record<string, unknown> | undefined)?.[k];

const cases: { name: string; say: string; expect: [string, Get, unknown][]; also?: (p: VoiceProposal) => void }[] = [
  { name: "self-correction in English", say: "Buyer is Pedro Cruz. Price seven hundred thousand, sorry, seven hundred twenty thousand. Cash sale.", expect: [["price", F("price"), 720000], ["sale", F("sale"), "cash"]] },
  { name: "Taglish correction", say: "Presyo po 650K, ay mali, 680K pala. Cash po.", expect: [["price", F("price"), 680000], ["sale", F("sale"), "cash"]] },
  { name: "the same car said twice", say: "Unit is Vios plate N K F four seven seven one, ulit po, Vios N K F four seven seven one, silver.", expect: [["plate", U(0, "plate"), "NKF4771"], ["color", U(0, "color"), "Silver"]], also: (p) => expect(p.fields.units).toHaveLength(1) },
  { name: "Taglish financing, no PF", say: "Si Gng. Reyes po, naka-loan sa BPI, price 500K, DP 100K, loan 400K, walang PF.", expect: [["buyer", F("buyer_name"), "Reyes"], ["inst", F("institution"), "BPI"], ["price", F("price"), 500000], ["dp", F("down_payment"), 100000], ["loan", F("loan_amount"), 400000], ["fee", F("fee_mode"), "none"]] },
  { name: "numbers that do not add up", say: "Financing sa BDO, price five hundred thousand, down payment one hundred thousand, loan four hundred fifty thousand.", expect: [["price", F("price"), 500000], ["dp", F("down_payment"), 100000]], also: (p) => { expect(p.fields.loan_amount).toBeNull(); expect(p.conflicts.join(" ")).toContain("do not add up"); } },
  { name: "Tagalog big numbers", say: "Presyo isang milyon dalawang daang libo, down payment tatlong daang libo, financing sa Security Bank.", expect: [["price", F("price"), 1200000], ["dp", F("down_payment"), 300000], ["inst", F("institution"), "Security Bank"]] },
  { name: "earnest money", say: "Earnest money, binayad ni Pedro Cruz ay five thousand pesos cash. Wigo plate N B U four eight seven five. Price four hundred fifty thousand, cash sale.", expect: [["kind", F("kind"), "earnest"], ["cash", F("cash_today"), 5000], ["price", F("price"), 450000], ["plate", U(0, "plate"), "NBU4875"], ["buyer", F("buyer_name"), "Pedro Cruz"]] },
  { name: "GCash and a check together", say: "Nag-GCash siya ng thirty thousand, tapos check twenty thousand, check number five five five one two three, BDO.", expect: [["gcash", (p) => p.fields.wallets[0]?.amount, 30000], ["check", (p) => p.fields.check?.amount, 20000], ["no", (p) => p.fields.check?.no, "555123"], ["bank", (p) => p.fields.check?.bank, "BDO"], ["cash", F("cash_today"), null]] },
  { name: "a trade-in in Taglish", say: "May pa-trade siyang 2012 Mitsubishi Mirage plate A B C nine nine nine nine, value ninety thousand. Price four hundred thousand, cash.", expect: [["value", (p) => p.fields.trade_in?.value, 90000], ["tplate", (p) => p.fields.trade_in?.plate, "ABC9999"], ["price", F("price"), 400000]] },
  { name: "a due date", say: "Ang balance bayaran sa December twenty, at cash po ito.", expect: [["due", F("due_date"), "2026-12-20"]] },
  { name: "a phone number in groups", say: "Contact niya zero nine one eight, five five five, one two three four. Buyer si Jose Ramos.", expect: [["phone", F("buyer_contact"), "09185551234"], ["buyer", F("buyer_name"), "Jose Ramos"]] },
  { name: "lots of filler", say: "Ah, ano po, yung buyer po ay si Jose Ramos, uh, tapos yung presyo po, ano, three hundred fifty thousand po, cash po.", expect: [["buyer", F("buyer_name"), "Jose Ramos"], ["price", F("price"), 350000], ["sale", F("sale"), "cash"]] },
  { name: "almost nothing said", say: "Si Juan lang po muna, balik ko na lang yung ibang detalye mamaya.", expect: [["price", F("price"), null], ["sale", F("sale"), null], ["cash", F("cash_today"), null], ["earlier", F("earlier_paid"), null], ["units", (p) => p.fields.units.length, 0]] },
  { name: "a different fee rate", say: "Financing sa BPI, five percent lang daw yung PF, price six hundred thousand, DP one hundred twenty thousand.", expect: [["feemode", F("fee_mode"), "percent"], ["fee", F("fee_value"), 5], ["price", F("price"), 600000], ["dp", F("down_payment"), 120000]] },
  { name: "full payment", say: "Full payment na po, four hundred fifty thousand cash, binayad ngayon. Price is four hundred fifty thousand.", expect: [["kind", F("kind"), "full"], ["cash", F("cash_today"), 450000], ["price", F("price"), 450000]] },
  { name: "earlier payment vs paid today", say: "Price seven hundred twenty thousand financing sa BDO, DP one fifty. Nakapagbayad na siya ng twenty thousand dati, tapos ngayon one hundred twenty thousand cash.", expect: [["earlier", F("earlier_paid"), 20000], ["cash", F("cash_today"), 120000], ["price", F("price"), 720000]] },
  { name: "percent down in Taglish", say: "Toyota Vios, twenty porsyento ang down, price eight hundred thousand, financing sa Metrobank, standard PF.", expect: [["pct", F("down_payment_percent"), 20], ["price", F("price"), 800000], ["inst", F("institution"), "Metrobank"], ["feemode", F("fee_mode"), "standard"]] },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("accuracy on messy speech (real model)", () => {
  it("never puts a wrong value in the form", async () => {
    const tally = { right: 0, blank: 0, wrong: 0 };
    const wrong: string[] = [];
    for (const c of cases) {
      let p: VoiceProposal;
      try { p = await interpretTranscript(c.say, vocab, "typed"); } catch (e) { wrong.push(`${c.name}: could not read (${(e as Error).message})`); await sleep(20_000); continue; }
      for (const [label, get, want] of c.expect) {
        const got = get(p);
        const same = typeof want === "string" && typeof got === "string" ? got.toLowerCase().includes(want.toLowerCase()) : got === want;
        if (same) tally.right++;
        else if (got === null || got === undefined || got === "") { tally.blank++; console.info(`BLANK  ${c.name} / ${label} (wanted ${JSON.stringify(want)}) unsure=${JSON.stringify(p.unsure)}`); }
        else { tally.wrong++; wrong.push(`${c.name} / ${label}: wanted ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); }
      }
      c.also?.(p);
      await sleep(14_000);
    }
    console.info(`EVAL right=${tally.right} blank=${tally.blank} wrong=${tally.wrong}`);
    expect(wrong).toEqual([]);
  }, 900_000);
});
