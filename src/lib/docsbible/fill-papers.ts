import "server-only";
import { desiredValues, type DocsField } from "@/lib/docs/bible";
import type { loadCar } from "@/lib/docs/service";
import { normalizePlate } from "@/lib/rules/plate";
import { docsDb } from "./review-server";

type Car = NonNullable<Awaited<ReturnType<typeof loadCar>>>;

// Paper columns of the car's row in MAD register: the register's own names for the columns the checklist fills.
const COLUMN: Record<Exclude<DocsField, "remarks_1">, string> = { classification: "classification", cr: "cr", or: "or_receipt", deed: "deed", sellers_id: "sellers_id", sec_cert: "sec_cert", sec_ids: "sec_ids", boards_reso: "boards_reso", encumbered: "encumbered", chattel: "chattel", promissory: "promissory", stencil: "stencil" };

/**
 * A scan finished: every paper that is in the folder says "Yes" in the car's row, where the box was still empty (the photo is only the starting value).
 * Only EMPTY boxes are filled and only with "Yes"; what a person chose (No, To follow, N/A, Yes) is never changed, and the classification and the dated
 * note wait for the person who approves.
 */
export async function fillFoundPapers(car: Car): Promise<string[]> {
  const db = docsDb();
  const { data: unit } = await db.from("docs_units_current").select("*").eq("plate_no", normalizePlate(car.folder.plate_no)).maybeSingle();
  if (!unit) return [];
  const row = unit as Record<string, string | null>;
  const present = new Set(car.analysis.files.flatMap((f) => f.types));
  const current: Partial<Record<DocsField, string>> = {};
  for (const [field, col] of Object.entries(COLUMN) as [keyof typeof COLUMN, string][]) current[field] = row[col] ?? "";
  const patch: Record<string, string> = {};
  for (const [field, after] of Object.entries(desiredValues({ caseType: car.caseType, present, current })) as [keyof typeof COLUMN, string][]) {
    if (field !== "classification" && after === "Yes" && !(row[COLUMN[field]] ?? "").trim()) patch[COLUMN[field]] = "Yes";
  }
  if (!Object.keys(patch).length) return [];
  const r = await db.from("docs_units").update({ ...patch, last_change_source: "app" }).eq("id", row.id as string);
  return r.error ? [] : Object.keys(patch);
}
