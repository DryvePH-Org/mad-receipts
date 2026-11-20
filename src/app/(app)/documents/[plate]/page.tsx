import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { isScanning, readerMode } from "@/lib/docs/bot-scan";
import { readingNotes, reviewedOf, rotationOf, detectionsOf, wasEdited } from "@/lib/docs/car";
import { getCarDetail } from "@/lib/docs/data";
import { cleanDetails, missingDetails } from "@/lib/docs/details";
import { deriveStage } from "@/lib/docs/stage";
import { loadStageInput } from "@/lib/docs/stage-server";
import { loadWorkflow } from "@/lib/docs/workflow";
import { workLabel } from "@/lib/grokbot/labels";
import { workForPlate } from "@/lib/grokbot/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRegisterRow } from "@/lib/docsbible/grid-server";
import { registerDiff } from "@/lib/docsbible/sync";
import { AboutCard } from "./about-card";
import { ApprovalCard } from "./approval-card";
import { CarLive } from "./car-live";
import { CarTop } from "./car-top";
import { ChecksHelp } from "./checks-help";
import { parseSheetDate } from "@/lib/cars/model";
import { manilaToday } from "@/lib/dates";
import { orStatus } from "@/lib/docsbible/or-expiry";
import { docsDb } from "@/lib/docsbible/review-server";
import { PapersCard } from "./files-card";
import { HandoffCard } from "./handoff-card";
import { loadTransfers } from "@/lib/transfers/server";
import { TransferList } from "../transfers/transfer-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listCarReceipts } from "@/lib/docs/receipts-drive";
import { ReceiptsCard } from "./receipts-card";
import { SoldUploadCard } from "./sold-upload-card";
import { RegisterCard } from "./register-card";
import { RemoveCarCard } from "./remove-car-card";
import { SoldCard } from "./sold-card";
import { StageCard } from "./stage-card";
import type { CarViewData } from "./types";

export default function CarPage({ params }: PageProps<"/documents/[plate]">) {
  return <Suspense fallback={<PageSkeleton />}><Content params={params} /></Suspense>;
}

const EMPTY_WORKFLOW = { scanNotifiedAt: null, soldReadyNotifiedAt: null, approvedAt: null, approvedByName: null as string | null, marketingNotifiedAt: null, handoffAt: null, handoffNote: null, handoffChecked: [] as string[], handoffReturnedAt: null };

