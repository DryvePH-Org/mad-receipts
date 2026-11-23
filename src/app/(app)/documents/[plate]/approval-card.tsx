"use client";

import { BadgeCheck, Loader2 } from "lucide-react";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActivityEntry } from "@/lib/docs/activity-text";
import type { Rule } from "@/lib/docs/stage";
import { ActivityList } from "./activity-list";
import { approveUnitAction } from "../actions";
import { AdminFixButton } from "./admin-fix";
import { useStep } from "./use-step";

const stamp = (iso: string) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "Asia/Manila" });

/** Step 4: the staff approve the documents. The button works only when the scan is finished; open flags and blank details ask to be confirmed. */
export function ApprovalCard({ plate, approvedAt, approvedBy, marketingNotifiedAt, rule, isAdmin = false, activity = [] }: { isAdmin?: boolean; activity?: ActivityEntry[]; plate: string; approvedAt: string | null; approvedBy: string | null; marketingNotifiedAt: string | null; rule: Rule }) {
  const { busy, step, dialog } = useStep();
  return (
    <Card id="approval">
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Approval
        {approvedAt ? <Pill tone="emerald">Approved</Pill> : <Pill tone="zinc">Not approved yet</Pill>}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {approvedAt && <p className="font-medium">Approved by {approvedBy ?? "someone (name not recorded)"} on {stamp(approvedAt)} (Manila time).</p>}
        {approvedAt ? <p className="text-muted-foreground">{marketingNotifiedAt ? "Marketing was told on Telegram that this car is ready to market." : "Marketing could not be reached on Telegram. Tell them this car is ready."}</p>
          : <p className="text-muted-foreground">When you have checked the photos and the details, approve. Marketing is told that the car is ready for photos, videos and posting, and the sheets are updated.</p>}
        {approvedAt && isAdmin && <AdminFixButton plate={plate} fix={{ kind: "approval" }} label="Withdraw the approval (Admin)" title="Withdraw the approval?" warning="The documents go back to Not approved, so a mistake can be corrected and the car approved again. Marketing is told again when you approve it again." confirmLabel="Yes, withdraw it" />}
        {!approvedAt && (
          <>
            <Button disabled={busy || !rule.allowed} onClick={() => step("Approve with things still open?", (c) => approveUnitAction(plate, c))}>{busy ? <Loader2 className="animate-spin" /> : <BadgeCheck />} Approve: documents are OK</Button>
            {!rule.allowed && rule.reason && <p className="text-xs text-muted-foreground">{rule.reason}</p>}
          </>
        )}
        {dialog}
        <div className="space-y-1 border-t pt-3"><p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Activity on this car</p><ActivityList entries={activity} /></div>
      </CardContent>
    </Card>
  );
}
