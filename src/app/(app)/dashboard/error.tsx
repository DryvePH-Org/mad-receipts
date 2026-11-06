"use client";

import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/** The dashboards read outside data, so a failure stays inside the dashboard and offers a retry. */
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState icon={TriangleAlert} title="The dashboard could not load" description="Something went wrong while reading the sheets. Nothing was lost. Try again in a moment." action={<Button onClick={reset}>Try again</Button>} />
  );
}
