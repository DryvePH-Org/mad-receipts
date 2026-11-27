import { readerMode, scheduleScan } from "@/lib/docs/bot-scan";
import { loadCar, docsErrorText, uploadPhoto } from "@/lib/docs/service";
import { lookupForSales, salesViewOf } from "@/lib/docs/sales";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { driveProblem, soldPapersAdded } from "@/lib/notify/events";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = /^image\/(jpeg|png|webp)$/;
const fail = (error: string, status: number) => Response.json({ error }, { status });

/** One document photo from Sales: filed in the car's Drive folder by plate, read, and the checklist updates. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("Not logged in", 401);
  if (!user.modules.includes("upload")) return fail("You cannot add sold papers.", 403);

  const form = await request.formData().catch(() => null);
  const plate = String(form?.get("plate") ?? "").slice(0, 20);
  const file = form?.get("file");
  if (!form || !plate || !(file instanceof File) || file.size === 0) return fail("Choose a car and a photo.", 400);
  if (!ALLOWED.test(file.type)) return fail("Send a JPEG, PNG or WebP photo.", 415);
  if (file.size > MAX_BYTES) return fail("That photo is too large.", 413);

  // The plate must belong to a car that has an AR: never file a photo under a plate nobody has sold.
  const isAr = form.get("ar") === "1"; // the AR itself: the sale is made from it once it is read, so a car with no sale yet is fine
  const found = await lookupForSales(plate, { allowNoSale: isAr }).catch((e) => ({ ok: false as const, message: docsErrorText(e) }));
  if (!found.ok) return fail(found.message, 409);
  try {
    const result = await uploadPhoto({ area: "out", plate: found.view.plate, actor: user.id, bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type, label: String(form.get("label") ?? "").replace(/[^\w-]+/g, "").slice(0, 20) || undefined, deferRead: readerMode() === "grokbot" });
    if (readerMode() === "grokbot") scheduleScan(found.view.plate, 25_000, undefined, "out"); // the OUT scanner reads these; photos added one by one are scanned together, shortly after the last one
    const car = await loadCar(found.view.plate);
    console.info(`[docs] upload status=${result.readStatus}`);
    after(() => soldPapersAdded(found.view.plate, car?.folder.folder_name ?? found.view.plate, user.id));
    return Response.json({ result, view: car ? salesViewOf(car, found.view.buyer, found.view.dealNo) : found.view });
  } catch (err) {
    console.info("[docs] upload status=failed");
    const text = docsErrorText(err);
    after(() => driveProblem(text));
    return fail(text, 422); // not a 5xx: Cloudflare would swap the body for its own error page and the reason would be lost
  }
}
