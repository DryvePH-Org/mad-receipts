import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { loadTransmittal } from "@/lib/docs/transmittal-server";
import { TransmittalEditor } from "./transmittal-editor";

export default function TransmittalPage({ params }: PageProps<"/documents/[plate]/transmittal">) {
  return <Suspense fallback={<PageSkeleton />}><Content params={params} /></Suspense>;
}

async function Content({ params }: { params: PageProps<"/documents/[plate]/transmittal">["params"] }) {
  const user = await requireModule("documents");
  const { plate } = await params;
  const t = await loadTransmittal(plate, user.fullName ?? user.email);
  if (!t) notFound();
  return (
    <div className="space-y-6">
      <PageHeader title="Transmittal receipt" description={`Plate ${t.plateDisplay}. The papers and items handed over with the car. Filled in from the car's documents; change anything that is not right, then print.`} />
      <TransmittalEditor plate={plate} initial={t.saved ?? t.prefill} suggestion={t.prefill} saved={!!t.saved} />
    </div>
  );
}
