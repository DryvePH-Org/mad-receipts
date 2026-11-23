import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { requireModule, requireRole } from "@/lib/auth";
import { loadTidy } from "@/lib/cars/tidy-server";
import { TidyBoard } from "./tidy-board";

export default function TidyPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Tidy up the car details" description="Some cars were written in different ways (45T KMS, DSL, 19...). Here is each value that does not follow the standard format, with the fix. You approve; nothing changes by itself." actions={<Button variant="outline" nativeButton={false} render={<Link href="/cars" />}><ArrowLeft /> Back to Car Inventory</Button>} />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  await requireModule("cars");
  await requireRole("super_admin", "admin"); // the Admins change the details of a car
  const items = await loadTidy();
  return <TidyBoard items={items} />;
}
