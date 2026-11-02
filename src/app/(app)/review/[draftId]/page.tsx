import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import type { ExtractedReceipt } from "@/lib/extraction/schema";
import { EXTRACTED_FIELDS } from "@/lib/extraction/schema";
import { fromCentavos, toCentavos } from "@/lib/rules/money";
import { createClient } from "@/lib/supabase/server";
import { ExtractingWait } from "./extracting-wait";
import { PhotoViewer } from "./photo-viewer";
import { ReviewForm, type FormValues } from "./review-form";

export default function ReviewPage({ params }: PageProps<"/review/[draftId]">) {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Review receipt</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
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
    .select("id, photo_path, status, extraction, error, created_by")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft || draft.created_by !== user.id) notFound();

  if (draft.status === "consumed") {
    return (
      <div className="space-y-4 rounded-lg border p-6 text-center">
        <p className="font-medium">This receipt was already confirmed.</p>
        <Button render={<Link href="/upload" />} nativeButton={false} className="h-12">
          Upload another
        </Button>
      </div>
    );
  }

  const { data: signed } = await supabase.storage
    .from("receipt-photos")
    .createSignedUrl(draft.photo_path, 60 * 60);

  const extracted = (draft.extraction as { fields?: ExtractedReceipt } | null)?.fields ?? null;

  return (
    <>
      {signed?.signedUrl ? (
        <PhotoViewer url={signed.signedUrl} />
      ) : (
        <p className="text-sm text-destructive">Could not load the photo.</p>
      )}

      {draft.status === "extracting" ? (
        <ExtractingWait draftId={draft.id} />
      ) : (
        <>
          {draft.status === "failed" && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <p>{draft.error ?? "The receipt could not be read."}</p>
              <p>
                Type the details from the paper below, or{" "}
                <Link href="/upload" className="font-medium underline">
                  retake the photo
                </Link>
                .
              </p>
            </div>
          )}
          <ReviewForm
            draftId={draft.id}
            initialValues={toFormValues(extracted)}
            initialReservation={extracted?.paper_payment_type === "earnest"}
          />
        </>
      )}
    </>
  );
}

function toFormValues(data: ExtractedReceipt | null): FormValues {
  const values = {} as FormValues;
  for (const key of EXTRACTED_FIELDS) {
    const v = data?.[key] ?? null;
    if (typeof v === "number") {
      const centavos = toCentavos(v);
      values[key] = centavos === null ? "" : fromCentavos(centavos).replace(/\.00$/, "");
    } else {
      values[key] = v ?? "";
    }
  }
  return values;
}
