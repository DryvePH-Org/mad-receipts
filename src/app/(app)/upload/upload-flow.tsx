"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { Camera, ImageIcon, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Anything bigger than this straight from the camera is not a normal phone photo.
const MAX_ORIGINAL_BYTES = 30 * 1024 * 1024;
// Must fit the bucket limit (5 MB) and Groq's base64 image limit (4 MB) with room to spare.
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

type Step =
  | { kind: "pick" }
  | { kind: "preparing" }
  | { kind: "preview"; photo: File; url: string }
  | { kind: "uploading"; url: string; message: string };

export function UploadFlow({ userId }: { userId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  // Free the preview image when it is replaced or the page closes.
  const previewUrl = step.kind === "preview" || step.kind === "uploading" ? step.url : null;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // let the same file be picked again after Retake
    if (file) void handleFile(file);
  }

  async function handleFile(file: File) {
    setError(null);

    if (!file.type.startsWith("image/")) {
      setError("That file is not a photo. Please choose a photo of the receipt.");
      return;
    }
    if (file.size > MAX_ORIGINAL_BYTES) {
      setError("That photo is too large. Please take a new photo with the camera.");
      return;
    }

    setStep({ kind: "preparing" });
    try {
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1600,
        initialQuality: 0.8,
        maxSizeMB: 1,
        fileType: "image/jpeg",
        useWebWorker: false, // the worker would load its script from a CDN
      });
      if (compressed.size > MAX_UPLOAD_BYTES) {
        setStep({ kind: "pick" });
        setError("That photo is still too large after shrinking it. Please retake it.");
        return;
      }
      const photo = new File([compressed], "receipt.jpg", { type: "image/jpeg" });
      setStep({ kind: "preview", photo, url: URL.createObjectURL(photo) });
    } catch {
      setStep({ kind: "pick" });
      setError("Could not read that photo. Try taking it with the camera instead.");
    }
  }

  async function submitPhoto(photo: File, url: string) {
    if (!navigator.onLine) {
      setError("You're offline. Connect to the internet and tap Use photo again.");
      return;
    }
    setError(null);
    setStep({ kind: "uploading", url, message: "Uploading photo…" });

    const supabase = createClient();
    const draftId = crypto.randomUUID();
    const photoPath = `drafts/${userId}/${draftId}.jpg`;

    try {
      const upload = await supabase.storage
        .from("receipt-photos")
        .upload(photoPath, photo, { contentType: "image/jpeg" });
      if (upload.error) throw new Error("upload");

      setStep({ kind: "uploading", url, message: "Saving…" });
      const draft = await supabase
        .from("receipt_drafts")
        .insert({ id: draftId, photo_path: photoPath, created_by: userId });
      if (draft.error) throw new Error("draft");
    } catch {
      // Keep the photo on screen so they can try again without retaking it.
      setStep({ kind: "preview", photo, url });
      setError(
        navigator.onLine
          ? "Upload failed. Please tap Use photo to try again."
          : "You went offline. Connect to the internet and tap Use photo again.",
      );
      return;
    }

    // Start reading the receipt; the review page shows progress while it runs.
    void fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId }),
      keepalive: true,
    }).catch(() => {});

    router.push(`/review/${draftId}`);
  }

  return (
    <div className="space-y-4">
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFileChosen}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChosen}
      />

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {step.kind === "pick" && (
        <div
          className="space-y-4 lg:rounded-xl lg:border-2 lg:border-dashed lg:p-6"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
        >
          <Button
            type="button"
            onClick={() => cameraInput.current?.click()}
            className="h-40 w-full flex-col gap-3 text-lg md:h-40"
          >
            <Camera className="size-10" />
            Take photo of receipt
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => galleryInput.current?.click()}
            size="lg"
            className="w-full"
          >
            <ImageIcon className="size-5" />
            Choose from gallery
          </Button>
          <p className="hidden text-center text-sm text-muted-foreground lg:block">or drag a photo of the receipt here</p>
        </div>
      )}

      {step.kind === "preparing" && (
        <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          Preparing photo…
        </div>
      )}

      {(step.kind === "preview" || step.kind === "uploading") && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img
            src={step.url}
            alt="Receipt photo preview"
            className="max-h-[60vh] w-full rounded-lg border object-contain"
          />
          {step.kind === "preview" ? (
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setError(null);
                  setStep({ kind: "pick" });
                }}
                size="lg"
              >
                <RotateCcw className="size-5" />
                Retake
              </Button>
              <Button
                type="button"
                onClick={() => submitPhoto(step.photo, step.url)}
                size="lg"
              >
                Use photo
              </Button>
            </div>
          ) : (
            <div className="flex h-11 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              {step.message}
            </div>
          )}
        </>
      )}
    </div>
  );
}
