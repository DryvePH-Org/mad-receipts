import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { daysBetween, formatDate, manilaToday } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";

export default function HandoffPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  await requireModule("documents");
  const [{ print }, admin] = [await getSettings(), createAdminClient()];
  const { data: rows } = await admin.from("unit_workflow").select("plate_no, handoff_at, handoff_note").not("handoff_at", "is", null).is("handoff_returned_at", null).order("handoff_at").limit(500);
  const { data: folders } = rows?.length ? await admin.from("unit_folders").select("plate_no, plate_display, folder_name").in("plate_no", rows.map((r) => r.plate_no)) : { data: [] };
  const nameOf = new Map((folders ?? []).map((f) => [f.plate_no, f]));
  const today = manilaToday();
  const days = (iso: string) => Math.max(0, daysBetween(iso.slice(0, 10), today));
  return (
    <>
      <PageHeader title={`Documents with ${print.transmittalReceiver || "the receiver"}`} description="Sold cars whose papers were handed off and have not come back. Open a car to mark it as done. A reminder goes out on Telegram every 3 days." />
      {!rows?.length ? <p className="text-sm text-muted-foreground">Nothing is out on handoff.</p> : (
        <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
          {rows.map((r) => (
            <li key={r.plate_no} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <Link href={`/documents/${r.plate_no}`} className="font-medium underline-offset-2 hover:underline">{nameOf.get(r.plate_no)?.folder_name ?? nameOf.get(r.plate_no)?.plate_display ?? r.plate_no}</Link>
              <span className="text-muted-foreground">handed off {formatDate(r.handoff_at!.slice(0, 10))}{r.handoff_note ? ` · ${r.handoff_note}` : ""}</span>
              <span className="ml-auto font-medium">{days(r.handoff_at!)} {days(r.handoff_at!) === 1 ? "day" : "days"}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
