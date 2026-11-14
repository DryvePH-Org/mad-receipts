"use client";

import { BadgeCheck, Loader2 } from "lucide-react";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Rule } from "@/lib/docs/stage";
import { approveUnitAction } from "../actions";
import { useStep } from "./use-step";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });

/** Step 4: the staff approve the documents. The button works only when the scan is finished; open flags and blank details ask to be confirmed. */
export function ApprovalCard({ plate, approvedAt, marketingNotifiedAt, rule }: { plate: string; approvedAt: string | null; marketingNotifiedAt: string | null; rule: Rule }) {
  const { busy, step, dialog } = useStep();
  return (
    <Card id="approval">
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Approval
        {approvedAt ? <Pill tone="emerald">Approved {day(approvedAt)}</Pill> : <Pill tone="zinc">Not approved yet</Pill>}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {approvedAt ? <p className="text-muted-foreground">{marketingNotifiedAt ? "Marketing was told on Telegram that this car is ready to market." : "Marketing could not be reached on Telegram. Tell them this car is ready."}</p>
          : <p className="text-muted-foreground">When you have checked the photos and the details, approve. Marketing is told that the car is ready for photos, videos and posting, and the sheets are updated.</p>}
        {!approvedAt && (
          <>
            <Button disabled={busy || !rule.allowed} onClick={() => step("Approve with things still open?", (c) => approveUnitAction(plate, c))}>{busy ? <Loader2 className="animate-spin" /> : <BadgeCheck />} Approve: documents are OK</Button>
            {!rule.allowed && rule.reason && <p className="text-xs text-muted-foreground">{rule.reason}</p>}
          </>
        )}
        {dialog}
      </CardContent>
    </Card>
  );
}
