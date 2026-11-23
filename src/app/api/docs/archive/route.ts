import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { uploadArchive } from "@/lib/docs/archive";
import { docsErrorText } from "@/lib/docs/service";
import { driveProblem } from "@/lib/notify/events";
import { seesSales } from "@/lib/roles";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|png|webp)|application\/pdf)$/;
const fail = (error: string, status: number) => Response.json({ error }, { status });

/** One payment paper (photo or PDF) for a car's payment archive: filed in the car's Drive folder, never read by the scanner. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("Not logged in", 401);
  if (!seesSales(user.role) || (!user.modules.includes("upload") && !user.modules.includes("documents"))) return fail("You cannot add payment papers.", 403);
  const form = await request.formData().catch(() => null);
  const plate = String(form?.get("plate") ?? "").slice(0, 20);
  const file = form?.get("file");
  if (!form || !plate || !(file instanceof File) || file.size === 0) return fail("Choose a car and a file.", 400);
  if (!ALLOWED.test(file.type)) return fail("Send a photo (JPEG, PNG, WebP) or a PDF.", 415);
  if (file.size > MAX_BYTES) return fail("That file is too large (8 MB at most).", 413);
  try {
    const r = await uploadArchive({ plate, actor: user.id, bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type, name: file.name, tag: String(form.get("tag") ?? ""), amount: form.get("amount"), on: form.get("on"), note: form.get("note") });
    return Response.json({ ok: true, ...r });
  } catch (err) {
    const text = docsErrorText(err);
    after(() => driveProblem(text));
    return fail(text, 422);
  }
}
