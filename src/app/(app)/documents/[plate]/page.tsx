import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { loadSheetStatus, loadWorking, previewBibleFast } from "@/lib/docs/bible-sync";
import { toSheetPreview } from "@/lib/docs/bible-view";
import { isScanning, readerMode } from "@/lib/docs/bot-scan";
import { readingNotes, reviewedOf, rotationOf, detectionsOf, wasEdited } from "@/lib/docs/car";
import { getCarDetail } from "@/lib/docs/data";
import { cleanDetails, missingDetails } from "@/lib/docs/details";
import { previewPricelistFast } from "@/lib/docs/pricelist-sync";
import { deriveStage } from "@/lib/docs/stage";
import { loadStageInput } from "@/lib/docs/stage-server";
import { loadWorkflow } from "@/lib/docs/workflow";
import { sheetsFrozen } from "@/lib/google/freeze";
import { grokbotMissing } from "@/lib/grokbot/client";
import { workLabel } from "@/lib/grokbot/labels";
import { workForPlate } from "@/lib/grokbot/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { AboutCard } from "./about-card";
import { ApprovalCard } from "./approval-card";
import { CarLive } from "./car-live";
import { CarTop } from "./car-top";
import { ChecklistCard } from "./checklist-card";
import { ChecksHelp } from "./checks-help";
import { FilesCard } from "./files-card";
import { HandoffCard } from "./handoff-card";
import { SheetCard } from "./sheet-card";
import { SoldCard } from "./sold-card";
import { StageCard } from "./stage-card";
import type { CarViewData } from "./types";

export default function CarPage({ params }: PageProps<"/documents/[plate]">) {
  return <Suspense fallback={<PageSkeleton />}><Content params={params} /></Suspense>;
}

const EMPTY_WORKFLOW = { scanNotifiedAt: null, soldReadyNotifiedAt: null, approvedAt: null, marketingNotifiedAt: null, handoffAt: null, handoffNote: null, handoffChecked: [] as string[], handoffReturnedAt: null };

