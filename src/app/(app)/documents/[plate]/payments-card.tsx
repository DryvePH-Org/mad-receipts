"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import { Download, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { AskDialog } from "@/components/shared/ask-dialog";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { archiveTotal, PAYMENT_LABEL, PAYMENT_STATUSES, PAYMENT_TAGS, type ArchiveFile, type PaymentStatus } from "@/lib/docs/payments";
import { formatPeso } from "@/lib/rules/money";
import { addSaleAction, deleteArchiveFileAction, setPaymentStatusAction } from "../actions";
import { isHeic, toJpeg } from "../upload-photos";

const TONE: Record<PaymentStatus, "red" | "amber" | "emerald" | "teal"> = { unpaid: "red", partial: "amber", paid: "emerald", loan_released: "teal" };
const day = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }) : "");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

/** How the sale is being paid: one tap sets it. */
export function PaymentStatusBar({ plate, status, canEdit }: { plate: string; status: PaymentStatus | null; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const set = async (next: string) => {
    setBusy(true);
    const r = await setPaymentStatusAction(plate, next);
    setBusy(false);
    if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.message);
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Payment status</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Payment status">
        {PAYMENT_STATUSES.map((s) => (
          <Button key={s} type="button" size="sm" variant={status === s ? "default" : "outline"} aria-pressed={status === s} disabled={!canEdit || busy} onClick={() => void set(status === s ? "" : s)}>{PAYMENT_LABEL[s]}</Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{status ? "Tap the chosen one again to clear it." : "Not set yet. Tap one to say how this sale is being paid."}</p>
    </div>
  );
}

/** The sale of a car, added by hand now that no digital receipt makes it. */
export function AddSaleForm({ plate, bare = false }: { plate: string; bare?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ buyer: "", agreedPrice: "", soldOn: today(), sales: "", payment: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v, value: string) => setV((x) => ({ ...x, [k]: value }));
  const save = async () => {
    setBusy(true); setError(null);
    const r = await addSaleAction(plate, v as Parameters<typeof addSaleAction>[1]);
    setBusy(false);
    if (r.ok) { toast.success(r.message); router.refresh(); } else setError(r.message);
  };
  const fields = (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="sale-buyer">Buyer</Label><Input id="sale-buyer" value={v.buyer} maxLength={120} placeholder="Full name" onChange={(e) => set("buyer", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="sale-price">Agreed price (₱)</Label><Input id="sale-price" inputMode="decimal" value={v.agreedPrice} placeholder="e.g. 588,000" onChange={(e) => set("agreedPrice", e.target.value.replace(/[^\d.,]/g, ""))} /></div>
        <div className="space-y-1.5"><Label htmlFor="sale-date">Date of the sale</Label><Input id="sale-date" type="date" value={v.soldOn} onChange={(e) => set("soldOn", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="sale-sales">Salesperson</Label><Input id="sale-sales" value={v.sales} maxLength={60} onChange={(e) => set("sales", e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="sale-pay">Payment so far</Label>
          <NativeSelect id="sale-pay" value={v.payment} onChange={(e) => set("payment", e.target.value)}><option value="">Not said yet</option>{PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{PAYMENT_LABEL[s]}</option>)}</NativeSelect></div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={busy || v.buyer.trim().length < 2} onClick={() => void save()}>{busy ? <Loader2 className="animate-spin" /> : <Plus />} Add the sale</Button>
    </div>
  );
  if (bare) return fields;
  return (
    <Card id="add-sale">
      <CardHeader><CardTitle>Add the sale</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">This car has no sale recorded yet. Add who bought it, for how much and when. Then you can upload the sold papers and the payment papers.</p>
        {fields}
      </CardContent>
    </Card>
  );
}

/** One payment paper at a time: choose what it is, add the amount and date if known, and send it. */
function ArchiveUpload({ plate, folderLinked }: { plate: string; folderLinked: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ tag: "Proof of payment", amount: "", on: today(), note: "" });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      let out: File = file;
      if (isHeic(file)) out = await toJpeg(file);
      if (out.type.startsWith("image/")) out = await imageCompression(out, { maxWidthOrHeight: 2400, initialQuality: 0.85, maxSizeMB: 3, fileType: "image/jpeg", useWebWorker: true });
      const body = new FormData();
      body.set("plate", plate); body.set("file", out, file.name); body.set("tag", f.tag); body.set("amount", f.amount); body.set("on", f.on); body.set("note", f.note);
      const res = await fetch("/api/docs/archive", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "The upload failed. Try again.");
      toast.success("Added to the payments.");
      setFile(null); setF({ ...f, amount: "", note: "" });
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "The upload failed."); }
    setBusy(false);
  };
  if (!folderLinked) return <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">This car has no document folder in Drive yet. Link its folder in Documents first; the payment papers are kept in it.</p>;
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-medium">Add a payment paper</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="pay-tag">What is it</Label>
          <NativeSelect id="pay-tag" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })}>{PAYMENT_TAGS.map((t) => <option key={t}>{t}</option>)}</NativeSelect></div>
        <div className="space-y-1.5"><Label htmlFor="pay-amount">Amount, if it shows one (₱)</Label><Input id="pay-amount" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.,]/g, "") })} /></div>
        <div className="space-y-1.5"><Label htmlFor="pay-date">Date of the payment</Label><Input id="pay-date" type="date" value={f.on} onChange={(e) => setF({ ...f, on: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="pay-note">Note (optional)</Label><Input id="pay-note" value={f.note} maxLength={300} placeholder="e.g. BDO deposit slip" onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      </div>
      <input ref={input} id="pay-file" aria-label="Payment paper" type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}><FileText /> {file ? "Choose another" : "Choose a photo or PDF"}</Button>
        {file && <span className="min-w-0 truncate text-sm text-muted-foreground">{file.name}</span>}
        <Button type="button" disabled={busy || !file} onClick={() => void send()}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} Add to the payments</Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function Row({ f, isAdmin }: { f: ArchiveFile; isAdmin: boolean }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-3">
      <a href={`/api/docs/file/${f.id}`} target="_blank" rel="noreferrer" aria-label={`Open ${f.name}`} className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/docs/file/${f.id}`} alt="" loading="lazy" className="size-14 object-cover" />
      </a>
      <div className="min-w-0 flex-1 space-y-0.5 text-sm">
        <p className="flex flex-wrap items-center gap-2"><Pill tone="blue">{f.tag}</Pill>{f.amount !== null && <b>{formatPeso(Math.round(f.amount * 100))}</b>}{f.on && <span className="text-muted-foreground">{day(f.on)}</span>}</p>
        {f.note && <p>{f.note}</p>}
        <p className="truncate text-xs text-muted-foreground">{f.name}</p>
      </div>
      <a href={`/api/docs/file/${f.id}?download=1`} download className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm hover:bg-muted"><Download className="size-4" aria-hidden /> Download</a>
      {isAdmin && !f.ar && <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${f.name}`} onClick={() => setAsk(true)}><Trash2 /></Button>}
      <AskDialog open={ask} onOpenChange={setAsk} title="Remove this payment paper?" description="It leaves the payments and goes to the Drive trash, where it stays for 30 days." fields={[]} confirm="Remove" danger
        onConfirm={async () => { const r = await deleteArchiveFileAction(f.id); if (!r.ok) return r.message; toast.success(r.message); router.refresh(); }} />
    </li>
  );
}

