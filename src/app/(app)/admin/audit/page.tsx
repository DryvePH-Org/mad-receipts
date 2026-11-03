import { Suspense } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/auth";
import { ACTION_LABELS, AUDIT_ENTITIES, actionLabel, auditSummary } from "@/lib/audit";
import { formatManilaDateTime } from "@/lib/dates";
import { pageNumber, pageRange, param } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

export default function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Audit log</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <AuditContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AuditContent({ searchParams }: { searchParams: PageProps<"/admin/audit">["searchParams"] }) {
  await requireAdmin();
  const sp = await searchParams;
  const actor = isUuid(param(sp.actor)) ? param(sp.actor) : "";
  const action = param(sp.action) in ACTION_LABELS ? param(sp.action) : "";
  const entity = AUDIT_ENTITIES.find((e) => e === param(sp.entity)) ?? "";
  const from = isDate(param(sp.from)) ? param(sp.from) : "";
  const to = isDate(param(sp.to)) ? param(sp.to) : "";
  const page = pageNumber(sp.page);

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, action, entity, entity_id, before, after, created_at, profiles(full_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(...pageRange(page));
  if (actor) query = query.eq("actor_id", actor);
  if (action) query = query.eq("action", action);
  if (entity) query = query.eq("entity", entity);
  if (from) query = query.gte("created_at", `${from}T00:00:00+08:00`); // days are Manila days
  if (to) query = query.lte("created_at", `${to}T23:59:59.999+08:00`);

  const [logs, people] = await Promise.all([query, supabase.from("profiles").select("id, full_name").order("full_name")]);
  if (logs.error) return <p className="text-destructive">Could not load the audit log. Please try again.</p>;

  const filtered = actor || action || entity || from || to;

  return (
    <>
      <AdminNav />
      <form method="get" className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <select name="actor" defaultValue={actor} aria-label="Who" className="h-12 rounded-lg border border-input bg-transparent px-3 text-base">
            <option value="">Everyone</option>
            {(people.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? "Unnamed"}
              </option>
            ))}
          </select>
          <select name="entity" defaultValue={entity} aria-label="What" className="h-12 rounded-lg border border-input bg-transparent px-3 text-base">
            <option value="">Everything</option>
            {AUDIT_ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <select name="action" defaultValue={action} aria-label="Action" className="h-12 w-full rounded-lg border border-input bg-transparent px-3 text-base">
          <option value="">Any action</option>
          {Object.entries(ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm text-muted-foreground">
            From
            <Input type="date" name="from" defaultValue={from} className="h-12 text-base" />
          </label>
          <label className="space-y-1 text-sm text-muted-foreground">
            To
            <Input type="date" name="to" defaultValue={to} className="h-12 text-base" />
          </label>
        </div>
        <Button type="submit" className="h-12 w-full text-base">
          Filter
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {logs.count ?? 0} {logs.count === 1 ? "entry" : "entries"}
        {filtered && (
          <>
            {" · "}
            <Link href="/admin/audit" className="font-medium underline">
              Clear
            </Link>
          </>
        )}
      </p>

      {logs.data.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-muted-foreground">Nothing found.</p>
      ) : (
        <ul className="space-y-3">
          {logs.data.map((entry) => {
            const summary = auditSummary(entry);
            return (
              <li key={entry.id} className="space-y-1.5 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{actionLabel(entry.action)}</p>
                  <Badge variant="outline">{entry.entity.replace("_", " ")}</Badge>
                </div>
                {summary && <p className="text-sm">{summary}</p>}
                <p className="text-sm text-muted-foreground">
                  {entry.profiles?.full_name ?? "System"} · {formatManilaDateTime(entry.created_at)}
                </p>
                {(entry.before || entry.after) && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Details</summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-2 whitespace-pre-wrap">
                      {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Pagination page={page} total={logs.count ?? 0} path="/admin/audit" params={{ actor, entity, action, from, to }} />
    </>
  );
}
