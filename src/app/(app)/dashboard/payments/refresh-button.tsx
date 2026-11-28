"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshPaymentsAction } from "./actions";

export function RefreshPayments() {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => start(async () => { const r = await refreshPaymentsAction(); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); })}>
      {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Copy from the sheet now
    </Button>
  );
}
