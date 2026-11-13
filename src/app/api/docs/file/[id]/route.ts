import { getCurrentUser } from "@/lib/auth";
import { docsBridge } from "@/lib/docs/bridge";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A document photo for the Car documents page, as a picture the browser can show (HEIC and PDF pages come as JPEG). Drive is never changed. */
export async function GET(_request: Request, ctx: RouteContext<"/api/docs/file/[id]">) {
  const user = await getCurrentUser();
  if (!user || !user.modules.includes("documents")) return new Response("Not allowed", { status: 403 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const { data: file } = await createAdminClient().from("folder_files").select("drive_file_id").eq("id", id).maybeSingle();
  if (!file) return new Response("Not found", { status: 404 });
  try {
    const p = await docsBridge().preview(file.drive_file_id, 1200);
    return new Response(Buffer.from(p.base64, "base64"), { headers: { "Content-Type": p.mimeType || "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Could not load the picture", { status: 502 });
  }
}
