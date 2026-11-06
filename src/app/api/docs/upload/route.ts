import { loadCar, docsErrorText, uploadPhoto } from "@/lib/docs/service";
import { lookupForSales, salesViewOf } from "@/lib/docs/sales";
import { getCurrentUser } from "@/lib/auth";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = /^image\/(jpeg|png|webp)$/;
const fail = (error: string, status: number) => Response.json({ error }, { status });

/** One document photo from Sales: filed in the car's Drive folder by plate, read, and the checklist updates. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("Not logged in", 401);
  if (!user.modules.includes("upload")) return fail("You do not have the Upload documents module.", 403);

  const form = await request.formData().catch(() => null);
  const plate = String(form?.get("plate") ?? "").slice(0, 20);
  const file = form?.get("file");
  if (!form || !plate || !(file instanceof File) || file.size === 0) return fail("Choose a car and a photo.", 400);
  if (!ALLOWED.test(file.type)) return fail("Send a JPEG, PNG or WebP photo.", 415);
  if (file.size > MAX_BYTES) return fail("That photo is too large.", 413);

  // The plate must belong to a car that has an AR: never file a photo under a plate nobody has sold.
  const found = await lookupForSales(plate).catch((e) => ({ ok: false as const, message: docsErrorText(e) }));
  if (!found.ok) return fail(found.message, 409);
  try {
    const result = await uploadPhoto({ plate: found.view.plate, actor: user.id, bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type, label: String(form.get("label") ?? "").replace(/[^\w-]+/g, "").slice(0, 20) || undefined });
    const car = await loadCar(found.view.plate);
    console.info(`[docs] upload status=${result.readStatus}`);
    return Response.json({ result, view: car ? salesViewOf(car, found.view.buyer, found.view.dealNo) : found.view });
  } catch (err) {
    console.info("[docs] upload status=failed");
    return fail(docsErrorText(err), 502);
  }
}
