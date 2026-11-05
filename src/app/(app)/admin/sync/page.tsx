import { Suspense } from "react";
import Link from "next/link";
import { CircleCheck, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { ResponsiveList } from "@/components/shared/responsive-list";
import { SyncStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { formatManilaDateTime } from "@/lib/dates";
import { param } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { retrySyncJob, runSyncNow } from "./actions";

const TARGET_LABEL: Record<string, string> = {
  drive: "Google Drive",
  sheets: "Google Sheets",
  telegram: "Telegram",
  inventory: "Inventory sheet",
};
const EVENT_LABEL: Record<string, string> = {
  confirm: "receipt approved",
  void: "receipt voided",
  cancel: "deal cancelled",
  edit: "deal changed (loan released)",
};
const MAX_ATTEMPTS = 5;

export default function SyncPage({ searchParams }: PageProps<"/admin/sync">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageSkeleton />}>
        <SyncContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SyncContent({ searchParams }: { searchParams: PageProps<"/admin/sync">["searchParams"] }) {
  await requireAdmin();
  const showAll = param((await searchParams).show) === "all";

  const supabase = await createClient();
  let query = supabase
    .from("sync_jobs")
    .select("id, target, event, status, attempts, last_error, next_run_at, updated_at, receipts(receipt_no)")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (!showAll) query = query.neq("status", "done");
  const { data: jobs, error } = await query;
  if (error) return <p className="text-destructive">Could not load the sync jobs. Please try again.</p>;

  const progress = (job: (typeof jobs)[number]) =>
    `${job.attempts} ${job.attempts === 1 ? "attempt" : "attempts"}${
      job.status !== "done" && job.attempts < MAX_ATTEMPTS ? ` · next try ${formatManilaDateTime(job.next_run_at)}` : ""
    }${job.status !== "done" && job.attempts >= MAX_ATTEMPTS ? " · gave up, retry it to try again" : ""}`;

  const retry = (job: (typeof jobs)[number]) =>
    job.status !== "done" ? (
      <form action={retrySyncJob}>
        <input type="hidden" name="id" value={job.id} />
        <Button type="submit" variant="outline" size="sm">
          Retry now
        </Button>
      </form>
    ) : null;

  return (
    <>
      <PageHeader
        title="Sync jobs"
        description={`After a receipt is confirmed, voided or a deal changes, the app updates Drive, the log sheet, Telegram and the inventory sheet. Jobs that fail are retried automatically, up to ${MAX_ATTEMPTS} times.`}
        actions={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href={showAll ? "/admin/sync" : "/admin/sync?show=all"} />}>
              {showAll ? "Hide finished" : "Show finished"}
            </Button>
            <form action={runSyncNow}>
              <Button type="submit">
                <RefreshCw /> Run due jobs now
              </Button>
            </form>
          </>
        }
      />

      <ResponsiveList
        rows={jobs}
        getRowKey={(j) => j.id}
        empty={
          <EmptyState
            icon={CircleCheck}
            title={showAll ? "No sync jobs yet" : "Everything is up to date"}
            description={showAll ? "Jobs appear after the first receipt is confirmed." : "Nothing is waiting or failed."}
          />
        }
        columns={[
          { key: "target", header: "Service", cell: (j) => TARGET_LABEL[j.target] ?? j.target },
          { key: "receipt", header: "For", cell: (j) => `No. ${j.receipts?.receipt_no ?? "?"} · ${EVENT_LABEL[j.event] ?? j.event}` },
          { key: "status", header: "Status", cell: (j) => <SyncStatusBadge status={j.status} /> },
          {
            key: "info",
            header: "Details",
            className: "max-w-sm whitespace-normal",
            cell: (j) => (
              <span className="block space-y-1">
                {j.last_error && <span className="block text-sm break-words">{j.last_error}</span>}
                <span className="block text-xs text-muted-foreground">{progress(j)}</span>
              </span>
            ),
          },
          { key: "retry", header: "", className: "text-right", cell: (j) => retry(j) },
        ]}
        renderCard={(j) => (
          <div className="space-y-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{TARGET_LABEL[j.target] ?? j.target}</p>
                <p className="text-sm text-muted-foreground">
                  No. {j.receipts?.receipt_no ?? "?"} · {EVENT_LABEL[j.event] ?? j.event}
                </p>
              </div>
              <SyncStatusBadge status={j.status} />
            </div>
            {j.last_error && <p className="rounded-md bg-muted p-2 text-sm break-words">{j.last_error}</p>}
            <p className="text-xs text-muted-foreground">{progress(j)}</p>
            {retry(j)}
          </div>
        )}
      />
    </>
  );
}