async function Content({ params }: { params: PageProps<"/documents/[plate]">["params"] }) {
  const user = await requireModule("documents");
  const { plate } = await params;
  const detail = await getCarDetail(plate);
  if (!detail) notFound();
  const { car, deal } = detail;
  const key = car.folder.plate_no;
  const admin = createAdminClient();

  const [flow, settings, botWork, scanning, input] = await Promise.all([
    loadWorkflow(key).catch(() => ({ workflow: EMPTY_WORKFLOW, details: cleanDetails({}), detailsSaved: false })),
    getSettings(), workForPlate(key).catch(() => []), isScanning(key).catch(() => false), loadStageInput(key, admin).catch(() => null),
  ]);
  const linked = car.folder.match_status === "linked" && !!car.folder.folder_id;
  const stage = deriveStage(input ?? { linked, location: car.folder.location as "available" | "sold", filesTotal: car.files.length, pending: car.pending, failed: 0, scanning, flaggedFiles: 0, missingBefore: 0, missingSold: 0, hasDeal: !!deal, approved: !!flow.workflow.approvedAt, caseChosen: car.folder.case_source === "manual", handoffAt: flow.workflow.handoffAt, returnedAt: flow.workflow.handoffReturnedAt, receiver: settings.print.transmittalReceiver || "the receiver" });
  const [pricelist, sheetStatuses, sheetPreview, sheetWorking] = await Promise.all([
    linked ? previewPricelistFast(key, admin).catch(() => null) : null,
    linked ? loadSheetStatus(key).catch(() => []) : [],
    linked ? previewBibleFast(key).then(toSheetPreview).catch(() => null) : null,
    linked ? loadWorking(key).catch(() => null) : null,
  ]);

  const recipient = settings.print.transmittalReceiver || "the receiver";
  const items = car.checklist.items.map((i) => ({ key: i.key, label: i.label, stage: i.stage, present: i.present, fileIds: i.fileIds }));
  const data: CarViewData = {
    plate: key, plateDisplay: car.folder.plate_display, name: car.folder.folder_name ?? car.folder.plate_display, location: car.folder.location as "available" | "sold",
    match: car.folder.match_status as "linked" | "none" | "several", folderUrl: car.folder.folder_url, candidates: (car.folder.candidates ?? []) as unknown as { id: string; name: string; url: string; root: string }[],
    caseType: car.caseType, suggestedCase: car.suggestedCase, caseReason: car.caseReason, caseSource: car.folder.case_source as "auto" | "manual",
    deal: deal ? { id: deal.id, dealNo: deal.dealNo, buyerName: deal.buyerName, hasReceipt: deal.hasReceipt } : null,
    items,
    files: car.files.map((f) => {
      const r = car.analysis.files.find((x) => x.id === f.id);
      return {
        id: f.id, rotation: rotationOf(f.details), name: f.filename, url: f.drive_url, source: f.source, readStatus: f.read_status, readError: f.read_error, types: f.doc_types, manual: f.doc_types_source === "manual", edited: wasEdited(f.details), reviewed: reviewedOf(f.details),
        flags: f.flags, duplicateOf: r?.duplicateOf ? car.files.find((x) => x.id === r.duplicateOf)?.filename ?? null : null, confidence: f.confidence,
        seen: { detections: detectionsOf(f.details) ?? [], notes: readingNotes(f.details).notes },
      };
    }),
    botMode: readerMode() === "grokbot", scanning,
    botWork: botWork.map((w) => ({ label: workLabel(w.action, w.status, w.position), waiting: w.status === "queued" })),
    scanned: !!car.folder.scanned_at, pending: car.pending, failed: car.files.filter((f) => f.read_status === "failed").length, statusLabel: car.status.label, statusKey: car.status.key,
    isAdmin: user.role === "admin",
  };

  // what is still open when a car is moved to Sold, listed in the confirmation
  const flagged = car.analysis.files.filter((r) => r.flags.length || r.types.some((t) => t === "id_unmatched" || t === "deed_unmatched")).length;
  const openItems = [...items.filter((i) => !i.present).map((i) => i.label), ...(car.pending ? [`${car.pending} photo${car.pending === 1 ? "" : "s"} not read yet`] : []), ...(flagged ? [`${flagged} file${flagged === 1 ? "" : "s"} still to check`] : [])];
  const soldItems = items.filter((i) => i.stage === "sold").map((i) => ({ key: i.key, label: i.label, present: i.present }));
  const busy = scanning || data.botWork.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={data.name} description={`Plate ${data.plateDisplay}`} />
      <CarLive plate={key} linked={linked} scanned={data.scanned} busy={busy} />
      <CarTop data={data} />
      {linked && <StageCard stage={stage} />}
      {linked && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
          <div className="space-y-6">
            <FilesCard data={data} rules={stage.rules} />
            <ChecklistCard data={data} />
            <AboutCard plate={key} details={flow.details} missing={missingDetails(flow.details)} />
            <ChecksHelp />
          </div>
          <aside className="space-y-6">
            <ApprovalCard plate={key} approvedAt={flow.workflow.approvedAt} marketingNotifiedAt={flow.workflow.marketingNotifiedAt} rule={stage.rules.approve} />
            <SheetCard data={{ plate: key, frozen: sheetsFrozen("docs"), configured: grokbotMissing().length === 0 && !!process.env.DOCS_BIBLE_SHEET_ID, statuses: sheetStatuses, preview: sheetPreview, working: sheetWorking, pricelist, sendRule: stage.rules.sendSheet }} />
            <SoldCard plate={key} location={data.location} items={soldItems} rule={stage.rules.moveToSold} isAdmin={data.isAdmin} openItems={openItems} />
            <HandoffCard rules={stage.rules} data={{ plate: key, location: data.location, recipient, at: flow.workflow.handoffAt, note: flow.workflow.handoffNote, checked: flow.workflow.handoffChecked, returnedAt: flow.workflow.handoffReturnedAt, items: items.map((i) => ({ key: i.key, label: i.label, present: i.present })) }} />
          </aside>
        </div>
      )}
    </div>
  );
}
