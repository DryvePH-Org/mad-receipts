/** The year model as the receipt writes it. The inventory's YM column holds two digits ("26"), sometimes four ("2021"). */
export function fullYear(ym: string | undefined, now = new Date()): string {
  const v = (ym ?? "").trim();
  if (/^\d{4}$/.test(v)) return v;
  if (!/^\d{2}$/.test(v)) return v;
  const n = Number(v), latest = (now.getFullYear() + 1) % 100; // a model year may be one ahead of the calendar
  return String(n <= latest ? 2000 + n : 1900 + n);
}

/** "26" + "SUZUKI SPRESSO" → "2026 SUZUKI SPRESSO". Left alone when there is no year or the name already starts with it. */
export function withYear(ym: string | undefined, makeType: string | undefined, now = new Date()): string | undefined {
  const year = fullYear(ym, now);
  if (!makeType || !/^\d{4}$/.test(year)) return makeType;
  return makeType.trim().startsWith(year) ? makeType : `${year} ${makeType}`;
}
