import { getCurrentUser } from "@/lib/auth";
import { CarScanError, fakeScan, scanCarPhoto, scanToForm } from "@/lib/cars/car-scan";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = /^image\/(jpeg|png|webp)$/;
const fail = (error: string, status: number) => Response.json({ error }, { status });

/**
 * The quick scan of "Add a car": one photo of the LTO record (MV Inquiry screen, CR or OR) is read and the car's details come back for the
 * form's boxes. Nothing is saved: the photo is not filed in Drive, no row is written, no copy is kept.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("Not logged in", 401);
  if (!user.modules.includes("documents")) return fail("You do not have the Car documents module.", 403);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a photo.", 400);
  if (!ALLOWED.test(file.type)) return fail("Send a JPEG, PNG or WebP photo.", 415);
  if (file.size > MAX_BYTES) return fail("That photo is too large.", 413);

  try {
    if (process.env.DOCS_FAKE_READER === "1") {
      const fake = fakeScan(file.name);
      if (!fake.legible) throw new CarScanError("The photo is too blurry or dark to read. Take it again, straight on and with the whole screen or paper in view.");
      return Response.json(scanToForm(fake));
    }
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    return Response.json(await scanCarPhoto({ base64, mime: file.type }));
  } catch (err) {
    console.info("[docs] scan-car failed");
    return fail(err instanceof CarScanError ? err.message : "The photo could not be read just now. Try again, or type the details.", 422);
  }
}
