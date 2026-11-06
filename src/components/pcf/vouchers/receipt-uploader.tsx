"use client";

import { useEffect, useMemo, useRef } from "react";
import { Camera, ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ReceiptMode = "receipt" | "none";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function ReceiptUploader({
  file,
  onFileChange,
  mode,
  onModeChange,
  disabled,
  error,
  allowNoReceipt = true,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  mode: ReceiptMode;
  onModeChange: (mode: ReceiptMode) => void;
  disabled?: boolean;
  error?: string;
  allowNoReceipt?: boolean;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function takeFile(list: FileList | null) {
    const picked = list?.[0];
    if (!picked) return;
    if (!picked.type.startsWith("image/")) return;
    onFileChange(picked);
  }

  return (
    <div className="space-y-3">
      {allowNoReceipt ? (
        <div
          role="group"
          aria-label="Receipt"
          className="inline-flex rounded-lg bg-muted p-1"
        >
          {(
            [
              ["receipt", "Attach receipt"],
              ["none", "No receipt"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              disabled={disabled}
              onClick={() => onModeChange(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {mode === "receipt" ? (
        <div
          onDragOver={(event) => {
            if (disabled) return;
            event.preventDefault();
          }}
          onDrop={(event) => {
            if (disabled) return;
            event.preventDefault();
            takeFile(event.dataTransfer.files);
          }}
          className={cn(
            "rounded-xl border border-dashed border-border bg-muted/30 p-4",
            error && "border-destructive",
          )}
        >
          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              takeFile(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              takeFile(event.target.files);
              event.target.value = "";
            }}
          />

          {preview && file ? (
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Receipt preview"
                className="h-24 w-24 rounded-lg border border-border object-cover"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.size)} before compression
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => cameraInput.current?.click()}
                  >
                    <Camera />
                    Retake
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => fileInput.current?.click()}
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => onFileChange(null)}
                  >
                    <X />
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <ImagePlus className="size-5" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium">Add the receipt photo</p>
                <p className="text-xs text-muted-foreground">
                  Photos are compressed to about 200 KB before upload.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled}
                  onClick={() => cameraInput.current?.click()}
                >
                  <Camera />
                  Take photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => fileInput.current?.click()}
                >
                  Choose image
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                On desktop you can also drop an image here.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
