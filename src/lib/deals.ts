import { formatPeso, toCentavos } from "@/lib/rules/money";

/** A numeric(12,2) value from the database as pesos: 450000 → "₱450,000". */
export function pesos(value: number | string | null | undefined): string {
  const centavos = value === null || value === undefined ? null : toCentavos(value);
  return centavos === null ? "—" : formatPeso(centavos);
}
