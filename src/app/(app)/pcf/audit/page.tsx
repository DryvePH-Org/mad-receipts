import { Suspense, type ComponentProps } from "react";
import { PageSkeleton } from "@/components/pcf/shared/page-skeleton";
import Link from "next/link";
import { ScrollText } from "lucide-react";

import { AuditDiffButton } from "@/components/pcf/audit/audit-diff-button";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/pcf/shared/empty-state";
import {
  ResponsiveList,
  type ResponsiveListColumn,
} from "@/components/pcf/shared/responsive-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  AUDIT_ENTITY_TYPES,
  buildAuditDiff,
  isAuditAction,
  isAuditEntityType,
  type AuditAction,
  type AuditEntityType,
} from "@/lib/pcf/audit";
import { requireUser } from "@/lib/pcf/auth";
import { formatDateTime } from "@/lib/pcf/dates";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type SearchParams = {
  entity?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
  page?: string;
};

type AuditRow = {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_name: string;
  created_at: string;
  diffTitle: string;
  diffRows: ReturnType<typeof buildAuditDiff>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function entityHref(entityType: string, entityId: string): string | null {
  if (entityType === "vouchers") return `/pcf/vouchers/${entityId}`;
  if (entityType === "replenishments") return `/pcf/replenishments/${entityId}`;
  return null;
}

function entityLabel(entityType: string) {
  return isAuditEntityType(entityType)
    ? AUDIT_ENTITY_LABELS[entityType]
    : entityType;
}

function actionLabel(action: string) {
  return isAuditAction(action) ? AUDIT_ACTION_LABELS[action] : action;
}

async function AuditPageContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser("/pcf/audit");
  const params: SearchParams = await searchParams;

  const entityParam = first(params.entity);
  const entity = isAuditEntityType(entityParam) ? entityParam : undefined;
  const actionParam = first(params.action);
  const action = isAuditAction(actionParam) ? actionParam : undefined;
  const actor = first(params.actor) ?? "";
  const fromRaw = first(params.from) ?? "";
  const toRaw = first(params.to) ?? "";
  const from = datePattern.test(fromRaw) ? fromRaw : "";
  const to = datePattern.test(toRaw) ? toRaw : "";
  const requestedPage = Number.parseInt(first(params.page) ?? "1", 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("audit_log")
    .select(
      "id, entity_type, entity_id, action, actor_id, old_data, new_data, created_at",
      { count: "exact" },
    );

  if (entity) query = query.eq("entity_type", entity);
  if (action) query = query.eq("action", action);
  if (actor) query = query.eq("actor_id", actor);
  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59`);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (error) throw new Error(error.message);

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .order("full_name");
  if (profilesError) throw new Error(profilesError.message);

  const profileNames = new Map(
    profiles.map((profile) => [profile.id, profile.full_name]),
  );

  const rows: AuditRow[] = data.map((entry) => ({
    id: entry.id,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    action: entry.action,
    actor_name: entry.actor_id
      ? (profileNames.get(entry.actor_id) ?? "—")
      : "System",
    created_at: entry.created_at,
    diffTitle: `${entityLabel(entry.entity_type)} · ${actionLabel(entry.action)}`,
    diffRows: buildAuditDiff(entry.old_data, entry.new_data),
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(entity || action || actor || from || to);

  function hrefWith(overrides: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    const merged = {
      entity,
      action,
      actor: actor || undefined,
      from: from || undefined,
      to: to || undefined,
      page: page > 1 ? String(page) : undefined,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const queryString = next.toString();
    return queryString ? `/pcf/audit?${queryString}` : "/pcf/audit";
  }

  const columns: ResponsiveListColumn<AuditRow>[] = [
    {
      key: "time",
      header: "Time",
      className: "whitespace-nowrap",
      cell: (row) => formatDateTime(row.created_at),
    },
    {
      key: "entity",
      header: "Entity",
      cell: (row) => {
        const href = entityHref(row.entity_type, row.entity_id);
        const label = `${entityLabel(row.entity_type)} · ${row.entity_id.slice(0, 8)}`;
        return href ? (
          <Link href={href} className="font-medium hover:underline">
            {label}
          </Link>
        ) : (
          label
        );
      },
    },
    {
      key: "action",
      header: "Action",
      cell: (row) => actionLabel(row.action),
    },
    { key: "actor", header: "Actor", cell: (row) => row.actor_name },
    {
      key: "details",
      header: "",
      headerClassName: "w-0",
      className: "text-right",
      cell: (row) => (
        <AuditDiffButton title={row.diffTitle} rows={row.diffRows} />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Every status change and financial action, in order."
      />

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <FilterChip
            href={hrefWith({ entity: undefined, page: undefined })}
            active={!entity}
            label="All entities"
          />
          {AUDIT_ENTITY_TYPES.map((value: AuditEntityType) => (
            <FilterChip
              key={value}
              href={hrefWith({ entity: value, page: undefined })}
              active={entity === value}
              label={AUDIT_ENTITY_LABELS[value]}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterChip
            href={hrefWith({ action: undefined, page: undefined })}
            active={!action}
            label="All actions"
          />
          {AUDIT_ACTIONS.map((value: AuditAction) => (
            <FilterChip
              key={value}
              href={hrefWith({ action: value, page: undefined })}
              active={action === value}
              label={AUDIT_ACTION_LABELS[value]}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterChip
            href={hrefWith({ actor: undefined, page: undefined })}
            active={!actor}
            label="All actors"
          />
          {profiles.map((profile) => (
            <FilterChip
              key={profile.id}
              href={hrefWith({ actor: profile.id, page: undefined })}
              active={actor === profile.id}
              label={profile.full_name ?? "—"}
            />
          ))}
        </div>

        <form
          method="get"
          action="/pcf/audit"
          className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end"
        >
          {entity ? <input type="hidden" name="entity" value={entity} /> : null}
          {action ? <input type="hidden" name="action" value={action} /> : null}
          {actor ? <input type="hidden" name="actor" value={actor} /> : null}
          <div className="space-y-1">
            <label htmlFor="audit-from" className="text-xs text-muted-foreground">
              From
            </label>
            <Input id="audit-from" type="date" name="from" defaultValue={from} />
          </div>
          <div className="space-y-1">
            <label htmlFor="audit-to" className="text-xs text-muted-foreground">
              To
            </label>
            <Input id="audit-to" type="date" name="to" defaultValue={to} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="outline">
              Filter
            </Button>
            {hasFilters ? (
              <Button variant="ghost" nativeButton={false} render={<Link href="/pcf/audit" />}>
                Clear
              </Button>
            ) : null}
          </div>
        </form>
      </div>

      <ResponsiveList
        rows={rows}
        columns={columns}
        getRowKey={(row) => String(row.id)}
        renderCard={(row) => (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{entityLabel(row.entity_type)}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {actionLabel(row.action)} by {row.actor_name}
                  </p>
                </div>
                <AuditDiffButton title={row.diffTitle} rows={row.diffRows} />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(row.created_at)}
              </p>
            </CardContent>
          </Card>
        )}
        empty={
          <EmptyState
            icon={ScrollText}
            title={hasFilters ? "No activity matches" : "No activity yet"}
            description={
              hasFilters
                ? "Try a different entity, action, actor, or date range."
                : "Audit entries will appear here as vouchers and replenishments move."
            }
          />
        }
      />

      {total > 0 ? (
        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              nativeButton={page <= 1}
              render={
                page <= 1 ? undefined : (
                  <Link href={hrefWith({ page: page - 1 > 1 ? String(page - 1) : undefined })} />
                )
              }
            >
              Previous
            </Button>
            <span className="tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              nativeButton={page >= totalPages}
              render={
                page >= totalPages ? undefined : (
                  <Link href={hrefWith({ page: String(page + 1) })} />
                )
              }
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </Link>
  );
}

// The page streams in behind a skeleton, like every MAD page (data is read per request).
export default function AuditPage(props: ComponentProps<typeof AuditPageContent>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AuditPageContent {...props} />
    </Suspense>
  );
}
