import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { driveProblem } from "@/lib/notify/events";
import { defaultDocsDeps, docsErrorText, ensureCarFolder, uploadPhoto } from "@/lib/docs/service";
import { readerMode } from "@/lib/docs/bot-scan";
import { unitForFolder } from "@/lib/docsbible/unit-lookup";

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
    let folder = await ensureCarFolder(plate, deps, unitForFolder);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const send = (f: typeof folder) => uploadPhoto({ plate: f.plate, actor: user.id, bytes, mime: file.type, label: String(form.get("label") ?? "").replace(/[^\w-]/g, "").slice(0, 40) || "doc", deferRead: readerMode() === "grokbot" }, deps);
    let result;
    try { result = await send(folder); } catch (err) {
      // the car's saved folder is gone (left over from an earlier Drive): drop the link, find or make the folder again, and try once more
      if (!/not inside|not found|not allowed|permission|access/i.test(err instanceof Error ? err.message : String(err))) throw err;
      await deps.admin.from("unit_folders").update({ match_status: "none", folder_id: null, folder_name: null, folder_url: null, candidates: [] }).eq("plate_no", folder.plate);
      folder = await ensureCarFolder(plate, deps, unitForFolder);
      result = await send(folder);
    }
    console.info(`[docs] add status=${result.readStatus}`);
    return Response.json({ result, folder: { name: folder.folderName, created: folder.created, location: folder.location } });
  } catch (err) {
    const text = docsErrorText(err);
    console.info(`[docs] add status=failed reason=${text}`);
    after(() => driveProblem(text));
    return fail(text, 422); // not a 5xx: Cloudflare would swap the body for its own error page and the reason would be lost
  }
}
