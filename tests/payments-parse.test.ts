import { describe, expect, it } from "vitest";
import { bankName, bankTabInfo, modeOf, parseBankTab, parseSalesTab, salesTabInfo } from "@/lib/payments/parse";

describe("which tab is which", () => {
  it("reads the bank, the account and the month out of a deposit tab's name", () => {
    expect(bankTabInfo("BDO DEPOSIT MONITORING - 3321 (NOV2026)")).toEqual({ account: "BDO 3321", month: "2026-11" });
    expect(bankTabInfo("SBTC DEPOSIT MONITORING - 5411 (NOV2026)")).toEqual({ account: "Security Bank 5411", month: "2026-11" });
    expect(bankTabInfo("SECURITY BANK DEPOSIT MONITORING - 5411 (SEPT2026)")).toEqual({ account: "Security Bank 5411", month: "2026-09" });
    expect(bankTabInfo("BDO DEPOSIT MONITORING - 3321 (JULY2026)")?.month).toBe("2026-07");
    expect(bankTabInfo("IN LIEU OF DOCS")).toBeNull();
    expect(bankTabInfo("Metrobank")).toBeNull();
  });
  it("reads the month of a sales tab", () => {
    expect(salesTabInfo("SALES MONITORING NOVEMBER 2026")).toEqual({ month: "2026-11" });
    expect(salesTabInfo("BDO SALES MONITORING JULY 2026")).toEqual({ month: "2026-07" });
    expect(salesTabInfo("SALES REPORT FEB")).toBeNull();
  });
});

describe("how the money moved", () => {
  it("reads the code staff write", () => {
    expect([modeOf("", "CSHD", ""), modeOf("", "DEPN", ""), modeOf("", "CM", ""), modeOf("", "DM", ""), modeOf("", "REM", ""), modeOf("", "ONLINE BT", "")]).toEqual(["Cash deposit", "Cash deposit", "Credit memo", "Debit memo", "Remittance", "Online transfer"]);
    expect([modeOf("", "56197", "CHECK"), modeOf("", "0000422943", "FT TO KMA - SPLIT"), modeOf("", "", "FT TO KMA"), modeOf("", "", "something")]).toEqual(["Check", "Fund transfer", "Fund transfer", "Other"]);
    expect(modeOf("CM", "", "")).toBe("Credit memo"); // the code may be in either column
  });
});

const BANK = [
  ["BDO ACCOUNT# 011398003321 BDO SALES ACCOUNT DEPOSIT SLIPS MONITORING  FOR THE MONTH OF NOVEMBER 2026 DATE", "TC", "CHECK NO.", "PARTICULARS", "PLATE NUMBER", "OUT DEBIT", "IN CREDIT", "BALANCE", "REMARKS", "TRANSACTION TYPE"],
  ["", "", "", "", "", "", "", "₱323,280.46"],
  ["11/3/2026", "", "DM", "REFUND – EXCESS PAYMENT OF 2026 TOYOTA AVANZA", "NLC 1144", "₱13,700.00", "", "₱309,580.46", "", "SALES RETURN"],
  ["11/3/2026", "", "CM", "RESERVATION PAYMENT OF 2025 MITSUBISHI MIRAGE G4", "NKH7462", "", "₱20,000.00", "₱329,580.46", "KARL SALES", "RESERVATION", "? MIRAGE NKH7462 RES 20K (EMAIL SAYS SB)?"],
  ["11/3/2026", "", "DM", "PROCESSING FEE FOR 2023 MITSUBISHI XPANDER", "DAR4015", "₱9,100.00", "", "₱320,480.46", "PROCESSING FEE"],
  ["11/3/2026", "", "DEPN", "FULL PAYMENT OF 2023 MITSUBISHI XPANDER", "DAR4015", "", "₱580,000.00", "₱899,580.46", "KARL SALES", "FULL PAYMENT"],
  ["11/20/2026", "", "", "", "", "", "", "₱78,330.46"],
  ["", "", "", "", "", "", "", ""],
];

