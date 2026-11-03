"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const STUCK_AFTER_MS = 25_000;

/** Shown while the AI reads the photo. Polls the draft and refreshes when it is done. */
export function ExtractingWait({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [stuck, setStuck] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const poll = setInterval(async () => {
      const { data } = await supabase.from("receipt_drafts").select("status").eq("id", draftId).single();
      if (data && data.status !== "extracting") router.refresh();
    }, 2000);
    const stuckTimer = setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(stuckTimer);
    };
  }, [draftId, router]);

  async function retry() {
    setRetrying(true);
    // Only does work if the first request never reached the server.
    await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId }),
    }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border p-6 text-center">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
      <p className="font-medium">Reading the receipt…</p>
      <p className="text-sm text-muted-foreground">This usually takes a few seconds.</p>
      {stuck && (
        <Button onClick={retry} disabled={retrying} variant="outline">
          {retrying ? "Trying again…" : "Taking long? Try again"}
        </Button>
      )}
    </div>
  );
}
