// A car that was just added has no price yet. It waits in "New cars to price" (Admin and Super Admin) until a price is set: only then does it go into Car Inventory.
// Pure code so it can be tested; the reading is in read.ts.

export interface PriceFacts {
  in_stock?: boolean | null;
  stock_state?: string | null;
  list_price?: number | string | null;
  reprice?: number | string | null;
}

const has = (v: number | string | null | undefined) => v !== null && v !== undefined && v !== "" && Number(v) > 0;

/** On the sale list, ready (not reserved, sold, for repair or kept back) and no price at all: it has not been priced yet. */
export function awaitsPrice(r: PriceFacts): boolean {
  if (r.in_stock === false) return false;
  if (r.stock_state && r.stock_state !== "Onhand") return false;
  return !has(r.list_price) && !has(r.reprice);
}
