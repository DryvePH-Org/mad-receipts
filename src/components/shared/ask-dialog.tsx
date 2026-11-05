"use client";

import { useState } from "react";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface AskField {
  id: string;
  label: string;
  type?: "text" | "textarea" | "date" | "money";
  value?: string;
  placeholder?: string;
  required?: boolean;
}

/** A small question box: a title, a few fields, Confirm and Cancel. The caller does the work in onConfirm. */
export function AskDialog({
  open, onOpenChange, title, description, fields, confirm, danger, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: AskField[];
  confirm: string;
  danger?: boolean;
  /** Return an error message to show, or nothing when done. */
  onConfirm: (values: Record<string, string>) => Promise<string | void>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const get = (f: AskField) => values[f.id] ?? f.value ?? "";

  async function submit() {
    const missing = fields.find((f) => f.required && !get(f).trim());
    if (missing) return setError(`${missing.label} is required.`);
    setPending(true);
    setError(null);
    const out = await onConfirm(Object.fromEntries(fields.map((f) => [f.id, get(f).trim()])));
    setPending(false);
    if (out) setError(out);
    else onOpenChange(false);
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { if (!pending) { setError(null); onOpenChange(o); } }} title={title} description={description}>
      <div className="space-y-3">
        {fields.map((f) => (
          <div key={f.id} className="space-y-1.5">
            <Label htmlFor={`ask-${f.id}`}>{f.label}</Label>
            {f.type === "textarea" ? (
              <textarea id={`ask-${f.id}`} value={get(f)} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                className="min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm" />
            ) : f.type === "money" ? (
              <div className="flex"><span className="grid place-items-center rounded-l-lg border border-r-0 bg-muted px-2.5 text-sm text-muted-foreground">₱</span>
                <Input id={`ask-${f.id}`} inputMode="decimal" value={get(f)} onChange={(e) => setValues({ ...values, [f.id]: e.target.value.replace(/[^\d.,]/g, "") })} className="rounded-l-none text-right" /></div>
            ) : (
              <Input id={`ask-${f.id}`} type={f.type === "date" ? "date" : "text"} value={get(f)} placeholder={f.placeholder} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} />
            )}
          </div>
        ))}
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending} className={cn(danger && "bg-destructive text-white hover:bg-destructive/90")}>{pending ? "Working…" : confirm}</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
