import { createClient } from "@/lib/supabase/server";

/**
 * A tiny "has anything changed?" check, so screens refresh when (and only when) a receipt or deal changed, within seconds, without
 * every open tab re-reading everything on a timer. It returns a short fingerprint; the browser compares it with the last one.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });

  const head = { count: "exact" as const, head: true };
  const [pending, approved, rejected, voided, deals, lastReview, lastSubmit, lastDeal] = await Promise.all([
    supabase.from("receipts").select("id", head).eq("status", "pending"),
    supabase.from("receipts").select("id", head).eq("status", "approved"),
    supabase.from("receipts").select("id", head).eq("status", "rejected"),
    supabase.from("receipts").select("id", head).eq("status", "void"),
    supabase.from("deals").select("id", head),
    supabase.from("receipts").select("reviewed_at").not("reviewed_at", "is", null).order("reviewed_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("receipts").select("submitted_at").order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("deals").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const v = [pending.count, approved.count, rejected.count, voided.count, deals.count, lastReview.data?.reviewed_at, lastSubmit.data?.submitted_at, lastDeal.data?.updated_at].join("|");
  return Response.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
