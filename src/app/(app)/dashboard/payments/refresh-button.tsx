"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshPaymentsAction } from "./actions";

/** Copies every tab of the payments sheet, three at a time, showing how far it is; a tab that fails is reported and left out of the rest. */
export function RefreshPayments() {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);

  async function run() {
    let since: number | null = null;
    const skip: string[] = [];
    let done = 0, rows = 0;
    try {
      for (let guard = 0; guard < 40; guard++) {
        setProgress(done ? `Copying… ${done} tabs done` : "Copying…");
        const r = await refreshPaymentsAction(since, skip);
        since = r.since;
        if (!r.ok) { toast.error(r.message ?? "Could not copy the sheet."); break; }
        done += r.copied; rows += r.rows;
        for (const f of r.failed) { skip.push(f.tab); toast.error(`${f.tab}: ${f.error}`); }
        if (r.remaining === 0 || (r.copied === 0 && r.failed.length === 0)) { toast.success(done ? `Copied ${done} ${done === 1 ? "tab" : "tabs"} (${rows} rows).` : "Everything is already copied."); break; }
      }
    } catch { toast.error("The connection dropped. What was copied is saved: press the button again to finish."); }
    setProgress(null); router.refresh();
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={progress !== null} onClick={() => void run()}>
      {progress !== null ? <Loader2 className="animate-spin" /> : <RefreshCw />} {progress ?? "Copy from the sheet now"}
    </Button>
  );
}
