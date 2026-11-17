import { getCurrentUser } from "@/lib/auth";
import { buildExport, savedCopyUrl } from "@/lib/docsbible/export-server";

/** The Docs Bible as a CSV in the old sheet's layout. Anyone who can open the Docs Bible can download it; ?copy=docs-bible-YYYY-MM-DD.csv gives a saved copy (Admin only). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.modules.includes("register")) return new Response("Not allowed", { status: 403 });
  const copy = new URL(request.url).searchParams.get("copy");
  if (copy) {
    if (user.role !== "admin") return new Response("Only an Admin can download the saved copies.", { status: 403 });
    const url = await savedCopyUrl(copy);
    return url ? Response.redirect(url, 302) : new Response("Not found", { status: 404 });
  }
  const { csv, name } = await buildExport();
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
