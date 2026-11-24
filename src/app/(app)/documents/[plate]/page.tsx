import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { PRIVATE_DOCS } from "@/lib/docs/types";
import { archiveTotal, PAYMENT_LABEL, type ArchiveFile } from "@/lib/docs/payments";
import { PaymentsPanel } from "./payments-card";
import { ActivityList } from "./activity-list";
import { loadCarActivity } from "@/lib/docs/activity";
import type { ActivityEntry } from "@/lib/docs/activity-text";
import { isAdmin, seesPrivateDocs, seesSales, type Role } from "@/lib/roles";
import { getSettings } from "@/lib/data";
import { isScanning, readerMode } from "@/lib/docs/bot-scan";
import { readingNotes, reviewedOf, rotationOf, detectionsOf, wasEdited } from "@/lib/docs/car";
import { getCarDetail } from "@/lib/docs/data";
import { cleanDetails, missingDetails } from "@/lib/docs/details";
import { deriveStage } from "@/lib/docs/stage";
import { loadStageInput } from "@/lib/docs/stage-server";
import { loadWorkflow } from "@/lib/docs/workflow";
import { handoffOf } from "@/lib/transfers/handoff";
import { workLabel } from "@/lib/grokbot/labels";
import { workForPlate } from "@/lib/grokbot/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadRegisterRow } from "@/lib/docsbible/grid-server";
import { registerDiff } from "@/lib/docsbible/sync";
import { AboutCard } from "./about-card";
import { ApprovalCard } from "./approval-card";
import { CarLive } from "./car-live";
import { CarTop, FolderBox } from "./car-top";
import { ChecksHelp } from "./checks-help";
import { manilaToday } from "@/lib/dates";
import { orStatus } from "@/lib/docsbible/or-expiry";
import { docsDb } from "@/lib/docsbible/review-server";
import { PapersCard } from "./files-card";
import { HandoffCard } from "./handoff-card";
import { loadTransfers } from "@/lib/transfers/server";
import { loadCarFacts, type CarFacts } from "@/lib/cars/car-file";
import { STAGE_LABEL, type Transfer } from "@/lib/transfers/model";
import { Overview } from "./overview";
import { TabBar } from "./tab-bar";
import { hrefOfAnchor, isTab, tabHint, type CarTab } from "./tabs";
import { TransferList } from "../transfers/transfer-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listCarReceipts } from "@/lib/docs/receipts-drive";
import { ReceiptsCard } from "./receipts-card";
import { SoldUploadCard, type OutItem } from "./sold-upload-card";
import { RegisterCard } from "./register-card";
import { TransferPapersCard } from "./transfer-papers-card";
import { transferProgress } from "@/lib/docs/transfer-papers";
import { RemoveCarCard } from "./remove-car-card";
import { SoldCard } from "./sold-card";
import { StageCard } from "./stage-card";
import type { CarViewData } from "./types";

export default function CarPage({ params, searchParams }: PageProps<"/documents/[plate]">) {
  return <Suspense fallback={<PageSkeleton />}><Content params={params} searchParams={searchParams} /></Suspense>;
}

const EMPTY_WORKFLOW = { scanNotifiedAt: null, soldReadyNotifiedAt: null, approvedAt: null, approvedByName: null as string | null, marketingNotifiedAt: null, handoffAt: null, handoffNote: null, handoffChecked: [] as string[], handoffReturnedAt: null };

