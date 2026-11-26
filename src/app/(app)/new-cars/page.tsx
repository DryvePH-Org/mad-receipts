import { Suspense } from "react";
import Link from "next/link";
import { CarFront } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth";
import { loadAwaitingPrice } from "@/lib/cars/read";
import { PriceBoard } from "./price-board";

export default function NewCarsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="New cars to price" description="A car that was just added has no price yet. Set its price here: only then does it go into Car Inventory. Only the Super Admin and the Admins see this page." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  await requireModule("pricing");
  const cars = await loadAwaitingPrice();
  if (!cars.length) return <EmptyState icon={CarFront} title="Nothing is waiting for a price" description="Every car in stock has its price. A car added with Add a car shows up here until you price it." action={<Button variant="outline" nativeButton={false} render={<Link href="/cars" />}>Open Car Inventory</Button>} />;
  return <PriceBoard cars={cars} />;
}
