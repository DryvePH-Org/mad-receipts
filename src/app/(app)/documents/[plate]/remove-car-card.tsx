"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { removeUnitAction } from "../actions";

/** Admin only. A car entered by mistake leaves MAD: its record is archived (kept, with who and when), the Drive folder is never touched. */
export function RemoveCarCard({ plate, name }: { plate: string; name: string }) {
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    const r = await removeUnitAction(plate);
    setBusy(false);
    if (r.ok) { toast.success(r.message); router.push("/documents"); router.refresh(); } else { toast.error(r.message); setSure(false); }
  }
  return (
    <Card id="remove-car" className="gap-0 py-0">
      <details className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4 font-heading text-base font-medium">Remove this car (Admin)<span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Show</span></summary>
      <CardContent className="pb-4 space-y-3 text-sm">
        <p className="text-muted-foreground">For a car entered by mistake or twice. It leaves Car documents, the sale list and every other list. The record is kept in the database (archived with your name and the time) and the Drive folder is not touched. A car that has an AR cannot be removed.</p>
        {sure ? (
          <div className="space-y-2 rounded-lg bg-red-50 p-3 text-red-900 dark:bg-red-500/10 dark:text-red-200">
            <p className="font-medium">Remove {name} ({plate}) from MAD?</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" disabled={busy} onClick={remove}>{busy ? "Removing…" : "Yes, remove this car"}</Button>
              <Button variant="ghost" disabled={busy} onClick={() => setSure(false)}>Keep it</Button>
            </div>
          </div>
        ) : <Button variant="outline" onClick={() => setSure(true)}><Trash2 /> Remove this car</Button>}
      </CardContent>
      </details>
    </Card>
  );
}
