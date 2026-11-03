"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * A modal that is a full-width bottom sheet on phones (rounded top, at most 85 svh, clear of the
 * iPhone home bar) and a centred dialog from `sm` (640 px).
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[85svh] max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:overflow-y-auto max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))] max-sm:shadow-lg max-sm:data-open:slide-in-from-bottom max-sm:data-closed:slide-out-to-bottom sm:max-h-[90svh] sm:max-w-lg sm:overflow-y-auto",
          className,
        )}
      >
        <DialogHeader>
          <DialogTitle className="pr-8 text-base font-medium">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
