// Money is always an integer number of centavos in code (₱1.00 = 100).
// Postgres stores numeric(12,2); convert at the edges with these helpers.

/** Largest amount numeric(12,2) can hold: ₱9,999,999,999.99. */
export const MAX_CENTAVOS = 999_999_999_999;

/**
 * Parses a peso amount into centavos. Accepts "50,000.00", "₱ 50,000", "P50000",
 * "PHP 1,500.5" or a number in pesos. Returns null for blank, negative, malformed,
 * more than 2 decimal places, or out-of-range input.
 */
export function toCentavos(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;

  // Go through a string so 0.1 + 0.2 style float error never reaches the result.
  const text =
    typeof value === "number"
      ? Number.isFinite(value)
        ? value.toFixed(2)
        : ""
      : value
          .trim()
          .replace(/^(php|₱|p)\s*/i, "")
          .replace(/[\s,]/g, "")
          .replace(/\.-*$/, ""); // "50,000.-" is a common way to write whole pesos

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;

  const pesos = Number(match[1]);
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const total = pesos * 100 + cents;
  return Number.isSafeInteger(total) && total <= MAX_CENTAVOS ? total : null;
}

/** Centavos → "50000.00", exact, for numeric(12,2) columns and JSON payloads. */
export function fromCentavos(centavos: number): string {
  assertCentavos(centavos);
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Centavos → "₱50,000" (whole pesos) or "₱50,000.50". */
export function formatPeso(centavos: number): string {
  assertCentavos(centavos);
  const sign = centavos < 0 ? "-" : "";
  const abs = Math.abs(centavos);
  const pesos = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = abs % 100;
  return `${sign}₱${pesos}${cents ? `.${String(cents).padStart(2, "0")}` : ""}`;
}

function assertCentavos(centavos: number): void {
  if (!Number.isSafeInteger(centavos)) {
    throw new TypeError(`Expected integer centavos, got ${centavos}`);
  }
}
