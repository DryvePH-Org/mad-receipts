import { docsBridge } from "@/lib/docs/bridge";
import { verifyFileToken } from "@/lib/docs/signed-url";
import { createAdminClient } from "@/lib/supabase/admin";

/** A document photo for the grokbot: opened with a short-lived signed link (no login). Only the photo the link names, for a few minutes. */
export async function GET(_request: Request, ctx: RouteContext<"/api/docs/scan-file/[token]">) {
  const { token } = await ctx.params;
  const id = verifyFileToken(token, process.env.GROKBOT_CALLBACK_SECRET ?? "");
  if (!id) return new Response("This link is not valid or has expired.", { status: 403, headers: { "Cache-Control": "no-store" } });
  const { data: file } = await createAdminClient().from("folder_files").select("drive_file_id").eq("id", id).maybeSingle();
  if (!file) return new Response("Not found", { status: 404 });
  try {
    const p = await docsBridge().preview(file.drive_file_id, 1600);
    return new Response(Buffer.from(p.base64, "base64"), { headers: { "Content-Type": p.mimeType || "image/jpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Could not load the picture", { status: 502 });
  }
}
