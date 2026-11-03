import { Suspense } from "react";
import Link from "next/link";
import { ScrollText, SearchX } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { ResponsiveList } from "@/components/shared/responsive-list";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { requireAdmin } from "@/lib/auth";
import { ACTION_LABELS, AUDIT_ENTITIES, actionLabel, auditSummary } from "@/lib/audit";
import { formatManilaDateTime } from "@/lib/dates";
import { pageNumber, pageRange, param } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const isUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);

export default function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Who did what, and when. Every confirm, void, cancel and edit is recorded here." />
      <Suspense fallback={<PageSkeleton />}>
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

  const filtered = Boolean(actor || action || entity || from || to);
  const details = (entry: (typeof logs.data)[number]) =>
    entry.before || entry.after ? (
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Details</summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-2 whitespace-pre-wrap">
          {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
        </pre>
      </details>
    ) : null;

  return (
    <>
      <Card>
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_9.5rem_9.5rem_auto]">
            <NativeSelect name="actor" defaultValue={actor} aria-label="Who">
              <option value="">Everyone</option>
              {(people.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? "Unnamed"}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="action" defaultValue={action} aria-label="Action">
              <option value="">Any action</option>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect name="entity" defaultValue={entity} aria-label="What">
              <option value="">Everything</option>
              {AUDIT_ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {e.replace("_", " ")}
                </option>
              ))}
            </NativeSelect>
            <Input type="date" name="from" defaultValue={from} aria-label="From date" />
            <Input type="date" name="to" defaultValue={to} aria-label="To date" />
            <Button type="submit" className="sm:col-span-2 lg:col-span-1">
              Filter
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {logs.count ?? 0} {logs.count === 1 ? "entry" : "entries"}
        {filtered && (
          <>
            {" · "}
            <Link href="/admin/audit" className="font-medium text-foreground underline">
              Clear filters
            </Link>
          </>
        )}
      </p>

      <ResponsiveList
        rows={logs.data}
        getRowKey={(e) => e.id}
        empty={
          <EmptyState
            icon={filtered ? SearchX : ScrollText}
            title={filtered ? "Nothing matches" : "Nothing recorded yet"}
            description={filtered ? "Try other filters or a wider date range." : "Activity appears here as it happens."}
          />
        }
        columns={[
          { key: "when", header: "When", cell: (e) => <span className="whitespace-nowrap">{formatManilaDateTime(e.created_at)}</span> },
          { key: "who", header: "Who", cell: (e) => e.profiles?.full_name ?? "System" },
          { key: "action", header: "Action", cell: (e) => actionLabel(e.action) },
          {
            key: "details",
            header: "Details",
            className: "max-w-md whitespace-normal",
            cell: (e) => (
              <span className="block space-y-1">
                <span className="block">{auditSummary(e)}</span>
                {details(e)}
              </span>
            ),
          },
        ]}
        renderCard={(e) => (
          <div className="space-y-1.5 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">{actionLabel(e.action)}</p>
              <Badge variant="outline">{e.entity.replace("_", " ")}</Badge>
            </div>
            {auditSummary(e) && <p className="text-sm">{auditSummary(e)}</p>}
            <p className="text-sm text-muted-foreground">
              {e.profiles?.full_name ?? "System"} · {formatManilaDateTime(e.created_at)}
            </p>
            {details(e)}
          </div>
        )}
      />

      <Pagination page={page} total={logs.count ?? 0} path="/admin/audit" params={{ actor, entity, action, from, to }} />
    </>
  );
}
