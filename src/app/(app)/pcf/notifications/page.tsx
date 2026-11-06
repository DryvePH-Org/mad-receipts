import { Suspense } from "react";
import { PageSkeleton } from "@/components/pcf/shared/page-skeleton";
import { Bell } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/pcf/shared/empty-state";
import {
  ResponsiveList,
  type ResponsiveListColumn,
} from "@/components/pcf/shared/responsive-list";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/pcf/auth";
import { emailEnabled } from "@/lib/pcf/email";
import { formatDateTime } from "@/lib/pcf/dates";
import { createClient } from "@/lib/supabase/server";

const LIMIT = 100;

type LogRow = {
  id: number;
  event: string;
  recipient_email: string;
  subject: string;
  status: string;
  error: string | null;
  created_at: string;
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "failed" ? "destructive" : "secondary"}>
      {status === "sent" ? "Sent" : status === "failed" ? "Failed" : "Skipped"}
    </Badge>
  );
}

async function AdminNotificationsPageContent() {
  await requireUser("/pcf/notifications");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notification_log")
    .select("id, event, recipient_email, subject, status, error, created_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(error.message);

  const rows: LogRow[] = data;
  const failed = rows.filter((row) => row.status === "failed").length;

  const columns: ResponsiveListColumn<LogRow>[] = [
    {
      key: "time",
      header: "Time",
      className: "whitespace-nowrap",
      cell: (row) => formatDateTime(row.created_at),
    },
    { key: "event", header: "Event", cell: (row) => row.event },
    { key: "to", header: "To", cell: (row) => row.recipient_email },
    {
      key: "subject",
      header: "Subject",
      cell: (row) => (
        <span className="block max-w-80 truncate" title={row.subject}>
          {row.subject}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <div className="space-y-1">
          <StatusBadge status={row.status} />
          {row.error ? (
            <p className="max-w-64 truncate text-xs text-destructive" title={row.error}>
              {row.error}
            </p>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={
          emailEnabled()
            ? `The last ${LIMIT} emails the app tried to send${failed ? ` — ${failed} failed` : ""}.`
            : "Email is off (no RESEND_API_KEY), so PCF sends no emails. Earlier attempts, if any, are listed below."
        }
      />
      <ResponsiveList
        rows={rows}
        columns={columns}
        getRowKey={(row) => String(row.id)}
        renderCard={(row) => (
          <Card>
            <CardContent className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium">{row.subject}</p>
                <StatusBadge status={row.status} />
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {row.event} · {row.recipient_email}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(row.created_at)}
              </p>
              {row.error ? (
                <p className="text-xs text-destructive">{row.error}</p>
              ) : null}
            </CardContent>
          </Card>
        )}
        empty={
          <EmptyState
            icon={Bell}
            title="No emails yet"
            description="Notifications appear here as vouchers and replenishments move."
          />
        }
      />
    </div>
  );
}

// The page streams in behind a skeleton, like every MAD page (data is read per request).
export default function AdminNotificationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminNotificationsPageContent />
    </Suspense>
  );
}
