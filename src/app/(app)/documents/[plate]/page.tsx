import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireRole } from "@/lib/auth";
import { getCarDetail } from "@/lib/docs/data";
import { CarView, type CarViewData } from "./car-view";

export default function CarPage({ params }: PageProps<"/documents/[plate]">) {
  return <Suspense fallback={<PageSkeleton />}><Content params={params} /></Suspense>;
}

async function Content({ params }: { params: PageProps<"/documents/[plate]">["params"] }) {
  await requireRole("admin", "documentation");
  const { plate } = await params;
  const detail = await getCarDetail(plate);
  if (!detail) notFound();
  const { car, deal } = detail;
  const data: CarViewData = {
    plate: car.folder.plate_no, plateDisplay: car.folder.plate_display, name: car.folder.folder_name ?? car.folder.plate_display, location: car.folder.location as "available" | "sold",
    match: car.folder.match_status as "linked" | "none" | "several", folderUrl: car.folder.folder_url, candidates: (car.folder.candidates ?? []) as unknown as { id: string; name: string; url: string; root: string }[],
    caseType: car.caseType, suggestedCase: car.suggestedCase, caseSource: car.folder.case_source as "auto" | "manual",
    deal: deal ? { id: deal.id, dealNo: deal.dealNo, buyerName: deal.buyerName, hasReceipt: deal.hasReceipt } : null,
    items: car.checklist.items.map((i) => ({ key: i.key, label: i.label, stage: i.stage, present: i.present, fileIds: i.fileIds })),
    files: car.files.map((f) => {
      const r = car.analysis.files.find((x) => x.id === f.id);
      return { id: f.id, name: f.filename, url: f.drive_url, source: f.source, readStatus: f.read_status, readError: f.read_error, types: f.doc_types, manual: f.doc_types_source === "manual", flags: f.flags, duplicateOf: r?.duplicateOf ? car.files.find((x) => x.id === r.duplicateOf)?.filename ?? null : null, confidence: f.confidence };
    }),
    scanned: !!car.folder.scanned_at, pending: car.pending, failed: car.files.filter((f) => f.read_status === "failed").length, statusLabel: car.status.label, statusKey: car.status.key,
  };
  return (
    <div className="space-y-6">
      <PageHeader title={data.name} description={`Plate ${data.plateDisplay}`} />
      <CarView data={data} />
    </div>
  );
}
