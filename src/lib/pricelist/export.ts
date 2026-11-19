import { parseStatus } from "@/lib/inventory/remarks";

// The Excel export of the price list: the same columns, order, headings, colours and number formats as the INVENTORY 2026 tab of the
// MAD Price List, so the staff find things where they are used to finding them. Pure code: rows in, cells out. The file is written in
// src/app/api/cars/export/route.ts.

export interface PriceRow {
  group: string | null; order: number;
  papersWith: string | null; orExpiry: string | null; orExpiryRaw: string | null; spareKey: string | null; arrived: string | null;
  ym: string | null; brand: string | null; make: string | null; color: string | null; mileage: string | null; trans: string | null; fuel: string | null;
  plate: string; price: number | null; target: number | null; reprice: number | null; retarget: number | null;
  remarks: string | null; encumbrance: string | null; tools: string | null; location: string | null; repairStatus: string | null;
}

export const HEADERS = ["DOCS", "OR EXP", "SPAREKEY", "", "NO. OF DAYS IN THE INVENTORY", "YM", "BRAND", "MAKE", "COLOR", "MILEAGE", "TRANS", "FUEL", "PLATE NUMBER", "PRICE", "TARGET", "DATE ARRIVED", "REPRICE", "RE-TARGET", "REMARKS", "ENCUMBRANCE", "TOOLS", "LOCATION", "REPAIR STATUS"] as const;
// column widths in characters, as in the sheet (REMARKS made wider: its text is long)
export const WIDTHS = [10, 11.5, 14.5, 6.5, 17.5, 4, 14.5, 27, 14.5, 10, 8, 9.5, 15.5, 11, 11, 10, 11.5, 11.5, 36, 12, 11, 16, 24.5];

const COLORS = { heading: "#00FFFF", reserved: "#B6D7A8", repair: "#E6B8AF", days: "#F4CCCC", spareKey: "#FFFF00" } as const;

export type RowKind = "reserved" | "repair" | "normal";
export function rowKind(r: Pick<PriceRow, "remarks" | "repairStatus">): RowKind {
  const remarks = r.remarks ?? "", repair = (r.repairStatus ?? "").toUpperCase();
  if (parseStatus(remarks)) return "reserved";
  if (/^\s*(RESERVED|SOLD)\b/i.test(remarks)) return "reserved";
  if (repair === "FOR REPAIR" || /^\s*FOR REPAIR\b/i.test(remarks)) return "repair";
  return "normal";
}

/** Days since the car arrived, counted in Manila dates; null when it has no arrival date. */
export function daysInStock(arrived: string | null, today: string): number | null {
  if (!arrived) return null;
  const d = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${arrived}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(d) ? d : null;
}

/** 1 when the car can be quoted and sold, 0 when it is reserved, sold, for repair or has no price yet (the sheet's narrow column D). */
export const sellableFlag = (r: Pick<PriceRow, "remarks" | "repairStatus" | "price">): 0 | 1 => (rowKind(r) === "normal" && r.price !== null ? 1 : 0);

// ---- cells (the shape the xlsx writer takes) ----
export interface Cell { value?: string | number | Date | null; type?: StringConstructor | NumberConstructor | DateConstructor; format?: string; fontWeight?: "bold"; backgroundColor?: string; align?: "left" | "center" | "right"; wrap?: boolean; height?: number; fontFamily?: string; fontSize?: number }
export type SheetRow = (Cell | null)[];

const dateOf = (iso: string | null): Date | null => (iso ? new Date(`${iso}T00:00:00Z`) : null);
const str = (v: string | null): Cell => (v ? { value: v, type: String } : null) as Cell;

