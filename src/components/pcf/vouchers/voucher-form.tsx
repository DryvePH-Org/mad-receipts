"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Plus, Save, Send, Sparkles, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { scanReceipt } from "@/lib/pcf/actions/receipt-scan";
import {
  attachPaperVoucher,
  createVoucher,
  releaseVoucher,
  updateVoucher,
  setVoucherReceipt,
  submitVoucher,
} from "@/lib/pcf/actions/vouchers";
import type { CategoryOption, FundOption } from "@/components/pcf/vouchers/types";
import {
  ReceiptUploader,
  type ReceiptMode,
} from "@/components/pcf/vouchers/receipt-uploader";
import { PaperVoucherScanner } from "@/components/pcf/vouchers/paper-voucher-scanner";
import { ScanProgress } from "@/components/pcf/vouchers/scan-progress";
import { MoneyText } from "@/components/pcf/shared/money-text";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { prepareScanImage, uploadReceipt } from "@/lib/pcf/receipts";
import { parseMoney } from "@/lib/pcf/money";
import { todayInAppTz } from "@/lib/pcf/dates";
import {
  createVoucherSchema,
  MAX_VOUCHER_LINES,
  type CreateVoucherValues,
} from "@/lib/pcf/validators/voucher";

function ComparePhoto({ file, onDismiss }: { file: File; onDismiss: () => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <a href={url} target="_blank" rel="noreferrer" className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Your scanned paper voucher"
          className="h-16 w-16 rounded-md border border-border object-cover"
        />
      </a>
      <p className="min-w-0 flex-1 text-xs">
        <span className="font-medium">Filled in by AI from your paper voucher.</span>{" "}
        Handwriting can be misread, so tap the photo to open it and check the
        payee, date and every amount against it.
      </p>
      <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
        Hide
      </Button>
    </div>
  );
}

// Groq's free tier allows about three scans a minute, so space them out.
const SCAN_COOLDOWN_SECONDS = 20;

const emptyLine = { particulars: "", amount: "", category_id: "" };

type Intent = "draft" | "release" | "submit";