async function Content({ params }: { params: PageProps<"/documents/[plate]">["params"] }) {
  const user = await requireModule("register");
  const canAct = user.modules.includes("documents");
  const canUpload = canAct || user.modules.includes("upload"); // Sales add the sold papers here; they have no other button
  const { plate } = await params;
  const detail = await getCarDetail(plate);
  if (!detail) return <RegisterOnly plate={plate} role={user.role} canAct={canAct} />;
  const { car, deal } = detail;
  const key = car.folder.plate_no;
  const admin = createAdminClient();

  const [flow, settings, botWork, scanning, input, lastScanRow] = await Promise.all([
    loadWorkflow(key).catch(() => ({ workflow: EMPTY_WORKFLOW, details: cleanDetails({}), detailsSaved: false })),
    getSettings(), workForPlate(key).catch(() => []), isScanning(key).catch(() => false), loadStageInput(key, admin).catch(() => null),
    admin.from("grokbot_jobs").select("status, created_at, completed_at, request, error").eq("plate_no", key).eq("action", "docs_scan").in("status", ["done", "failed"]).order("created_at", { ascending: false }).limit(1).maybeSingle().then((r) => r.data, () => null),
  ]);
  const linked = car.folder.match_status === "linked" && !!car.folder.folder_id;
  const stage = deriveStage(input ?? { linked, location: car.folder.location as "available" | "sold", filesTotal: car.files.length, pending: car.pending, failed: 0, scanning, flaggedFiles: 0, missingBefore: 0, missingSold: 0, hasDeal: !!deal, approved: !!flow.workflow.approvedAt, caseChosen: car.folder.case_source === "manual", handoffAt: flow.workflow.handoffAt, returnedAt: flow.workflow.handoffReturnedAt, receiver: settings.print.transmittalReceiver || "the receiver" });
  const orRow = await docsDb().from("docs_units_current").select("renewal").eq("plate_no", key).maybeSingle();
  const orDate = orRow.data?.renewal ? parseSheetDate(String(orRow.data.renewal)) : null; // the typed date, read the same way the database reads it
  const transfers = user.role === "admin" || user.role === "approver" || user.role === "documentation" ? await loadTransfers(key) : null;
  const [register, receipts] = await Promise.all([loadRegisterRow(key).catch(() => null), canAct ? listCarReceipts(key).catch(() => []) : Promise.resolve([])]);

  const recipient = settings.print.transmittalReceiver || "the receiver";
  const items = car.checklist.items.map((i) => ({ key: i.key, label: i.label, stage: i.stage, present: i.present, fileIds: i.fileIds, optional: !!i.optional }));
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
    botMode: readerMode() === "grokbot", scanning, orExpiry: orDate, orState: orStatus(orDate, manilaToday()),
    lastScan: lastScanRow ? { at: lastScanRow.completed_at ?? lastScanRow.created_at, seconds: lastScanRow.completed_at ? Math.round((Date.parse(lastScanRow.completed_at) - Date.parse(lastScanRow.created_at)) / 1000) : null, photos: Array.isArray((lastScanRow.request as { files?: unknown[] } | null)?.files) ? ((lastScanRow.request as { files: unknown[] }).files.length) : 0, ok: lastScanRow.status === "done", error: lastScanRow.error } : null,
    botWork: botWork.map((w) => ({ label: workLabel(w.action, w.status, w.position), waiting: w.status === "queued" })),
    scanned: !!car.folder.scanned_at, pending: car.pending, failed: car.files.filter((f) => f.read_status === "failed").length, statusLabel: car.status.label, statusKey: car.status.key,
    isAdmin: user.role === "admin",
  };

  // what is still open when a car is moved to Sold, listed in the confirmation
  const flagged = car.analysis.files.filter((r) => r.flags.length || r.types.some((t) => t === "id_unmatched" || t === "deed_unmatched")).length;
  const openItems = [...items.filter((i) => !i.present && !i.optional).map((i) => i.label), ...(car.pending ? [`${car.pending} photo${car.pending === 1 ? "" : "s"} not read yet`] : []), ...(flagged ? [`${flagged} file${flagged === 1 ? "" : "s"} still to check`] : [])];
  const soldItems = items.filter((i) => i.stage === "sold").map((i) => ({ key: i.key, label: i.label, present: i.present }));
  // the app's own printout of the AR (unsigned) saved in the folder: shown beside the signed paper, for Documentation (it does not hold up the car)
  const arCopy = receipts.length ? [{ key: "ar_copy", label: "AR copy from the app, saved in the folder (UNSIGNED)", present: receipts.every((r) => r.filed), optional: true }] : [];
  const busy = scanning || data.botWork.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={data.name} description={`Plate ${data.plateDisplay}`} />
      <CarLive plate={key} linked={linked} scanned={data.scanned} busy={busy} canSync={canAct} />
      <CarTop data={data} readOnly={!canAct} />
      {!linked && data.isAdmin && <RemoveCarCard plate={key} name={data.name} />}
      {linked && <StageCard stage={stage} />}
      {linked && (
        <>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
          {/* On a phone the steps to take come right after the papers, and the reference cards (About, Car record, what the scan checks) after them; on a wide screen the steps sit in the right column */}
            <div className="xl:col-start-1"><PapersCard data={data} rules={stage.rules} readOnly={!canAct} confirmEdits={data.isAdmin && data.location === "sold"} register={register ? { id: register.id, values: register.values } : null} canEditRegister={canAct} differs={register && car.folder.case_source === "manual" ? registerDiff(car, register.values) : null} /></div>
          <aside className="space-y-6 xl:col-start-2 xl:row-span-4 xl:row-start-1">
            {canAct && <ApprovalCard isAdmin={data.isAdmin} plate={key} approvedAt={flow.workflow.approvedAt} approvedBy={flow.workflow.approvedByName} marketingNotifiedAt={flow.workflow.marketingNotifiedAt} rule={stage.rules.approve} />}
            {canUpload && <SoldUploadCard plate={key} items={soldItems} deal={data.deal ? { dealNo: data.deal.dealNo, buyerName: data.deal.buyerName } : null} />}
            {canAct && receipts.length > 0 && <ReceiptsCard plate={key} receipts={receipts} />}
            {canAct && <SoldCard plate={key} location={data.location} items={[...arCopy.map(({ key: k, label, present }) => ({ key: k, label, present })), ...soldItems]} rule={stage.rules.moveToSold} isAdmin={data.isAdmin} openItems={openItems} />}
            {canAct && <HandoffCard isAdmin={data.isAdmin} rules={stage.rules} data={{ plate: key, location: data.location, recipient, at: flow.workflow.handoffAt, note: flow.workflow.handoffNote, checked: flow.workflow.handoffChecked, returnedAt: flow.workflow.handoffReturnedAt, items: [...items, ...arCopy].map((i) => ({ key: i.key, label: i.label, present: i.present, optional: i.optional })) }} />}
            {transfers && <Card id="transfer"><CardHeader><CardTitle>Transfer to the buyer</CardTitle></CardHeader><CardContent><TransferList transfers={transfers.transfers} cars={Object.fromEntries(transfers.cars)} today={manilaToday()} plate={key} showCar={false} /></CardContent></Card>}
          </aside>
            <div className="xl:col-start-1"><AboutCard plate={key} details={flow.details} missing={missingDetails(flow.details)} readOnly={!canAct} confirmEdits={data.isAdmin && data.location === "sold"} /></div>
            <div className="xl:col-start-1"><RegisterCard plate={key} row={register} role={user.role} canAct={canAct} confirmEdits={data.isAdmin && data.location === "sold"} /></div>
            {canAct && <div className="xl:col-start-1"><ChecksHelp /></div>}
        </div>
        {data.isAdmin && <RemoveCarCard plate={key} name={data.name} />}
        </>
      )}
    </div>
  );
}

