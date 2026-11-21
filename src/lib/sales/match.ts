// A sale made in the app (its first receipt) becomes a record of the sale list, or joins the one that is already there. Pure rules, so they are tested.

const letters = (s: string | null | undefined) => String(s ?? "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length > 1);

/**
 * Is the buyer of the deal the buyer written on a record? Names are typed in different orders and with or without a middle name
 * ("DELA CRUZ, JUAN" and "Juan P. Dela Cruz"), so they match when most of the shorter name's words are in the other.
 */
export function sameBuyer(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = letters(a), y = letters(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  const hits = short.filter((w) => long.includes(w)).length;
  return hits >= Math.max(2, Math.ceil(short.length * 0.7)) || (short.length === 1 && hits === 1 && long.length === 1);
}

/** The sales person as the team writes it on the sold list: the first name in capitals ("David Reyes" → "DAVID"). */
export function salespersonOf(fullName: string | null | undefined): string | null {
  const first = String(fullName ?? "").trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  return first || null;
}

/** The key that makes "this deal's sale record for this plate" be made once. */
export const dealSaleKey = (dealId: string, plate: string): string => `deal|${dealId}|${plate}`;
