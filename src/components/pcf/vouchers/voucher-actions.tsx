"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  CircleCheck,
  Flag,
  Paperclip,
  Pencil,
  PenLine,
  Send,
  Undo2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import {
  approveVoucher,
  flagVoucher,
  releaseVoucher,
  returnVoucher,
  setNoReceiptReason,
  setVoucherReceipt,
  submitVoucher,
  voidVoucher,
} from "@/lib/pcf/actions/vouchers";
import { ConfirmDialog } from "@/components/pcf/shared/confirm-dialog";
import { ReasonDialog } from "@/components/pcf/shared/reason-dialog";
import { ResponsiveDialog } from "@/components/pcf/shared/responsive-dialog";
import { ReceiptUploader } from "@/components/pcf/vouchers/receipt-uploader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActionResult } from "@/lib/pcf/action-result";
import { formatPHP } from "@/lib/pcf/money";
import { canPerform, type Role } from "@/lib/pcf/permissions";
import { uploadReceipt } from "@/lib/pcf/receipts";
import type { VoucherStatus } from "@/lib/pcf/voucher-status";

type DialogKind =
  | "release"
  | "submit"
  | "approve"
  | "return"
  | "flag"
  | "void"
  | "receipt"
  | "reason";

export function VoucherActions({
  voucher,
  viewer,
}: {
  voucher: {
    id: string;
    fund_id: string;
    payee: string;
    amount: string;
    status: VoucherStatus;
    released_at: string | null;
    approval_threshold: string;
    needs_approval: boolean;
    prepared_by: string;
    receipt_path: string | null;
    no_receipt_reason: string | null;
    replenishment_id: string | null;
  };
  viewer: { id: string; role: Role };
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [pending, startTransition] = useTransition();

  const own = voucher.prepared_by === viewer.id;
  const isDraft = voucher.status === "draft";
  const isSubmitted = voucher.status === "submitted";
  // Approved before release: the cash has not gone out yet.
  const preApproved = voucher.status === "approved" && !voucher.released_at;
  const isReleased = Boolean(voucher.released_at);
  const hasProof =
    Boolean(voucher.receipt_path) || Boolean(voucher.no_receipt_reason?.trim());
  const custodianSide =
    own || viewer.role === "admin"
      ? canPerform(viewer.role, "voucher.release")
      : false;
  const canSubmit =
    isDraft && voucher.needs_approval && custodianSide && canPerform(viewer.role, "voucher.submit");
  const canRelease =
    ((isDraft && !voucher.needs_approval) || preApproved) && custodianSide;
  const canAttach =
    isDraft &&
    own &&
    canPerform(viewer.role, "voucher.create");
  const canEdit = isDraft && own && canPerform(viewer.role, "voucher.create");
  const canApprove =
    (isSubmitted || voucher.status === "released" || voucher.status === "rejected") &&
    canPerform(viewer.role, "voucher.approve") &&
    !own;
  const canReturn =
    isSubmitted && canPerform(viewer.role, "voucher.reject") && !own;
  const canFlag =
    (voucher.status === "released" || voucher.status === "approved") &&
    isReleased &&
    canPerform(viewer.role, "voucher.reject");
  const canVoid =
    voucher.status !== "closed" &&
    !voucher.replenishment_id &&
    canPerform(viewer.role, "voucher.void") &&
    (viewer.role === "admin" || (own && (isDraft || isSubmitted)));

  const close = () => setDialog(null);

  function run(
    action: () => Promise<ActionResult>,
    successMessage: string,
  ) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(successMessage);
        close();
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Something went wrong.",
        );
      }
    });
  }

  const hasActions =
    canSubmit ||
    canRelease ||
    canAttach ||
    canApprove ||
    canReturn ||
    canFlag ||
    canVoid;

  if (!hasActions) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>
            {describeState(voucher, { preApproved, own })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {canSubmit ? (
              <Button
                disabled={!hasProof || pending}
                title={
                  hasProof
                    ? undefined
                    : "Attach a receipt or add a reason first."
                }
                onClick={() => setDialog("submit")}
              >
                <Send />
                Submit for approval
              </Button>
            ) : null}

            {canEdit ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/pcf/vouchers/${voucher.id}/edit`} />}
              >
                <Pencil />
                Edit
              </Button>
            ) : null}

            {canRelease ? (
              <Button
                disabled={!hasProof || pending}
                title={
                  hasProof
                    ? undefined
                    : "Attach a receipt or add a reason first."
                }
                onClick={() => setDialog("release")}
              >
                <Wallet />
                Release cash
              </Button>
            ) : null}

            {canApprove ? (
              <Button disabled={pending} onClick={() => setDialog("approve")}>
                <CircleCheck />
                Approve
              </Button>
            ) : null}

            {canReturn ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setDialog("return")}
              >
                <Undo2 />
                Return
              </Button>
            ) : null}

            {canFlag ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setDialog("flag")}
              >
                <Flag />
                Flag
              </Button>
            ) : null}

            {canAttach ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setDialog("receipt")}
              >
                <Paperclip />
                {voucher.receipt_path ? "Replace receipt" : "Attach receipt"}
              </Button>
            ) : null}

            {canAttach && !voucher.receipt_path ? (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setDialog("reason")}
              >
                <PenLine />
                {voucher.no_receipt_reason
                  ? "Edit no-receipt reason"
                  : "Add no-receipt reason"}
              </Button>
            ) : null}

            {canVoid ? (
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => setDialog("void")}
              >
                <Ban />
                Void
              </Button>
            ) : null}
          </div>

          {(canRelease || canSubmit) && !hasProof ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              This voucher needs a receipt photo or a written no-receipt reason
              before it can be {canSubmit ? "submitted" : "released"}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {dialog === "release" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title="Release cash?"
          description={
            <>
              {formatPHP(voucher.amount)} leaves the fund now and goes to{" "}
              {voucher.payee}.{" "}
              {preApproved
                ? "An approver already approved it."
                : "The approver reviews this voucher afterwards."}
            </>
          }
          confirmLabel="Release cash"
          pending={pending}
          onConfirm={() =>
            run(
              () => releaseVoucher(voucher.id),
              preApproved
                ? "Cash released."
                : "Cash released. The approver will review it.",
            )
          }
        />
      ) : null}

      {dialog === "submit" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title="Submit for approval?"
          description={
            <>
              {formatPHP(voucher.amount)} is at or above{" "}
              {formatPHP(voucher.approval_threshold)}, so an approver must
              approve it before any cash goes to {voucher.payee}. You can
              release the cash once it is approved.
            </>
          }
          confirmLabel="Submit"
          pending={pending}
          onConfirm={() =>
            run(
              () => submitVoucher(voucher.id),
              "Submitted. An approver has been notified.",
            )
          }
        />
      ) : null}

      {dialog === "approve" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title="Approve this voucher?"
          description={
            isSubmitted
              ? "No cash has gone out yet. Approving lets the custodian release it."
              : "The cash was already released. Approving records your review of the receipt and particulars."
          }
          confirmLabel="Approve"
          pending={pending}
          onConfirm={() =>
            run(
              () => approveVoucher(voucher.id),
              isSubmitted
                ? "Approved. The custodian can now release the cash."
                : "Voucher approved.",
            )
          }
        />
      ) : null}

      {dialog === "return" ? (
        <ReasonDialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title="Return this voucher"
          description="No cash has gone out. It goes back to the custodian as a draft with your reason."
          label="What needs to change?"
          placeholder="Example: the amount does not match the quotation."
          confirmLabel="Return voucher"
          destructive
          pending={pending}
          onSubmit={(reason) =>
            run(
              () => returnVoucher({ voucher_id: voucher.id, reason }),
              "Voucher returned to the custodian.",
            )
          }
        />
      ) : null}

      {dialog === "flag" ? (
        <ReasonDialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title="Flag this voucher"
          description="The cash stays counted. Tell the custodian what needs to be corrected."
          label="What is wrong?"
          placeholder="Example: the receipt does not match the amount."
          confirmLabel="Flag voucher"
          destructive
          pending={pending}
          onSubmit={(reason) =>
            run(
              () => flagVoucher({ voucher_id: voucher.id, reason }),
              "Voucher flagged.",
            )
          }
        />
      ) : null}

      {dialog === "void" ? (
        <ReasonDialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title="Void this voucher"
          description="Voiding is permanent and removes the amount from the fund balance. The record stays for audit."
          label="Reason for voiding"
          placeholder="Example: duplicate entry."
          confirmLabel="Void voucher"
          destructive
          pending={pending}
          onSubmit={(reason) =>
            run(
              () => voidVoucher({ voucher_id: voucher.id, reason }),
              "Voucher voided.",
            )
          }
        />
      ) : null}

      {dialog === "reason" ? (
        <ReasonDialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title="No-receipt reason"
          description="Say why this purchase has no receipt. This is shown to the approver."
          label="Reason"
          placeholder="Example: the supplier does not issue receipts."
          confirmLabel="Save reason"
          defaultValue={voucher.no_receipt_reason ?? ""}
          pending={pending}
          onSubmit={(reason) =>
            run(
              () => setNoReceiptReason({ voucher_id: voucher.id, reason }),
              "Reason saved.",
            )
          }
        />
      ) : null}

      {dialog === "receipt" ? (
        <AttachReceiptDialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          voucherId={voucher.id}
          fundId={voucher.fund_id}
        />
      ) : null}
    </>
  );
}

function describeState(
  voucher: {
    status: VoucherStatus;
    needs_approval: boolean;
    approval_threshold: string;
    reject_reason?: string | null;
  },
  context: { preApproved: boolean; own: boolean },
) {
  switch (voucher.status) {
    case "draft":
      return voucher.needs_approval
        ? `At or above ${formatPHP(voucher.approval_threshold)}: submit it for approval first, then release the cash.`
        : "Release the cash now, then the approver reviews it.";
    case "submitted":
      return context.own
        ? "Waiting for an approver. No cash can go out until it is approved."
        : "Approve it so the custodian can release the cash, or return it with a reason.";
    case "released":
      return "Cash is out. Waiting for an approver to review.";
    case "approved":
      return context.preApproved
        ? "Approved. The cash has not been handed out yet."
        : "Reviewed and approved. It closes with the next replenishment.";
    case "rejected":
      return "Flagged. Cash stays counted until this is corrected or voided.";
    case "closed":
      return "Closed in a replenishment.";
    case "void":
      return "Voided. The record is kept for audit.";
  }
}

function AttachReceiptDialog({
  open,
  onOpenChange,
  voucherId,
  fundId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucherId: string;
  fundId: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function upload() {
    if (!file) {
      setError("Choose a receipt photo first.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const path = await uploadReceipt(file, fundId, voucherId);
      const result = await setVoucherReceipt({
        voucher_id: voucherId,
        receipt_path: path,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Receipt attached.");
      onOpenChange(false);
      router.refresh();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The upload failed. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Attach receipt"
      description="The photo is compressed before upload. This replaces any previous receipt."
    >
      <ReceiptUploader
        file={file}
        onFileChange={(next) => {
          setFile(next);
          setError(null);
        }}
        mode="receipt"
        onModeChange={() => undefined}
        disabled={pending}
        error={error ?? undefined}
        allowNoReceipt={false}
      />
      <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="button" onClick={upload} disabled={pending}>
          {pending ? "Uploading..." : "Attach receipt"}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
