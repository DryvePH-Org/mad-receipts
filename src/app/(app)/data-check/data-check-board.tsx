"use client";

import { useState } from "react";
import type { ReviewRow } from "@/lib/docsbible/review-server";
import type { SyncRow } from "@/lib/pricelist/sync-server";
import { cn } from "@/lib/utils";
import { ReviewBoard } from "../docs-bible/review/review-board";
import { SyncBoard } from "../cars/sync/sync-board";

/** One place for everything that needs a person: the cars where Car Inventory and Car documents disagree, and what the move off the old sheets could not decide. */
export function DataCheckBoard({ review, differences, canEdit, seesDifferences, initial }: { review: ReviewRow[]; differences: SyncRow[]; canEdit: boolean; seesDifferences: boolean; initial?: "move" | "differences" }) {
  const openReview = review.filter((i) => i.status === "open").length, openDiff = differences.filter((i) => i.status === "open").length;
  const [tab, setTab] = useState<"move" | "differences">(initial ?? (seesDifferences && openDiff > 0 ? "differences" : openReview > 0 || !seesDifferences ? "move" : "differences"));
  const tabs = [
    ...(seesDifferences ? [{ key: "differences" as const, label: "Car Inventory and Car documents differ", count: openDiff }] : []),
    { key: "move" as const, label: "From the move to MAD", count: openReview },
  ];
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="What to check" className="inline-flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn("rounded-full border px-3 py-1 text-sm", tab === t.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {t.label} <span className="opacity-70">{t.count}</span>
          </button>
        ))}
      </div>
      {tab === "differences" && seesDifferences ? (
        differences.length === 0 && openDiff === 0 ? <p className="text-sm text-muted-foreground">Car Inventory and Car documents say the same about every car.</p> : <SyncBoard items={differences} />
      ) : <ReviewBoard items={review} canEdit={canEdit} />}
    </div>
  );
}
