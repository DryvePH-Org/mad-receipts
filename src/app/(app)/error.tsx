"use client";

import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Something went wrong"
      description="This page could not load. Nothing was lost. Try again in a moment."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
