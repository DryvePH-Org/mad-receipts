import writeXlsxFile from "write-excel-file/node";
import { getCurrentUser } from "@/lib/auth";
import { manilaToday } from "@/lib/dates";
import { buildDetailRows, buildPriceListRows, DETAIL_WIDTHS, WIDTHS } from "@/lib/pricelist/export";
import { loadPriceList } from "@/lib/pricelist/load";

/** The price list as an Excel file in the layout of the MAD Price List (sheet 1) plus what the Docs Bible and About the car know (sheet 2). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Not logged in", { status: 401 });
  if (!user.modules.includes("cars") || (user.role !== "admin" && user.role !== "approver")) return new Response("Not allowed", { status: 403 });
  try {
    const today = manilaToday();
    const { rows, details } = await loadPriceList();
    const main = buildPriceListRows(rows, today, `MAD PRICELIST · exported ${today}`);
    const second = buildDetailRows(details);
    const file = await writeXlsxFile([
      { data: main.data, sheet: "INVENTORY 2026", columns: WIDTHS.map((width) => ({ width })), stickyRowsCount: main.stickyRowsCount },
      { data: second.data, sheet: "About the car", columns: DETAIL_WIDTHS.map((width) => ({ width })), stickyRowsCount: second.stickyRowsCount },
    ] as never, { fontFamily: "Times New Roman", fontSize: 10 } as never).toBuffer();
    return new Response(new Uint8Array(file), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="MAD-Pricelist-${today}.xlsx"`,
      "Cache-Control": "no-store",
    } });
  } catch (e) {
    console.error(`[cars] export failed: ${e instanceof Error ? e.message : "unknown"}`);
    return new Response("Could not make the file", { status: 422 });
  }
}
