"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Lock, Send, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  closeReplenishment,
  reviewReplenishment,
  submitReplenishment,
} from "@/lib/pcf/actions/replenishments";
import { ConfirmDialog } from "@/components/pcf/shared/confirm-dialog";
import { ReasonDialog } from "@/components/pcf/shared/reason-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ActionResult } from "@/lib/pcf/action-result";
import { canPerform, type Role } from "@/lib/pcf/permissions";
import type { ReplenishmentStatus } from "@/lib/pcf/replenishment-status";

type DialogKind = "submit" | "approve" | "reject" | "close";

export function ReplenishmentActions({
  replenishment,
  viewer,
}: {
  replenishment: {
    id: string;
    status: ReplenishmentStatus;
    requested_by: string | null;
  };
  viewer: { id: string; role: Role };
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [pending, startTransition] = useTransition();

  const canSubmit =
    replenishment.status === "draft" &&
    canPerform(viewer.role, "replenishment.submit") &&
    (viewer.role === "admin" || replenishment.requested_by === viewer.id);
  const canReview =
    replenishment.status === "submitted" &&
    canPerform(viewer.role, "replenishment.review");
  const canClose =
    replenishment.status === "approved" &&
    canPerform(viewer.role, "replenishment.close");

  const close = () => setDialog(null);

  function run(action: () => Promise<ActionResult>, successMessage: string) {
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

  if (!canSubmit && !canReview && !canClose) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>{describeState(replenishment.status)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {canSubmit ? (
            <Button disabled={pending} onClick={() => setDialog("submit")}>
              <Send />
              Submit to accounting
            </Button>
          ) : null}

          {canReview ? (
            <>
              <Button disabled={pending} onClick={() => setDialog("approve")}>
                <CircleCheck />
                Approve
              </Button>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setDialog("reject")}
              >
                <XCircle />
                Reject
              </Button>
            </>
          ) : null}

          {canClose ? (
            <Button disabled={pending} onClick={() => setDialog("close")}>
              <Lock />
              Mark as replenished and close
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {dialog === "submit" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title="Submit this replenishment?"
          description="Accounting will review the request and its vouchers. You cannot add or remove vouchers after submitting."
          confirmLabel="Submit"
          pending={pending}
          onConfirm={() =>
            run(
              () => submitReplenishment(replenishment.id),
              "Replenishment submitted.",
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
          title="Approve this replenishment?"
          description="Approving confirms the request. Closing it restores the fund afterwards."
          confirmLabel="Approve"
          pending={pending}
          onConfirm={() =>
            run(
              () =>
                reviewReplenishment({
                  replenishment_id: replenishment.id,
                  approve: true,
                  note: "",
                }),
              "Replenishment approved.",
            )
          }
        />
      ) : null}

      {dialog === "reject" ? (
        <ReasonDialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title="Reject this replenishment"
          description="The vouchers go back to the pool so they can be bundled into a new request. Tell the custodian what needs to change."
          label="Reason for rejecting"
          placeholder="Example: totals do not match the attached receipts."
          confirmLabel="Reject replenishment"
          destructive
          pending={pending}
          onSubmit={(note) =>
            run(
              () =>
                reviewReplenishment({
                  replenishment_id: replenishment.id,
                  approve: false,
                  note,
                }),
              "Replenishment rejected. Vouchers returned to the pool.",
            )
          }
        />
      ) : null}

      {dialog === "close" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title="Close this replenishment?"
          description="The included vouchers become closed and expected cash returns to the full fund amount. This cannot be undone."
          confirmLabel="Close replenishment"
          pending={pending}
          onConfirm={() =>
            run(
              () => closeReplenishment(replenishment.id),
              "Replenishment closed. The fund is restored.",
            )
          }
        />
      ) : null}
    </>
  );
}

function describeState(status: ReplenishmentStatus) {
  switch (status) {
    case "draft":
      return "Bundled vouchers are waiting. Submit when the request is ready.";
    case "submitted":
      return "Waiting for accounting to review this request.";
    case "approved":
      return "Approved. Closing restores the fund.";
    case "rejected":
      return "Rejected. The vouchers were returned to the pool.";
    case "closed":
      return "Closed. The fund has been restored.";
  }
}