/** A car that is in MAD register but has no folder in Car documents yet: its row, and the way to find its folder. */
async function RegisterOnly({ plate, role, canAct }: { plate: string; role: "sales" | "admin" | "approver" | "documentation"; canAct: boolean }) {
  const key = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const register = await loadRegisterRow(key).catch(() => null);
  if (!register) notFound();
  const data: CarViewData = {
    plate: key, plateDisplay: register.values.plate_display ?? key, name: [register.values.year_model, register.values.make, register.values.model_variant].filter(Boolean).join(" ") || key, location: "available", match: "none", folderUrl: null, candidates: [],
    caseType: "clean", suggestedCase: "clean", caseReason: "", caseSource: "auto", deal: null, items: [], files: [], botMode: false, scanning: false, lastScan: null, botWork: [], orExpiry: null, orState: { state: "unknown", days: null }, scanned: false, pending: 0, failed: 0, statusLabel: "No folder", statusKey: "unlinked", isAdmin: role === "admin",
  };
  return (
    <div className="space-y-6">
      <PageHeader title={data.name} description={`Plate ${data.plateDisplay}`} />
      <CarTop data={data} readOnly={!canAct} />
      <RegisterCard plate={key} row={register} role={role} canAct={false} />
      {data.isAdmin && <RemoveCarCard plate={key} name={data.name} />}
    </div>
  );
}
