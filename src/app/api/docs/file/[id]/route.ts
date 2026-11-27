import { getCurrentUser } from "@/lib/auth";
import { docsBridge } from "@/lib/docs/bridge";
import { cachedPreview } from "@/lib/docs/preview-cache";
import { PRIVATE_DOCS } from "@/lib/docs/types";
import { seesPrivateDocs, seesSales } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/**
 * A document photo for the Car documents page, as a picture the browser can show (HEIC and PDF pages come as JPEG). Drive is never changed.
 * `?download=1` sends the larger picture as a file to save. A private paper (the notarized closed deed) is not found for Sales and Online Marketing.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/docs/file/[id]">) {
  const user = await getCurrentUser();
  if (!user || !user.modules.includes("register")) return new Response("Not allowed", { status: 403 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const { data: file } = await createAdminClient().from("folder_files").select("drive_file_id, filename, doc_types, archive").eq("id", id).maybeSingle();
  if (!file) return new Response("Not found", { status: 404 });
  if (!seesPrivateDocs(user.role) && ((file.doc_types as string[] | null) ?? []).some((t) => (PRIVATE_DOCS as string[]).includes(t))) return new Response("Not found", { status: 404 });
  if (file.archive && !seesSales(user.role)) return new Response("Not found", { status: 404 }); // payment papers are money: not for Online Marketing
  const download = new URL(request.url).searchParams.get("download") === "1";
  try {
    const size = download ? 3000 : 1200;
    const got = await cachedPreview(`${file.drive_file_id}:${size}`, async () => { const p = await docsBridge().preview(file.drive_file_id, size); return { bytes: Buffer.from(p.base64, "base64"), mime: p.mimeType || "image/jpeg" }; });
    const mime = got.mime;
    const base = String(file.filename ?? "photo").replace(/\.[A-Za-z0-9]{2,5}$/, "").replace(/[^\w .()-]+/g, "_").slice(0, 80) || "photo";
    return new Response(new Uint8Array(got.bytes), { headers: {
      "Content-Type": mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff",
      ...(download ? { "Content-Disposition": `attachment; filename="${base}.${EXT[mime] ?? "jpg"}"` } : {}),
    } });
  } catch {
    return new Response("Could not load the picture", { status: 502 });
  }
}
