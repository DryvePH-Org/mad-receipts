import { Suspense } from "react";
import Link from "next/link";
import { AdminNav } from "@/components/admin-nav";
import { Badge } from "@/components/ui/badge";
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
  confirm: "receipt confirmed",
  void: "receipt voided",
  cancel: "deal cancelled",
  edit: "details edited",
};
const STATUS_VARIANT = { pending: "secondary", failed: "destructive", done: "default" } as const;
const MAX_ATTEMPTS = 5;

export default function SyncPage({ searchParams }: PageProps<"/admin/sync">) {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Sync jobs</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
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

  return (
    <>
      <AdminNav />
      <p className="text-sm text-muted-foreground">
        After a receipt is confirmed, voided or a deal changes, the app updates Drive, the log sheet, Telegram and the
        inventory sheet. Jobs that fail are retried automatically, up to {MAX_ATTEMPTS} times. You can retry one here.
      </p>

      <div className="flex gap-3">
        <form action={runSyncNow} className="flex-1">
          <Button type="submit" className="h-12 w-full text-base">
            Run due jobs now
          </Button>
        </form>
        <Button
          render={<Link href={showAll ? "/admin/sync" : "/admin/sync?show=all"} />}
          nativeButton={false}
          variant="outline"
          className="h-12"
        >
          {showAll ? "Hide finished" : "Show finished"}
        </Button>
      </div>

      {jobs.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-muted-foreground">
          {showAll ? "No sync jobs yet." : "Nothing is waiting or failed. Everything is up to date."}
        </p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li key={job.id} className="space-y-2 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{TARGET_LABEL[job.target] ?? job.target}</p>
                  <p className="text-sm text-muted-foreground">
                    No. {job.receipts?.receipt_no ?? "?"} · {EVENT_LABEL[job.event] ?? job.event}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[job.status as keyof typeof STATUS_VARIANT] ?? "outline"}>{job.status}</Badge>
              </div>
              {job.last_error && <p className="rounded-md bg-muted p-2 text-sm break-words">{job.last_error}</p>}
              <p className="text-xs text-muted-foreground">
                {job.attempts} {job.attempts === 1 ? "attempt" : "attempts"}
                {job.status !== "done" && job.attempts < MAX_ATTEMPTS && ` · next try ${formatManilaDateTime(job.next_run_at)}`}
                {job.status !== "done" && job.attempts >= MAX_ATTEMPTS && " · gave up, retry it to try again"}
              </p>
              {job.status !== "done" && (
                <form action={retrySyncJob}>
                  <input type="hidden" name="id" value={job.id} />
                  <Button type="submit" variant="outline" className="h-11">
                    Retry now
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
