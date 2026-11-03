import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { PhotoViewer } from "@/components/photo-viewer";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { toFormValues } from "@/lib/extraction/merge";
import type { ExtractedReceipt } from "@/lib/extraction/schema";
import type { VoiceResult } from "@/lib/extraction/voice-schema";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { ExtractingWait } from "./extracting-wait";
import { ReviewForm } from "./review-form";

export default function ReviewPage({ params }: PageProps<"/review/[draftId]">) {
  return (
    <div className="space-y-6">
      <PageHeader title="Review receipt" description="Check the details against the paper, then confirm." />
      <Suspense fallback={<PageSkeleton />}>
        <Review params={params} />
      </Suspense>
    </div>
  );
}

async function Review({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  if (!z.uuid().safeParse(draftId).success) notFound();

  const user = await requireUser();
  const supabase = await createClient();
  const { data: draft } = await supabase
    .from("receipt_drafts")
    .select("id, photo_path, status, extraction, voice, error, created_by")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft || draft.created_by !== user.id) notFound();

  if (draft.status === "consumed") {
    return (
      <EmptyState
        icon={CircleCheck}
        title="This receipt was already confirmed"
        description="It is saved. You can find it under Receipts."
        action={
          <Button nativeButton={false} render={<Link href="/upload" />}>
            Upload another
          </Button>
        }
      />
    );
  }

  const { data: signed } = await supabase.storage.from("receipt-photos").createSignedUrl(draft.photo_path, 60 * 60);

  const extracted = (draft.extraction as { fields?: ExtractedReceipt } | null)?.fields ?? null;
  const voice = (draft.voice as VoiceResult | null) ?? null;
  const { data: salespeople } = await supabase.from("salespeople").select("id, name").eq("active", true).order("name");
  const reading = draft.status === "extracting";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
      {/* On a desktop the photo stays in view while you check the fields beside it. */}
      <div className={cn("lg:sticky lg:top-6 lg:[&_img]:max-h-[70vh]", reading && "scan-sweep rounded-lg")}>
        {signed?.signedUrl ? <PhotoViewer url={signed.signedUrl} /> : <p className="text-sm text-destructive">Could not load the photo.</p>}
      </div>

      <div className="min-w-0 space-y-6">
        {reading ? (
          <ExtractingWait draftId={draft.id} />
        ) : (
          <>
            {draft.status === "failed" && (
              <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-500/40 dark:bg-amber-950/30">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
                <div className="space-y-1">
                  <p>{draft.error ?? "The receipt could not be read."}</p>
                  <p>
                    Type the details from the paper below, or{" "}
                    <Link href="/upload" className="font-medium underline">
                      retake the photo
                    </Link>
                    .
                  </p>
                </div>
              </div>
            )}
            <ReviewForm
              draftId={draft.id}
              initialValues={toFormValues(extracted)}
              initialReservation={extracted?.paper_payment_type === "earnest" || voice?.fields.paper_payment_type === "earnest"}
              salespeople={salespeople ?? []}
              initialVoice={voice}
            />
          </>
        )}
      </div>
    </div>
  );
}