/** The payments of a car: how it is being paid, and an archive of the papers that show it. */
export function PaymentsPanel({ plate, hasSale, status, files, canEdit, isAdmin, folderLinked }: { plate: string; hasSale: boolean; status: PaymentStatus | null; files: ArchiveFile[]; canEdit: boolean; isAdmin: boolean; folderLinked: boolean }) {
  const total = archiveTotal(files);
  return (
    <div className="space-y-6">
      {!hasSale && canEdit && (
        <Card id="add-sale"><CardContent className="pt-4">
          <details><summary className="cursor-pointer text-sm font-medium">No AR to upload? Add the sale by hand</summary><div className="mt-3"><AddSaleForm plate={plate} bare /></div></details>
        </CardContent></Card>
      )}
      <Card id="payments">
        <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Payments
          {status && <Pill tone={TONE[status]}>{PAYMENT_LABEL[status]}</Pill>}
          {files.length > 0 && <span className="text-sm font-normal text-muted-foreground">{files.length} {files.length === 1 ? "paper" : "papers"}{total > 0 ? ` · ${formatPeso(Math.round(total * 100))} written on them` : ""}</span>}
        </CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {hasSale ? <PaymentStatusBar plate={plate} status={status} canEdit={canEdit} /> : <p className="text-sm text-muted-foreground">The payment status can be set once the sale is added.</p>}
          {canEdit && <ArchiveUpload plate={plate} folderLinked={folderLinked} />}
          {files.length === 0 ? <p className="text-sm text-muted-foreground">No payment paper has been added yet. Deposit slips, proofs of payment, the acknowledgement receipt and loan releases all go here.</p>
            : <ul className="divide-y rounded-lg ring-1 ring-foreground/10" aria-label="Payment papers">{files.map((f) => <Row key={f.id} f={f} isAdmin={isAdmin} />)}</ul>}
          <p className="text-xs text-muted-foreground">The papers are kept in the car&apos;s Drive folder. The bot does not read them, and they are not part of the checklist. The total only adds up the amounts people typed.</p>
        </CardContent>
      </Card>
    </div>
  );
}