async function Content({ params, searchParams }: { params: PageProps<"/documents/[plate]">["params"]; searchParams: PageProps<"/documents/[plate]">["searchParams"] }) {
  const wanted = (await searchParams).tab;
  const user = await requireModule("register");
  const canAct = user.modules.includes("documents");
  const canUpload = canAct || user.modules.includes("upload"); // Sales add the sold papers here; they have no other button
  const { plate } = await params;
  const detail = await getCarDetail(plate);
  if (!detail) return <RegisterOnly plate={plate} role={user.role} modules={user.modules} canAct={canAct} canUpload={canUpload} wanted={wanted} />;
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
  const orRow = await docsDb().from("docs_units_current").select("or_expiry").eq("plate_no", key).maybeSingle();
  const orDate = orRow.data?.or_expiry ? String(orRow.data.or_expiry).slice(0, 10) : null;
  const transfers = seesSales(user.role) ? await loadTransfers(key) : null;
  const hand = await handoffOf(key).catch(() => null); // the steps of the transfer are kept on the car's sale record
  const [register, receipts, activity] = await Promise.all([loadRegisterRow(key).catch(() => null), canUpload ? listCarReceipts(key).catch(() => []) : Promise.resolve([]), loadCarActivity(key).catch(() => [] as ActivityEntry[])]);

  const recipient = settings.print.transmittalReceiver || "the receiver";
  // who uploaded each photo: the names of the people of the app (a photo that was already in the Drive folder has no uploader)
  const uploaderIds = [...new Set([...car.files, ...car.archive].map((f) => f.uploaded_by).filter((x): x is string => !!x))];
  const { data: uploaders } = uploaderIds.length ? await admin.from("profiles").select("id, full_name").in("id", uploaderIds) : { data: [] };
  const uploaderName = new Map((uploaders ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? "Someone"]));
  const seesPrivate = seesPrivateDocs(user.role); // the notarized closed deed is kept from Sales and Online Marketing: not on the checklist, no photo, no download
  const isPrivate = (types: string[]) => types.some((t) => (PRIVATE_DOCS as string[]).includes(t));
  const items = car.checklist.items.filter((i) => seesPrivate || !(PRIVATE_DOCS as string[]).includes(i.type)).map((i) => ({ key: i.key, label: i.label, stage: i.stage, present: i.present, fileIds: i.fileIds, optional: !!i.optional }));
  const data: CarViewData = {
    plate: key, plateDisplay: car.folder.plate_display, name: car.folder.folder_name ?? car.folder.plate_display, location: car.folder.location as "available" | "sold",
    match: car.folder.match_status as "linked" | "none" | "several", folderUrl: car.folder.folder_url, candidates: (car.folder.candidates ?? []) as unknown as { id: string; name: string; url: string; root: string }[],
    caseType: car.caseType, suggestedCase: car.suggestedCase, caseReason: car.caseReason, caseSource: car.folder.case_source as "auto" | "manual",
    deal: deal ? { id: deal.id, dealNo: deal.dealNo, buyerName: deal.buyerName, hasReceipt: deal.hasReceipt } : null,
    items,
    files: car.files.filter((f) => seesPrivate || !isPrivate(f.doc_types)).map((f) => {
      const r = car.analysis.files.find((x) => x.id === f.id);
      return {
        id: f.id, uploadedBy: f.uploaded_by ? uploaderName.get(f.uploaded_by) ?? "Someone" : null, addedAt: f.created_at, rotation: rotationOf(f.details), name: f.filename, url: f.drive_url, source: f.source, readStatus: f.read_status, readError: f.read_error, types: f.doc_types, manual: f.doc_types_source === "manual", edited: wasEdited(f.details), reviewed: reviewedOf(f.details),
        flags: f.flags, duplicateOf: r?.duplicateOf ? car.files.find((x) => x.id === r.duplicateOf)?.filename ?? null : null, confidence: f.confidence,
        seen: { detections: detectionsOf(f.details) ?? [], notes: readingNotes(f.details).notes },
      };
    }),
    botMode: readerMode() === "grokbot", scanning, orExpiry: orDate, orState: orStatus(orDate, manilaToday()),
    lastScan: lastScanRow ? { at: lastScanRow.completed_at ?? lastScanRow.created_at, seconds: lastScanRow.completed_at ? Math.round((Date.parse(lastScanRow.completed_at) - Date.parse(lastScanRow.created_at)) / 1000) : null, photos: Array.isArray((lastScanRow.request as { files?: unknown[] } | null)?.files) ? ((lastScanRow.request as { files: unknown[] }).files.length) : 0, ok: lastScanRow.status === "done", error: lastScanRow.error } : null,
    botWork: botWork.map((w) => ({ label: workLabel(w.action, w.status, w.position), waiting: w.status === "queued" })),
    scanned: !!car.folder.scanned_at, pending: car.pending, failed: car.files.filter((f) => f.read_status === "failed").length, statusLabel: car.status.label, statusKey: car.status.key,
    isAdmin: isAdmin(user.role),
    dealLinks: user.modules.includes("deals"),
  };

  // what is still open when a car is moved to Sold, listed in the confirmation
  const flagged = car.analysis.files.filter((r) => r.flags.length || r.types.some((t) => t === "id_unmatched" || t === "deed_unmatched")).length;
  const openItems = [...items.filter((i) => !i.present && !i.optional).map((i) => i.label), ...(car.pending ? [`${car.pending} photo${car.pending === 1 ? "" : "s"} not read yet`] : []), ...(flagged ? [`${flagged} file${flagged === 1 ? "" : "s"} still to check`] : [])];
  const soldItems = items.filter((i) => i.stage === "sold").map((i) => ({ key: i.key, label: i.label, present: i.present }));
  // the app's own printout of the AR (unsigned) saved in the folder: shown beside the signed paper, for Documentation (it does not hold up the car)
  const arCopy = receipts.length ? [{ key: "ar_copy", label: "AR copy from the app, saved in the folder (UNSIGNED)", present: receipts.every((r) => r.filed), optional: true }] : [];
  const busy = scanning || data.botWork.length > 0;

  const facts = await loadCarFacts(key).catch(() => ({ unit: null, repairs: [] } as CarFacts));
  const sale = transfers ? saleOf(transfers.transfers) : null;
  const archive: ArchiveFile[] = seesSales(user.role) ? car.archive.filter((f) => f.archive === "payment").map((f) => ({ id: f.id, name: f.filename, tag: f.archive_tag ?? "Other", amount: f.archive_amount === null ? null : Number(f.archive_amount), on: f.archive_on, note: f.archive_note, addedAt: f.created_at, by: f.uploaded_by ? uploaderName.get(f.uploaded_by) ?? "Someone" : null, mime: f.mime_type ?? "" })) : [];
  const newOwnerFiles = seesSales(user.role) ? car.archive.filter((f) => f.archive === "transfer").map((f) => ({ id: f.id, name: f.filename, tag: f.archive_tag ?? "Other", addedAt: f.created_at, by: f.uploaded_by ? uploaderName.get(f.uploaded_by) ?? "Someone" : null })) : [];
  const detailsMissing = missingDetails(flow.details).length;
  const soldCar = data.location === "sold" || facts.unit?.stockState === "Sold";
  const handData = { plate: key, location: data.location, soldCar, recipient, at: flow.workflow.handoffAt, note: flow.workflow.handoffNote, checked: flow.workflow.handoffChecked, returnedAt: flow.workflow.handoffReturnedAt, releasedOn: hand?.releasedOn ?? null, deliveredOn: hand?.deliveredOn ?? null, stage: sale?.stage ?? hand?.stage ?? null,
    items: [...items, ...arCopy].map((i) => ({ key: i.key, label: i.label, present: i.present, optional: i.optional })) };
  const before = items.filter((i) => i.stage === "available" && !i.optional);
  // the after-sale checklist: the signed AR (every AR that was uploaded is listed under it), the buyer's ID and the deed
  const fileOf = new Map(car.files.map((f) => [f.id, f]));
  const outItems: OutItem[] = items.filter((i) => i.stage === "sold").map((i) => ({
    key: i.key, label: i.key === "ack" ? "Signed AR (every AR that is uploaded)" : i.label, present: i.present,
    files: (i.key === "ack" ? car.files.filter((f) => f.doc_types.includes("acknowledgement_receipt")).map((f) => f.id) : i.fileIds).map((id) => fileOf.get(id)).filter((f): f is NonNullable<typeof f> => !!f).map((f) => {
      const d = detectionsOf(f.details)?.find((x) => x.type === "acknowledgement_receipt");
      return { id: f.id, name: f.filename, by: f.uploaded_by ? uploaderName.get(f.uploaded_by) ?? "Someone" : null, at: f.created_at, note: d ? [d.buyerName && `Buyer ${d.buyerName}`, d.documentNumber && `AR no. ${d.documentNumber}`, d.amount != null && `₱${d.amount.toLocaleString("en-PH")}`, d.documentDate && dayOf(d.documentDate)].filter(Boolean).join(" · ") || f.filename : f.filename };
    }),
  }));
  const outHave = outItems.filter((i) => i.present).length;
  const buyerName = data.deal?.buyerName ?? sale?.buyer ?? null;
  // what each person does next on this car
  const inNext = linked ? { anchor: stage.next.anchor, title: stage.next.title } : { anchor: "folder", title: "Add the car's documents" };
  const outNext = linked && transfers ? (!sale ? { anchor: "sold-upload", title: "Upload the AR" } : outHave < outItems.length ? { anchor: "sold-upload", title: `Upload the OUT documents (${outItems.length - outHave} to go)` } : null) : null;
  const next = canAct ? inNext : canUpload ? outNext : null;
  const who = { editsIn: canAct, editsOut: canUpload, seesSales: !!transfers };
  const panels: Panel[] = [
    { key: "overview", label: "Overview", node: (
      <div className="space-y-4">
        {linked && canAct && <StageCard stage={stage} plate={key} />}
        {!canAct && <YourPart hint={tabHint("overview", who)} next={next} plate={key} />}
        <Overview buyerPapers={transferProgress(newOwnerFiles.map((f) => f.tag))} data={data} facts={facts} sale={sale} steps={hand ? { ...hand, stage: sale?.stage ?? hand.stage } : sale ? { handedOffAt: null, backAt: null, releasedOn: null, deliveredOn: null, stage: sale.stage } : null} approval={{ at: flow.workflow.approvedAt, by: flow.workflow.approvedByName }} payments={seesSales(user.role) ? { count: archive.length, total: archiveTotal(archive) } : null} canSale={!!transfers} detailsMissing={detailsMissing} carDescription={null} />
      </div>) },
    { key: "documents", label: "IN documents", badge: linked ? `${before.filter((i) => i.present).length}/${before.length}` : null, tone: linked && before.some((i) => !i.present) ? "amber" : "emerald", node: linked ? (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
        <PapersCard data={data} rules={stage.rules} readOnly={!canAct} confirmEdits={data.isAdmin && data.location === "sold"} register={register ? { id: register.id, values: register.values } : null} canEditRegister={canAct} differs={register && car.folder.case_source === "manual" ? registerDiff(car, register.values) : null} />
        <aside className="space-y-6">
          {canAct ? <ApprovalCard isAdmin={data.isAdmin} plate={key} approvedAt={flow.workflow.approvedAt} approvedBy={flow.workflow.approvedByName} marketingNotifiedAt={flow.workflow.marketingNotifiedAt} rule={stage.rules.approve} activity={activity} />
            : <Card id="approval"><CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Approval{flow.workflow.approvedAt ? <Pill tone="emerald">Approved</Pill> : <Pill tone="zinc">Not approved yet</Pill>}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{flow.workflow.approvedAt && <p className="font-medium">Approved by {flow.workflow.approvedByName ?? "someone"}.</p>}<div className="space-y-1 border-t pt-3"><p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Activity on this car</p><ActivityList entries={activity} /></div></CardContent></Card>}
          {canAct && <SoldCard plate={key} location={data.location} items={[...arCopy.map(({ key: k, label, present }) => ({ key: k, label, present })), ...soldItems]} rule={stage.rules.moveToSold} isAdmin={data.isAdmin} openItems={openItems} />}
          {canAct && <ChecksHelp />}
        </aside>
      </div>) : <NoFolder data={data} canAct={canAct} /> },
    ...(transfers && linked ? [{ key: "payments" as CarTab, label: "OUT documents", badge: `${outHave}/${outItems.length}`, tone: (outHave < outItems.length || !sale ? "amber" : "emerald") as Tone2, node: (
      <div className="space-y-6">
        <SoldUploadCard plate={key} items={outItems} buyer={buyerName} canUpload={canUpload} />
        <PaymentsPanel plate={key} hasSale={!!sale} status={sale?.paymentStatus ?? null} files={archive} canEdit={canUpload} isAdmin={data.isAdmin} folderLinked={linked} />
        <Card id="out-activity"><CardHeader><CardTitle>Activity on the OUT documents</CardTitle></CardHeader><CardContent><ActivityList entries={activity.filter((a) => a.area === "out")} /></CardContent></Card>
      </div>) }] : []),
    ...(transfers ? [{ key: "sale" as CarTab, label: "Sale and transfer", badge: sale ? STAGE_LABEL[sale.stage].split(" (")[0].split(",")[0].replace("In process at LTO", "In process") : null, tone: (sale?.flags.length ? "amber" : "zinc") as Tone2, node: (
      <div className="space-y-6">
        <HandoffCard isAdmin={data.isAdmin} rules={stage.rules} data={handData} />
        <TransferPapersCard plate={key} files={newOwnerFiles} canEdit={canUpload} isAdmin={data.isAdmin} folderLinked={linked} backAtMad={!!flow.workflow.handoffReturnedAt} />
        <Card id="transfer"><CardHeader><CardTitle>The sale of this car</CardTitle></CardHeader><CardContent><TransferList transfers={transfers.transfers} cars={Object.fromEntries(transfers.cars)} today={manilaToday()} plate={key} showCar={false} /></CardContent></Card>
      </div>) }] : []),
    ...(canUpload && (receipts.length > 0 || data.deal) ? [{ key: "receipts" as CarTab, label: "Receipts", badge: receipts.length ? String(receipts.length) : null, tone: "zinc" as Tone2, node: (
      <div className="space-y-6">
        {receipts.length > 0 ? <ReceiptsCard plate={key} receipts={receipts} /> : <Empty>No receipt made in the app belongs to this car yet.</Empty>}
        {data.deal && <Card><CardContent className="pt-4 text-sm">Deal <b>{data.deal.dealNo}</b> · {data.deal.buyerName}.{data.dealLinks && <> <Link href={`/deals/${data.deal.id}`} className="underline underline-offset-2">Open the deal</Link> for the money, the receipts and the payments.</>}</CardContent></Card>}
      </div>) }] : []),
    { key: "details", label: "Details", badge: detailsMissing ? String(detailsMissing) : null, tone: "amber", node: (
      <div className="space-y-6">
        <AboutCard plate={key} details={flow.details} missing={missingDetails(flow.details)} readOnly={!canAct} confirmEdits={data.isAdmin && data.location === "sold"} />
        <RegisterCard plate={key} row={register} role={user.role} canAct={canAct} confirmEdits={data.isAdmin && data.location === "sold"} />
        <RepairsCard repairs={facts.repairs} />
        {data.isAdmin && <RemoveCarCard plate={key} name={data.name} />}
      </div>) },
  ];
  return <Shell data={data} who={who} linked={linked} busy={busy} canSync={canAct} next={next} panels={panels} wanted={wanted} />;
}

