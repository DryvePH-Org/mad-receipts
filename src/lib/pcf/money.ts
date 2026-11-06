const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

export function parseMoney(value: string): number | null {
  const trimmed = value.trim();
  if (!MONEY_PATTERN.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function isPositiveMoney(value: string): boolean {
  const centavos = parseMoney(value);
  return centavos !== null && centavos > 0;
}

export function toMoneyNumber(value: string): number {
  const centavos = parseMoney(value);
  if (centavos === null) throw new Error(`Invalid money value: ${value}`);
  // Decimal number only at the PostgREST boundary; all logic uses centavos.
  return centavos / 100;
}

export function formatPHP(value: string | number): string {
  return phpFormatter.format(typeof value === "string" ? Number(value) : value);
}
