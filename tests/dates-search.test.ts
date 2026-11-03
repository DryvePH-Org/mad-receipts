import { describe, expect, it } from "vitest";
import { addDays, daysBetween, formatDate, manilaToday, monthStart } from "@/lib/dates";
import { PAGE_SIZE, pageNumber, pageRange, param, searchTerm } from "@/lib/search";

describe("dates", () => {
  it("today is Manila's today, not UTC's", () => {
    expect(manilaToday(new Date("2026-11-02T17:00:00Z"))).toBe("2026-11-03"); // 1 am in Manila
    expect(manilaToday(new Date("2026-11-02T15:59:00Z"))).toBe("2026-11-02");
  });
  it("adds days across month ends", () => {
    expect(addDays("2026-11-03", 3)).toBe("2026-11-06");
    expect(addDays("2026-11-29", 3)).toBe("2026-12-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("counts days between dates", () => {
    expect(daysBetween("2026-11-03", "2026-11-05")).toBe(2);
    expect(daysBetween("2026-11-05", "2026-11-03")).toBe(-2);
    expect(daysBetween("2026-11-03", "2026-11-03")).toBe(0);
  });
  it("formats and finds the month start", () => {
    expect(formatDate("2026-11-05")).toBe("Nov 5, 2026");
    expect(monthStart("2026-11-17")).toBe("2026-11-01");
  });
});

describe("searchTerm", () => {
  it("keeps names and plates", () => {
    expect(searchTerm("  NKF-4771 ")).toBe("NKF-4771");
    expect(searchTerm("Jose  Rizal")).toBe("Jose Rizal");
    expect(searchTerm("Peña")).toBe("Peña");
    expect(searchTerm("O'Brien")).toBe("O'Brien");
  });
  it("removes everything meaningful in a filter", () => {
    expect(searchTerm("a,b)or(id.eq.1")).toBe("a b or id eq 1");
    expect(searchTerm("100%*")).toBe("100");
    expect(searchTerm(null)).toBe("");
    expect(searchTerm("x".repeat(200))).toHaveLength(60);
  });
});

describe("paging", () => {
  it("reads the page number safely", () => {
    expect(pageNumber("3")).toBe(3);
    expect(pageNumber(["2", "9"])).toBe(2);
    for (const bad of [undefined, "", "0", "-1", "1.5", "abc", "99999"]) expect(pageNumber(bad)).toBe(1);
  });
  it("turns a page into a row range", () => {
    expect(pageRange(1)).toEqual([0, PAGE_SIZE - 1]);
    expect(pageRange(3)).toEqual([2 * PAGE_SIZE, 3 * PAGE_SIZE - 1]);
  });
  it("takes the first value of a search param", () => {
    expect(param(["a", "b"])).toBe("a");
    expect(param(undefined)).toBe("");
  });
});