type Tone2 = "amber" | "emerald" | "zinc";
interface Panel { key: CarTab; label: string; badge?: string | null; tone?: Tone2; node: React.ReactNode }

/** The latest sale of the car that is not cancelled (the page lists them newest first). */
function saleOf(list: Transfer[]): Transfer | null { return list.find((t) => t.stage !== "cancelled") ?? null; }

/** The Documents tab of a car with no single folder in Drive yet: the way to find or make it. */
function NoFolder({ data, canAct }: { data: CarViewData; canAct: boolean }) {
  return <div className="space-y-4"><Empty>This car has no folder in Drive yet, so there are no papers to check. {canAct ? "Add its documents or link its folder below." : "Documentation adds them."}</Empty><FolderBox data={data} readOnly={!canAct} /></div>;
}

const Empty = ({ children }: { children: React.ReactNode }) => <Card><CardContent className="pt-4 text-sm text-muted-foreground">{children}</CardContent></Card>;

type Who = { editsIn: boolean; editsOut: boolean; seesSales: boolean };
const dayOf = (iso: string) => new Date(`${iso}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

/** For the people who do not act on the IN documents: what this page is for them, and their next step (if there is one). */
function YourPart({ hint, next, plate }: { hint: string; next: { anchor: string | null; title: string } | null; plate: string }) {
  return (
    <Card size="sm"><CardContent className="flex flex-wrap items-center gap-3 text-sm">
      <p className="min-w-0 flex-1 text-muted-foreground">{hint}</p>
      {next && <Button size="sm" nativeButton={false} render={<Link href={hrefOfAnchor(plate, next.anchor)} />}><ArrowRight /> {next.title}</Button>}
    </CardContent></Card>
  );
}

/** One page for the car: its name and status, what to do next, and the tabs (only the open tab is built, and the address says which). */
function Shell({ data, who, linked, busy, canSync, next, panels, wanted }: { data: CarViewData; who: Who; linked: boolean; busy: boolean; canSync: boolean; next: { anchor: string | null; title: string } | null; panels: Panel[]; wanted: string | string[] | undefined }) {
  const active = (isTab(wanted) && panels.some((p) => p.key === wanted) ? wanted : "overview") as CarTab;
  const panel = panels.find((p) => p.key === active)!;
  return (
    <div className="space-y-4">
      <PageHeader title={data.name} description={`Plate ${data.plateDisplay}`} actions={next ? <Button nativeButton={false} render={<Link href={hrefOfAnchor(data.plate, next.anchor)} />}><ArrowRight /> Next: {next.title}</Button> : undefined} />
      <CarLive plate={data.plate} linked={linked} scanned={data.scanned} busy={busy} canSync={canSync} />
      <CarTop data={data} readOnly={!who.editsIn} folderBox={false} />
      <TabBar active={active} tabs={panels.map((p) => ({ key: p.key, label: p.label, badge: p.badge, tone: p.tone }))} />
      {active !== "overview" && <p className="text-sm text-muted-foreground">{tabHint(active, who)}</p>}
      <div id={`tab-${active}`} role="tabpanel" className="pt-2">{panel.node}</div>
    </div>
  );
}

function RepairsCard({ repairs }: { repairs: CarFacts["repairs"] }) {
  return (
    <Card id="repairs">
      <CardHeader><CardTitle>Repairs of this car</CardTitle></CardHeader>
      <CardContent className="text-sm">
        {!repairs.length ? <p className="text-muted-foreground">No repair is recorded for this car.</p> : (
          <ul className="divide-y rounded-lg ring-1 ring-foreground/10">{repairs.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5"><span className="min-w-0 flex-1">{r.problem ?? "A repair"}{r.company ? <span className="text-muted-foreground"> · {r.company}</span> : null}</span>{r.approval !== "approved" && <Pill tone="purple">{r.approval}</Pill>}{r.approval === "approved" && <Pill tone={r.canDisplay ? "emerald" : "amber"}>{r.canDisplay ? "Can be displayed" : "Cannot be displayed"}</Pill>}<Pill tone={/IN PROGRESS|FOR REPAIR|OPEN|ONGOING/i.test(r.status ?? "") ? "amber" : "zinc"}>{r.status ?? "No status"}</Pill>{r.dueOn && <span className="text-xs text-muted-foreground">due {r.dueOn}</span>}</li>)}</ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground"><Link href="/repairs" className="underline underline-offset-2">Open Repairs</Link> to report or update a job.</p>
      </CardContent>
    </Card>
  );
}

/** A car that is in MAD's register but has no folder in Car documents yet: the same page, with what MAD knows (its record, its sale, its repairs) and the way to find its folder. */
async function RegisterOnly({ plate, role, modules, canAct, canUpload, wanted }: { plate: string; role: Role; modules: string[]; canAct: boolean; canUpload: boolean; wanted: string | string[] | undefined }) {
  const key = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const register = await loadRegisterRow(key).catch(() => null);
  if (!register) notFound();
  const [facts, transfers, hand, settings] = await Promise.all([loadCarFacts(key).catch(() => ({ unit: null, repairs: [] } as CarFacts)), seesSales(role) ? loadTransfers(key) : Promise.resolve(null), handoffOf(key).catch(() => null), getSettings()]);
  const recipient = settings.print.transmittalReceiver || "the receiver";
  const data: CarViewData = {
    plate: key, plateDisplay: register.values.plate_display ?? key, name: [register.values.year_model, register.values.make, register.values.model_variant].filter(Boolean).join(" ") || key, location: "available", match: "none", folderUrl: null, candidates: [],
    caseType: "clean", suggestedCase: "clean", caseReason: "", caseSource: "auto", deal: null, items: [], files: [], botMode: false, scanning: false, lastScan: null, botWork: [], orExpiry: null, orState: { state: "unknown", days: null }, scanned: false, pending: 0, failed: 0, statusLabel: "No folder", statusKey: "unlinked", isAdmin: isAdmin(role), dealLinks: modules.includes("deals"),
  };
  const sale = transfers ? saleOf(transfers.transfers) : null;
  const archive: ArchiveFile[] = [];
  const soldCar = facts.unit?.stockState === "Sold";
  const rules = { handoff: soldCar && !(hand?.handedOffAt && !hand.backAt) ? { allowed: true, reason: null } : { allowed: false, reason: soldCar ? "Already handed off." : "Mark the car as Sold first.", adminOverride: false }, markReturned: hand?.handedOffAt && !hand.backAt ? { allowed: true, reason: null } : { allowed: false, reason: "The papers have not been handed off.", adminOverride: false } };
  const handData = { plate: key, location: "available" as const, soldCar, recipient, at: hand?.handedOffAt ?? null, note: hand?.note ?? null, checked: hand?.checked ?? [], returnedAt: hand?.backAt ?? null, releasedOn: hand?.releasedOn ?? null, deliveredOn: hand?.deliveredOn ?? null, stage: sale?.stage ?? hand?.stage ?? null, items: [] };
  const panels: Panel[] = [
    { key: "overview", label: "Overview", node: <Overview buyerPapers={null} data={data} facts={facts} sale={sale} steps={hand ? { ...hand, stage: sale?.stage ?? hand.stage } : sale ? { handedOffAt: null, backAt: null, releasedOn: null, deliveredOn: null, stage: sale.stage } : null} approval={{ at: null, by: null }} payments={seesSales(role) ? { count: archive.length, total: archiveTotal(archive) } : null} canSale={!!transfers} detailsMissing={0} carDescription={[register.values.year_model, register.values.make, register.values.model_variant, register.values.color].filter(Boolean).join(" ") || null} /> },
    { key: "documents", label: "IN documents", node: <NoFolder data={data} canAct={canAct} /> },
    ...(transfers ? [{ key: "payments" as CarTab, label: "OUT documents", badge: sale?.paymentStatus ? PAYMENT_LABEL[sale.paymentStatus] : sale ? null : "Add the sale", tone: (!sale || sale.paymentStatus === "unpaid" || sale.paymentStatus === "partial" ? "amber" : sale.paymentStatus ? "emerald" : "zinc") as Tone2, node: (
      <PaymentsPanel plate={key} hasSale={!!sale} status={sale?.paymentStatus ?? null} files={[]} canEdit={canUpload} isAdmin={data.isAdmin} folderLinked={false} />) }] : []),
    ...(transfers ? [{ key: "sale" as CarTab, label: "Sale and transfer", badge: sale ? STAGE_LABEL[sale.stage].split(" (")[0].split(",")[0].replace("In process at LTO", "In process") : null, tone: (sale?.flags.length ? "amber" : "zinc") as Tone2, node: (
      <div className="space-y-6">
        <HandoffCard isAdmin={isAdmin(role)} rules={rules} data={handData} />
        <Card id="transfer"><CardHeader><CardTitle>The sale of this car</CardTitle></CardHeader><CardContent><TransferList transfers={transfers.transfers} cars={Object.fromEntries(transfers.cars)} today={manilaToday()} plate={key} showCar={false} /></CardContent></Card>
      </div>) }] : []),
    { key: "details", label: "Details", node: (
      <div className="space-y-6">
        <RegisterCard plate={key} row={register} role={role} canAct={canAct} />
        <RepairsCard repairs={facts.repairs} />
        {data.isAdmin && <RemoveCarCard plate={key} name={data.name} />}
      </div>) },
  ];
  void canUpload;
  return <Shell data={data} who={{ editsIn: canAct, editsOut: canUpload, seesSales: !!transfers }} linked={false} busy={false} canSync={canAct} next={canAct ? { anchor: "folder", title: "Add the car's documents" } : null} panels={panels} wanted={wanted} />;
}