export function VoucherForm({
  funds,
  categories,
  highlightScan = false,
  edit,
}: {
  funds: FundOption[];
  categories: CategoryOption[];
  highlightScan?: boolean;
  // Set when correcting an existing draft; receipts and actions stay on the
  // voucher page.
  edit?: {
    id: string;
    fund_id: string;
    voucher_date: string;
    payee: string;
    items: { particulars: string; amount: string; category_id: string }[];
  };
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ReceiptMode>("receipt");
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<Intent | null>(null);
  // The photo being read right now, and which kind of document it is.
  const [scanning, setScanning] = useState<{ file: File; kind: "receipt" | "voucher" } | null>(null);
  const [filledFromPhoto, setFilledFromPhoto] = useState(false);
  // The paper voucher photo last read, kept on screen so the custodian can
  // compare it with what the form now says.
  const [comparePhoto, setComparePhoto] = useState<File | null>(null);
  // Kept (unlike the on-screen note, which can be hidden) so the paper voucher
  // photo is saved with the voucher.
  const [paperPhoto, setPaperPhoto] = useState<File | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const tick = () => {
      const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, left));
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  const startCooldown = useCallback((seconds: number) => {
    setCooldownUntil(Date.now() + seconds * 1000);
  }, []);

  const form = useForm<CreateVoucherValues>({
    resolver: zodResolver(createVoucherSchema),
    defaultValues: {
      fund_id: edit?.fund_id ?? funds[0]?.id ?? "",
      voucher_date: edit?.voucher_date ?? todayInAppTz(),
      payee: edit?.payee ?? "",
      items: edit?.items ?? [emptyLine],
      no_receipt_reason: "",
    },
  });
  const lines = useFieldArray({ control: form.control, name: "items" });

  const errors = form.formState.errors;
  const fundId = useWatch({ control: form.control, name: "fund_id" });
  const selectedFund = funds.find((fund) => fund.id === fundId);
  const watchedItems = useWatch({ control: form.control, name: "items" });
  // Sum in centavos; an unparsable line counts as zero until it is fixed.
  const amountCentavos = (watchedItems ?? []).reduce(
    (sum, item) => sum + (parseMoney(item?.amount ?? "") ?? 0),
    0,
  );
  const thresholdCentavos = selectedFund
    ? parseMoney(selectedFund.approval_threshold)
    : null;
  // At or above the fund's threshold an approver must approve before any cash
  // is released.
  const needsApproval =
    amountCentavos > 0 &&
    thresholdCentavos !== null &&
    amountCentavos >= thresholdCentavos;
  const fundItems = funds.map((fund) => ({ value: fund.id, label: fund.name }));
  const categoryItems = categories.map((category) => ({
    value: category.id,
    label: category.name,
  }));

  // Reads the photo and pre-fills the form. Only runs over an untouched form
  // unless the custodian asks for it, so typed work is never overwritten.
  async function fillFromPhoto(
    photo: File,
    kind: "receipt" | "voucher",
    overwrite: boolean,
  ) {
    const current = form.getValues();
    const untouched =
      !current.payee.trim() &&
      current.items.every((item) => !item.particulars.trim() && !item.amount.trim());
    if (!untouched && !overwrite) return;
    if (
      !untouched &&
      !window.confirm("This replaces the payee and lines you have typed. Continue?")
    ) {
      return;
    }

    if (cooldownUntil > Date.now()) {
      toast.info(`Please wait ${secondsLeft}s before scanning again.`);
      return;
    }

    setScanning({ file: photo, kind });
    startCooldown(SCAN_COOLDOWN_SECONDS);
    try {
      const body = new FormData();
      body.set("image", await prepareScanImage(photo), "scan.jpg");
      body.set("kind", kind);
      const result = await scanReceipt(body);
      if (!result.ok) {
        toast.error(result.error);
        // A rate-limit answer means Groq needs a longer rest.
        if (/too many/i.test(result.error)) startCooldown(40);
        return;
      }
      const { payee, voucher_date, lines: scanned, warnings } = result.receipt;
      if (payee) form.setValue("payee", payee, { shouldValidate: true });
      if (voucher_date) form.setValue("voucher_date", voucher_date, { shouldValidate: true });
      if (scanned.length > 0) {
        lines.replace(scanned);
      }
      setFilledFromPhoto(true);
      if (kind === "voucher") {
        setComparePhoto(photo);
        setPaperPhoto(photo);
      }
      toast.success("Filled in from the photo. Check every field before saving.");
      for (const warning of warnings) toast.warning(warning, { duration: 12000 });
    } catch {
      toast.error("The scan failed. Fill in the form by hand.");
    } finally {
      setScanning(null);
    }
  }

  async function saveEdit(values: CreateVoucherValues) {
    if (!edit) return;
    setServerError(null);
    setSubmitting("draft");
    try {
      const result = await updateVoucher({
        voucher_id: edit.id,
        voucher_date: values.voucher_date,
        payee: values.payee,
        items: values.items,
      });
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      toast.success("Changes saved");
      router.push(`/pcf/vouchers/${edit.id}`);
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  async function submit(values: CreateVoucherValues, nextIntent: Intent) {
    setServerError(null);
    setReceiptError(null);

    if (nextIntent !== "draft") {
      if (mode === "receipt" && !file) {
        setReceiptError(
          "Attach a receipt photo or switch to No receipt and give a reason.",
        );
        return;
      }
      if (
        mode === "none" &&
        !values.no_receipt_reason?.trim()
      ) {
        setReceiptError("Give a short reason for the missing receipt.");
        return;
      }
    }

    setSubmitting(nextIntent);
    try {
      const result = await createVoucher({
        ...values,
        no_receipt_reason:
          mode === "none" ? values.no_receipt_reason?.trim() || undefined : undefined,
      });

      if (!result.ok) {
        setServerError(result.error);
        if (result.fieldErrors) {
          for (const [key, messages] of Object.entries(result.fieldErrors)) {
            form.setError(key as keyof CreateVoucherValues, {
              message: messages[0],
            });
          }
        }
        return;
      }

      const voucherId = result.id;

      if (mode === "receipt" && file) {
        try {
          const path = await uploadReceipt(file, values.fund_id, voucherId);
          const attached = await setVoucherReceipt({
            voucher_id: voucherId,
            receipt_path: path,
          });
          if (!attached.ok) throw new Error(attached.error);
        } catch (error) {
          toast.error(
            `Draft saved, but the receipt upload failed: ${error instanceof Error ? error.message : "unknown error"}. Attach it from the voucher page.`,
          );
          router.push(`/pcf/vouchers/${voucherId}`);
          return;
        }
      }

      if (paperPhoto) {
        try {
          const path = await uploadReceipt(paperPhoto, values.fund_id, voucherId);
          const attached = await attachPaperVoucher({
            voucher_id: voucherId,
            receipt_path: path,
          });
          if (!attached.ok) throw new Error(attached.error);
        } catch (error) {
          toast.error(
            `Voucher saved, but the paper voucher photo was not: ${error instanceof Error ? error.message : "unknown error"}.`,
          );
        }
      }

      if (nextIntent === "submit") {
        const submitted = await submitVoucher(voucherId);
        if (!submitted.ok) {
          toast.error(submitted.error);
          router.push(`/pcf/vouchers/${voucherId}`);
          return;
        }
        toast.success("Submitted. An approver has been notified.");
      } else if (nextIntent === "release") {
        const released = await releaseVoucher(voucherId);
        if (!released.ok) {
          toast.error(released.error);
          router.push(`/pcf/vouchers/${voucherId}`);
          return;
        }
        toast.success("Cash released. The approver will review it later.");
      } else {
        toast.success("Draft saved");
      }

      router.push(`/pcf/vouchers/${voucherId}`);
      router.refresh();
    } finally {
      setSubmitting(null);
    }
  }

  const submitDraft = form.handleSubmit((values) =>
    edit ? saveEdit(values) : submit(values, "draft"),
  );
  const submitRelease = form.handleSubmit((values) =>
    submit(values, needsApproval ? "submit" : "release"),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Voucher details</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submitDraft} noValidate>
          {comparePhoto && !edit ? (
            <ComparePhoto file={comparePhoto} onDismiss={() => setComparePhoto(null)} />
          ) : null}
          {edit ? null : (
            <PaperVoucherScanner
              highlight={highlightScan}
              scanning={scanning?.kind === "voucher" ? scanning.file : null}
              disabled={scanning !== null || submitting !== null || secondsLeft > 0}
              cooldown={scanning ? 0 : secondsLeft}
              onPick={(photo) => void fillFromPhoto(photo, "voucher", true)}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="voucher-date">Voucher date</Label>
              <Input
                id="voucher-date"
                type="date"
                {...form.register("voucher_date")}
                aria-invalid={Boolean(errors.voucher_date)}
              />
              {errors.voucher_date ? (
                <p className="text-xs text-destructive">
                  {errors.voucher_date.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="voucher-fund">Fund</Label>
              <Controller
                control={form.control}
                name="fund_id"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value ?? "")}
                    items={fundItems}
                    disabled={funds.length <= 1}
                  >
                    <SelectTrigger id="voucher-fund" className="w-full">
                      <SelectValue placeholder="Select a fund" />
                    </SelectTrigger>
                    <SelectContent>
                      {fundItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.fund_id ? (
                <p className="text-xs text-destructive">
                  {errors.fund_id.message}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="voucher-payee">Payee</Label>
            <Input
              id="voucher-payee"
              maxLength={120}
              placeholder="Who received the cash?"
              autoComplete="off"
              {...form.register("payee")}
              aria-invalid={Boolean(errors.payee)}
            />
            {errors.payee ? (
              <p className="text-xs text-destructive">{errors.payee.message}</p>
            ) : null}
          </div>

          <div className="space-y-3">
            <Label>What was it spent on?</Label>
            {lines.fields.map((field, index) => {
              const lineErrors = errors.items?.[index];
              return (
                <div
                  key={field.id}
                  className="space-y-3 rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Line {index + 1}
                    </span>
                    {lines.fields.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() => lines.remove(index)}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`voucher-particulars-${index}`}>
                      Particulars
                    </Label>
                    <Textarea
                      id={`voucher-particulars-${index}`}
                      maxLength={300}
                      placeholder="What was the cash spent on?"
                      rows={2}
                      {...form.register(`items.${index}.particulars`)}
                      aria-invalid={Boolean(lineErrors?.particulars)}
                    />
                    {lineErrors?.particulars ? (
                      <p className="text-xs text-destructive">
                        {lineErrors.particulars.message}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`voucher-amount-${index}`}>Amount</Label>
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                          ₱
                        </span>
                        <Input
                          id={`voucher-amount-${index}`}
                          maxLength={13}
                          inputMode="decimal"
                          placeholder="0.00"
                          className="pl-7 text-right tabular-nums"
                          {...form.register(`items.${index}.amount`)}
                          aria-invalid={Boolean(lineErrors?.amount)}
                        />
                      </div>
                      {lineErrors?.amount ? (
                        <p className="text-xs text-destructive">
                          {lineErrors.amount.message}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`voucher-category-${index}`}>
                        Category
                      </Label>
                      <Controller
                        control={form.control}
                        name={`items.${index}.category_id`}
                        render={({ field: categoryField }) => (
                          <Select
                            value={categoryField.value}
                            onValueChange={(value) =>
                              categoryField.onChange(value ?? "")
                            }
                            items={categoryItems}
                          >
                            <SelectTrigger
                              id={`voucher-category-${index}`}
                              className="w-full"
                            >
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                            <SelectContent>
                              {categoryItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {lineErrors?.category_id ? (
                        <p className="text-xs text-destructive">
                          {lineErrors.category_id.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {errors.items?.root || typeof errors.items?.message === "string" ? (
              <p className="text-xs text-destructive">
                {errors.items?.root?.message ?? errors.items?.message}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={lines.fields.length >= MAX_VOUCHER_LINES}
                onClick={() => lines.append(emptyLine)}
              >
                <Plus />
                Add line
              </Button>
              <p className="text-sm">
                Total{" "}
                <span className="font-semibold tabular-nums">
                  <MoneyText value={String(amountCentavos / 100)} />
                </span>
              </p>
            </div>
            {selectedFund ? (
              <p
                className={
                  needsApproval
                    ? "text-xs text-amber-700 dark:text-amber-400"
                    : "text-xs text-muted-foreground"
                }
              >
                Limit per transaction:{" "}
                <MoneyText value={selectedFund.per_txn_limit} />
                {" · "}
                {needsApproval ? (
                  "An approver must approve this before any cash is released."
                ) : (
                  <>
                    Approval needed from{" "}
                    <MoneyText value={selectedFund.approval_threshold} />
                  </>
                )}
              </p>
            ) : null}
          </div>

          {edit ? null : (
            <>
          <div className="space-y-2">
            <Label>Proof of spending</Label>
            <ReceiptUploader
              file={file}
              onFileChange={(next) => {
                setFile(next);
                setReceiptError(null);
                setFilledFromPhoto(false);
                if (next) void fillFromPhoto(next, "receipt", false);
              }}
              mode={mode}
              onModeChange={(next) => {
                setMode(next);
                setReceiptError(null);
              }}
              disabled={submitting !== null}
              error={receiptError ?? undefined}
            />
            {scanning?.kind === "receipt" ? (
              <ScanProgress file={scanning.file} label="Reading the receipt..." />
            ) : null}
            {mode === "receipt" && file && scanning?.kind !== "receipt" ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={scanning !== null || submitting !== null || secondsLeft > 0}
                  onClick={() => void fillFromPhoto(file, "receipt", true)}
                >
                  <Sparkles />
                  {secondsLeft > 0 ? `Scan again in ${secondsLeft}s` : "Fill form from receipt"}
                </Button>
                {filledFromPhoto ? (
                  <p className="text-xs text-muted-foreground">
                    Filled in by AI. Check the payee, date, amounts and categories.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {mode === "none" ? (
            <div className="space-y-2">
              <Label htmlFor="voucher-no-receipt-reason">
                Reason there is no receipt
              </Label>
              <Textarea
                id="voucher-no-receipt-reason"
              maxLength={300}
                placeholder="Example: the supplier does not issue official receipts."
                rows={2}
                {...form.register("no_receipt_reason")}
                aria-invalid={Boolean(errors.no_receipt_reason)}
              />
              {errors.no_receipt_reason ? (
                <p className="text-xs text-destructive">
                  {errors.no_receipt_reason.message}
                </p>
              ) : null}
            </div>
          ) : null}

            </>
          )}

          {serverError ? (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            {edit ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push(`/pcf/vouchers/${edit.id}`)}
              >
                Cancel
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={submitting !== null}
              onClick={submitDraft}
            >
              <Save />
              {submitting === "draft"
                ? "Saving..."
                : edit
                  ? "Save changes"
                  : "Save draft"}
            </Button>
            {edit ? null : (
            <Button
              type="button"
              disabled={submitting !== null}
              onClick={submitRelease}
            >
              {needsApproval ? <Send /> : <Wallet />}
              {needsApproval
                ? submitting === "submit"
                  ? "Submitting..."
                  : "Submit for approval"
                : submitting === "release"
                  ? "Releasing..."
                  : "Save and release cash"}
            </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