export function buildPriceListRows(rows: PriceRow[], today: string, title: string): { data: SheetRow[]; stickyRowsCount: number } {
  const data: SheetRow[] = [];
  data.push([{ value: title, type: String, fontWeight: "bold" }, ...Array(HEADERS.length - 1).fill(null)]);
  data.push(HEADERS.map((h) => ({ value: h, type: String, fontWeight: "bold", wrap: true, align: "center", height: 42, ...(h === "NO. OF DAYS IN THE INVENTORY" ? { backgroundColor: COLORS.days } : {}) }) as Cell));
  let group: string | null | undefined, sellable = 0;
  for (const r of [...rows].sort((a, b) => a.order - b.order)) {
    if (r.group !== group) {
      group = r.group;
      if (group) data.push(HEADERS.map((_, i) => ({ value: i === 4 ? group : null, type: String, fontWeight: "bold", backgroundColor: COLORS.heading, height: 27 }) as Cell));
    }
    const kind = rowKind(r), flag = sellableFlag(r); sellable += flag;
    const fill = kind === "reserved" ? COLORS.reserved : kind === "repair" ? COLORS.repair : undefined;
    const paint = (c: Cell | null, col: number): Cell | null => {
      const bg = fill ?? (kind === "normal" && col === 4 ? COLORS.days : kind === "normal" && col === 2 ? COLORS.spareKey : undefined);
      return bg ? ({ ...(c ?? { value: null }), backgroundColor: bg } as Cell) : c;
    };
    const days = daysInStock(r.arrived, today);
    const orDate = dateOf(r.orExpiry);
    const cells: (Cell | null)[] = [
      str(r.papersWith),
      orDate ? { value: orDate, type: Date, format: "m/d/yy" } : str(r.orExpiryRaw),
      str(r.spareKey),
      { value: flag, type: Number },
      days === null ? null : { value: days, type: Number, format: "#,##0" },
      r.ym ? { value: /^\d+$/.test(r.ym) ? Number(r.ym) : r.ym, ...(/^\d+$/.test(r.ym) ? { type: Number } : { type: String }) } as Cell : null,
      str(r.brand), str(r.make), str(r.color), str(r.mileage), str(r.trans), str(r.fuel), str(r.plate),
      r.price === null ? null : { value: r.price, type: Number, format: "[$₱]#,##0" },
      r.target === null ? null : { value: r.target, type: Number, format: "[$₱]#,##0" },
      dateOf(r.arrived) ? { value: dateOf(r.arrived), type: Date, format: "m/d/yy" } : null,
      r.reprice === null ? null : { value: r.reprice, type: Number, format: "[$₱]#,##0" },
      r.retarget === null ? null : { value: r.retarget, type: Number, format: "[$₱]#,##0" },
      str(r.remarks), str(r.encumbrance), str(r.tools), str(r.location), str(r.repairStatus),
    ];
    data.push(cells.map((c, i) => paint(c, i)));
  }
  data.push([null, null, null, { value: sellable, type: Number, fontWeight: "bold" }, { value: "UNITS FOR SALE", type: String, fontWeight: "bold" }, ...Array(HEADERS.length - 5).fill(null)]);
  return { data, stickyRowsCount: 2 };
}

// ---- the second sheet: what the Docs Bible and the About-the-car checklist know about the same cars ----
export interface DetailRow {
  plate: string; car: string; classification: string | null; papersComplete: string | null;
  spareKey: string | null; casaMaintained: string | null; casaWhen: string | null; casaWhere: string | null; batteryWhen: string | null; boughtFrom: string | null;
  isEv: boolean; evCharger: string | null; evCard: string | null; note: string | null;
}
export const DETAIL_HEADERS = ["PLATE NUMBER", "CAR", "CLASSIFICATION", "PAPERS", "SPARE KEY", "CASA MAINTAINED", "CASA WHEN", "CASA WHERE", "BATTERY CHANGED", "BOUGHT FROM", "EV", "EV CHARGER", "EV CARD", "NOTE"] as const;
export const DETAIL_WIDTHS = [14, 40, 20, 12, 18, 16, 14, 24, 16, 22, 6, 12, 10, 40];

export function buildDetailRows(rows: DetailRow[]): { data: SheetRow[]; stickyRowsCount: number } {
  const yesNo = (v: string | null) => (v === "yes" ? "Yes" : v === "no" ? "No" : null);
  const data: SheetRow[] = [DETAIL_HEADERS.map((h) => ({ value: h, type: String, fontWeight: "bold", wrap: true, align: "center", backgroundColor: "#EEEEEE" }) as Cell)];
  for (const r of rows) data.push([str(r.plate), str(r.car), str(r.classification), str(r.papersComplete), str(r.spareKey), str(yesNo(r.casaMaintained)), str(r.casaWhen), str(r.casaWhere), str(r.batteryWhen), str(r.boughtFrom), str(r.isEv ? "Yes" : null), str(yesNo(r.evCharger)), str(yesNo(r.evCard)), str(r.note)]);
  return { data, stickyRowsCount: 1 };
}