describe("the lines of a deposit tab", () => {
  const lines = parseBankTab(BANK, "BDO DEPOSIT MONITORING - 3321 (NOV2026)");
  it("keeps the rows that have a date and money, and skips the title, the opening balance and the closing balance", () => {
    expect(lines.map((l) => l.row)).toEqual([3, 4, 5, 6]);
    expect(lines[0]).toMatchObject({ account: "BDO 3321", date: "2026-11-03", plate: "NLC1144", debit: 13700, credit: null, balance: 309580.46, type: "SALES RETURN", mode: "Debit memo" });
    expect(lines[1]).toMatchObject({ credit: 20000, debit: null, type: "RESERVATION", remarks: "KARL SALES", mode: "Credit memo", note: "? MIRAGE NKH7462 RES 20K (EMAIL SAYS SB)?" });
    expect(lines[3]).toMatchObject({ credit: 580000, mode: "Cash deposit", type: "FULL PAYMENT" });
  });
  it("a line with no type but a processing fee in its remarks is a processing fee; otherwise unlabelled", () => {
    expect(lines[2].type).toBe("PROCESSING FEE");
    const none = parseBankTab([["11/4/2026", "", "", "something", "", "", "₱100.00", "₱1,000.00"]], "BDO DEPOSIT MONITORING - 3321 (NOV2026)");
    expect(none[0].type).toBe("UNLABELLED");
  });
  it("a tab that is not a deposit tab gives nothing", () => {
    expect(parseBankTab(BANK, "IN LIEU OF DOCS")).toEqual([]);
  });
});

const HEAD = ["NO", "TRANSACTION DETAILS SPLIT", "TYPE", "FINANCING (APPROVED?)", "APPROVAL DATE", "BUYER NAME", "CAR DETAILS DATE OF ENTRY", "YRM", "MAKE", "MODEL", "PLATE#", "AGREED PRICE"];
const row = (cells: Record<number, string>) => { const r = Array.from({ length: 37 }, () => ""); for (const [i, v] of Object.entries(cells)) r[Number(i)] = v; return r; };

describe("the payments of the sales of a month", () => {
  const rows = [
    HEAD,
    row({}),
    row({ 0: "1", 1: "OK", 2: "FINANCING", 3: "PENDING", 5: "Maria Theresa B. Vicente", 10: "NKH7462", 11: "₱520,000.00", 12: "BDO", 13: "11/2/2026", 14: "₱20,000.00", 15: "1078", 20: "BDO", 21: "11/11/2026", 22: "₱70,000.00", 23: "2545", 24: "BDO", 25: "11/13/2026", 26: "₱430,000.00", 32: "BDO", 33: "11/13/2026", 34: "₱520,000.00" }),
    row({ 0: "4", 2: "CASH", 5: "ROMEO GARCIA JR.", 10: "NKN9618", 11: "₱580,000.00", 12: "SECURITY BANK", 13: "11/5/2026", 14: "₱20,000.00", 20: "SB", 21: "11/5/2026", 22: "₱560,000.00", 23: "2543" }),
    row({ 0: "53" }),
  ];
  const pays = parseSalesTab(rows, "SALES MONITORING NOVEMBER 2026");
  it("makes one entry for each stage that has an amount, with the bank, the date and the AR number", () => {
    const a = pays.filter((p) => p.plate === "NKH7462");
    expect(a.map((p) => [p.stage, p.bank, p.date, p.amount, p.arNo])).toEqual([["reservation", "BDO", "2026-11-02", 20000, "1078"], ["full", "BDO", "2026-11-11", 70000, "2545"], ["financing", "BDO", "2026-11-13", 430000, ""], ["split", "BDO", "2026-11-13", 520000, ""]]);
    expect(a[0]).toMatchObject({ buyer: "MARIA THERESA B. VICENTE", saleType: "FINANCING", agreedPrice: 520000, row: 3 });
  });
  it("calls Security Bank by one name and leaves out the empty rows", () => {
    const b = pays.filter((p) => p.plate === "NKN9618");
    expect(b.map((p) => [p.stage, p.bank, p.arNo])).toEqual([["reservation", "SECURITY BANK", ""], ["full", "SECURITY BANK", "2543"]]);
    expect(pays.every((p) => p.plate !== "")).toBe(true);
    expect([bankName("sb"), bankName("Security Bank"), bankName("SBTC"), bankName("bpi"), bankName("")]).toEqual(["SECURITY BANK", "SECURITY BANK", "SECURITY BANK", "BPI", ""]);
  });
});
