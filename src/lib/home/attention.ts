import "server-only";
import { countAwaitingPrice } from "@/lib/cars/read";
import { docsDb } from "@/lib/docsbible/review-server";
import { type Role } from "@/lib/roles";
import { handoffMap } from "@/lib/transfers/handoff";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ModuleId } from "@/lib/navigation";

export type TileTone = "zinc" | "amber" | "red" | "emerald" | "blue";
/** A number the person should look at, with where to go. */
export interface Tile { key: string; label: string; value: number; hint: string; href: string; tone: TileTone }

const DAY = 86_400_000;
const head = { count: "exact" as const, head: true };

/** What needs this person's attention, by role. Each tile is one count and a link; nothing here is long to read. */
export async function loadAttention(role: Role, modules: readonly ModuleId[], now = new Date()): Promise<Tile[]> {
  const db = docsDb(), admin = createAdminClient();
  const has = (m: ModuleId) => modules.includes(m);
  const out: Promise<Tile | null>[] = [];
  const add = (p: PromiseLike<Tile | null>) => out.push(Promise.resolve(p).catch(() => null));

  // repairs: whoever decides on them (Super Admin, Admin, Sales)
  if (has("repairs") && (role === "super_admin" || role === "admin" || role === "sales")) {
    add(db.from("car_repairs").select("id", head).eq("approval", "pending").then((r) => ({ key: "repairs", label: "Repair reports waiting for approval", value: r.count ?? 0, hint: "Open Repairs to approve or reject.", href: "/repairs", tone: (r.count ?? 0) > 0 ? "amber" : "zinc" } as Tile)));
  }
  if (role === "super_admin" || role === "admin") {
    if (has("pricing")) add(countAwaitingPrice().then((n) => ({ key: "pricing", label: "New cars waiting for a price", value: n, hint: "They go into Car Inventory once priced.", href: "/new-cars", tone: n > 0 ? "amber" : "zinc" } as Tile)));
    add(db.from("docs_review_items").select("id", head).eq("status", "open").then((r) => ({ key: "review", label: "Things in the data check", value: r.count ?? 0, hint: "Same plate twice, statuses that differ.", href: "/data-check", tone: (r.count ?? 0) > 0 ? "amber" : "zinc" } as Tile)));
  }
  if (role === "super_admin" && has("sync")) {
    add(admin.from("sync_jobs").select("id", head).eq("status", "failed").gte("updated_at", new Date(now.getTime() - DAY).toISOString()).then((r) => ({ key: "sync", label: "Failed background jobs (last 24 hours)", value: r.count ?? 0, hint: "Open Sync jobs to see why.", href: "/admin/sync", tone: (r.count ?? 0) > 0 ? "red" : "emerald" } as Tile)));
  }
  // the IN documents: Buying (and the Admins) approve them
  if (role === "buying" || role === "documentation" || role === "admin" || role === "super_admin") {
    add((async () => {
      const [{ data: folders }, { data: flows }] = await Promise.all([
        db.from("unit_folders").select("plate_no").eq("match_status", "linked").eq("location", "available").not("scanned_at", "is", null).limit(5000),
        db.from("unit_workflow").select("plate_no").not("docs_approved_at", "is", null).limit(5000),
      ]);
      const approved = new Set((flows ?? []).map((f) => f.plate_no as string));
      const n = (folders ?? []).filter((f) => !approved.has(f.plate_no as string)).length;
      return { key: "in-approve", label: "Cars whose IN documents are not approved", value: n, hint: "Scanned, waiting to be checked and approved.", href: "/documents", tone: n > 0 ? "amber" : "emerald" } as Tile;
    })());
  }
  // the transfer: Documentation (and the Admins)
  if (role === "documentation" || role === "admin" || role === "super_admin") {
    add(handoffMap().then((m) => {
      const out = [...m.values()].filter((h) => h.handedOffAt && !h.backAt);
      const oldest = out.reduce((n, h) => Math.max(n, Math.floor((now.getTime() - Date.parse(h.handedOffAt!)) / DAY)), 0);
      return { key: "handoff", label: "Papers with Sir Jep", value: out.length, hint: out.length ? `The longest for ${oldest} ${oldest === 1 ? "day" : "days"}.` : "Nothing is out.", href: "/documents/handoff", tone: oldest >= 3 ? "amber" : "zinc" } as Tile;
    }));
    add(db.from("car_sales").select("id", head).eq("is_reference", false).eq("stage", "in_process").is("handed_off_at", null).gte("sold_on", new Date(now.getTime() - 60 * DAY).toISOString().slice(0, 10)).then((r) => ({ key: "to-handoff", label: "Sold cars not handed off yet (last 60 days)", value: r.count ?? 0, hint: "Open the car, then Sale and transfer.", href: "/documents/transfers", tone: (r.count ?? 0) > 0 ? "amber" : "zinc" } as Tile)));
  }
  // marketing: the cars that became ready to post this week
  if (role === "marketing" || role === "admin" || role === "super_admin") {
    add(db.from("unit_workflow").select("plate_no", head).gte("docs_approved_at", new Date(now.getTime() - 7 * DAY).toISOString()).then((r) => ({ key: "ready", label: "Cars ready to market this week", value: r.count ?? 0, hint: "Their documents were approved in the last 7 days.", href: "/cars", tone: "blue" } as Tile)));
  }
  return (await Promise.all(out)).filter((t): t is Tile => !!t);
}
