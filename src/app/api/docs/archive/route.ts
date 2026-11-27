import { after } from "next/server";
import { readerMode, scheduleScan } from "@/lib/docs/bot-scan";
import { getCurrentUser } from "@/lib/auth";
import { uploadArchive } from "@/lib/docs/archive";
import { docsErrorText } from "@/lib/docs/service";
import { driveProblem } from "@/lib/notify/events";
import { seesSales } from "@/lib/roles";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|png|webp)|application\/pdf)$/;
const fail = (error: string, status: number) => Response.json({ error }, { status });

/** One paper (photo or PDF) for a car's archive: a payment paper, or a paper handed to the new owner (`kind=transfer`). Filed in the car's Drive folder, never read by the scanner. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("Not logged in", 401);
  const form = await request.formData().catch(() => null);
  // the papers for the new owner belong to the transfer (Documentation, Admins); the payment papers to the OUT documents (not for Online Marketing: they are money)
  const transfer = form?.get("kind") === "transfer";
  if (!seesSales(user.role) || !user.modules.includes(transfer ? "transfer" : "upload")) return fail("You cannot add papers here.", 403);
  const plate = String(form?.get("plate") ?? "").slice(0, 20);
  const file = form?.get("file");
  if (!form || !plate || !(file instanceof File) || file.size === 0) return fail("Choose a car and a file.", 400);
  if (!ALLOWED.test(file.type)) return fail("Send a photo (JPEG, PNG, WebP) or a PDF.", 415);
  if (file.size > MAX_BYTES) return fail("That file is too large (8 MB at most).", 413);
  try {
    const r = await uploadArchive({ plate, actor: user.id, bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type, name: file.name, tag: String(form.get("tag") ?? ""), kind: form.get("kind") === "transfer" ? "transfer" : "payment", amount: form.get("amount"), on: form.get("on"), note: form.get("note") });
    if (transfer && readerMode() === "grokbot") scheduleScan(plate, 25_000, undefined, "transfer"); // the transfer scanner reads the papers together, shortly after the last one
    return Response.json({ ok: true, ...r });
  } catch (err) {
    const text = docsErrorText(err);
    after(() => driveProblem(text));
    return fail(text, 422);
  }
}
