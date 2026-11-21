import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { daysBetween, formatDate, manilaToday } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { carsOut } from "@/lib/transfers/handoff";

export default function HandoffPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  await requireModule("documents");
  const [{ print }, rows] = [await getSettings(), await carsOut()];
  const admin = createAdminClient();
  const { data: folders } = rows.length ? await admin.from("unit_folders").select("plate_no, plate_display, folder_name").in("plate_no", rows.map((r) => r.plate)) : { data: [] };
  const nameOf = new Map((folders ?? []).map((f) => [f.plate_no, f]));
  const today = manilaToday();
  const days = (iso: string) => Math.max(0, daysBetween(iso.slice(0, 10), today));
  return (
    <>
      <PageHeader title={`Documents with ${print.transmittalReceiver || "the receiver"}`} description="Sold cars whose papers were handed off and have not come back. Open a car to mark them as back at MAD, and then to release and deliver them. A reminder goes to Telegram every 3 days while they are out." />
      {!rows.length ? <p className="text-sm text-muted-foreground">Nothing is out on handoff.</p> : (
        <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
          {rows.map((r) => (
            <li key={r.transferId} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <Link href={`/documents/${r.plate}`} className="font-medium underline-offset-2 hover:underline">{nameOf.get(r.plate)?.folder_name ?? nameOf.get(r.plate)?.plate_display ?? r.plate}</Link>
              <span className="text-muted-foreground">handed off {formatDate(r.handedOffAt!.slice(0, 10))}{r.note ? ` · ${r.note}` : ""}</span>
              <span className="ml-auto font-medium">{days(r.handedOffAt!)} {days(r.handedOffAt!) === 1 ? "day" : "days"}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
