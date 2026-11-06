"use client";

import { useId, useState } from "react";

import { ResponsiveDialog } from "@/components/pcf/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  destructive = false,
  pending,
  defaultValue = "",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  destructive?: boolean;
  pending: boolean;
  defaultValue?: string;
  onSubmit: (reason: string) => void;
}) {
  const inputId = useId();
  const [reason, setReason] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      <div className="space-y-2">
        <Label htmlFor={inputId}>{label}</Label>
        <Textarea
          id={inputId}
 maxLength={300}
          value={reason}
          rows={3}
          placeholder={placeholder}
          disabled={pending}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
      <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          disabled={pending}
          onClick={() => {
            const trimmed = reason.trim();
            if (!trimmed) {
              setError("A reason is required.");
              return;
            }
            onSubmit(trimmed);
          }}
        >
          {pending ? "Working..." : confirmLabel}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
