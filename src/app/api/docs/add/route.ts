import { getCurrentUser } from "@/lib/auth";
import { defaultDocsDeps, docsErrorText, ensureCarFolder, uploadPhoto } from "@/lib/docs/service";
import { readerMode } from "@/lib/docs/bot-scan";
import { inventory } from "@/lib/inventory";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = /^image\/(jpeg|png|webp)$/;
const fail = (error: string, status: number) => Response.json({ error }, { status });

/**
 * One document photo from the Documentation staff, for a plate they typed: the car's folder is found or made in Available,
 * the photo is filed there and read. The page calls this once per photo, then tells the server the batch is finished.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("Not logged in", 401);
  if (!user.modules.includes("documents")) return fail("You do not have the Car documents module.", 403);

  const form = await request.formData().catch(() => null);
  const plate = String(form?.get("plate") ?? "").slice(0, 20);
  const file = form?.get("file");
  if (!form || !plate || !(file instanceof File) || file.size === 0) return fail("Type the plate and choose a photo.", 400);
  if (!ALLOWED.test(file.type)) return fail("Send a JPEG, PNG or WebP photo.", 415);
  if (file.size > MAX_BYTES) return fail("That photo is too large.", 413);

  // The staff are told once when the whole batch has been read (finishAddAction), not after every photo.
  const deps = { ...defaultDocsDeps(), after: undefined };
  try {
    const folder = await ensureCarFolder(plate, deps, (p) => inventory.getUnit(p));
    const result = await uploadPhoto({ plate: folder.plate, actor: user.id, bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type, label: String(form.get("label") ?? "").replace(/[^\w-]/g, "").slice(0, 40) || "doc", deferRead: readerMode() === "grokbot" }, deps); // with the grokbot the batch is scanned together when it ends
    console.info(`[docs] add status=${result.readStatus}`);
    return Response.json({ result, folder: { name: folder.folderName, created: folder.created, location: folder.location } });
  } catch (err) {
    console.info("[docs] add status=failed");
    return fail(docsErrorText(err), 502);
  }
}
