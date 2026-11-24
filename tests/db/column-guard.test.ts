import { beforeAll, describe, expect, it } from "vitest";
import { FIELD_NAME } from "@/lib/cars/sections";
import { SALE_FIELD_NAME } from "@/lib/sales/sections";
import { createDb, type Db } from "./harness";

// The car record and the sale record have the columns the shared sections name, and a short list of internal ones. A new column has to be added to
// the sections (with its one name) or to the internal list on purpose: this is what keeps the structure from growing back into a mess.
let db: Db;
beforeAll(async () => { db = await createDb(); }, 60_000);
const columns = async (table: string) => (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'public' and table_name = '${table}'`)).rows.map((r) => r.column_name);
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// what the screens name through the sections but the car record stores under another column
const CAR_NAMED = new Set(Object.keys(FIELD_NAME));
const CAR_INTERNAL = [
  "id", "plate_no", "source", "import_run_id", "source_row", "raw", "arrival_raw", "created_by", "updated_by", "last_change_source", "created_at", "updated_at", "archived_at", "archived_by",
  "in_stock", "body_group", "stock_order", "state_for", "state_on",
  // the About-the-car answers, named on the About card
  "owner_no", "casa_maintained", "casa_when", "casa_where", "battery_when", "bought_from", "ev_type", "wall_charger", "portable_charger", "key_card", "charging_card", "condition_note",
];

const SALE_NAMED = new Set(Object.keys(SALE_FIELD_NAME).map(snake));
const SALE_INTERNAL = [
  "id", "unit_id", "plate_no", "deal_id", "source", "source_key", "sheet_row", "raw", "is_reference", "flags", "edited_in_app", "plate_original", "created_by", "updated_by", "created_at", "updated_at",
  "payment_status_at", "handed_off_by", "back_by", "handoff_note", "handoff_checked", "last_reminded_at",
  // a sale of a car that is not in the register keeps the car as the sheet described it
  "car_text", "chassis_no", "engine_no", "liaison_status", "liaison_received_on",
];

describe("the car record has only the columns the sections name", () => {
  it("names or lists every column of the car record, and none is a stranger", async () => {
    const strangers = (await columns("docs_units")).filter((c) => !CAR_NAMED.has(c) && !CAR_INTERNAL.includes(c));
    expect(strangers, `add these to src/lib/cars/sections.ts (with a name) or to CAR_INTERNAL: ${strangers.join(", ")}`).toEqual([]);
  });
  it("has every named stored box as a real column", async () => {
    const cols = new Set(await columns("docs_units"));
    const notColumns = new Set(["complete_docs", "plate_display_x"]); // worked out, not stored
    for (const k of CAR_NAMED) if (!notColumns.has(k)) expect(cols.has(k), `${k} is named in the sections but is not a column`).toBe(true);
  });
});

describe("the sale record has only the columns the sale sections name", () => {
  it("names or lists every column of the sale record, and none is a stranger", async () => {
    const strangers = (await columns("car_sales")).filter((c) => !SALE_NAMED.has(c) && !SALE_INTERNAL.includes(c));
    expect(strangers, `add these to src/lib/sales/sections.ts (with a name) or to SALE_INTERNAL: ${strangers.join(", ")}`).toEqual([]);
  });
});
