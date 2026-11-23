"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * How big a dialog is. On a phone every dialog is a bottom sheet (sm, md) or fills the screen (lg, xl); from 640 px up it is centred.
 *   sm: a question or a confirmation (28 rem)   md: a form (36 rem, the default)
 *   half: a record to read and edit, about half the window (36 to 58 rem)   lg: a form with a preview beside it (56 rem)   xl: a wide viewer (72 rem)   full: the whole window, for looking at a document with its controls beside it
 */
export type DialogSize = "sm" | "md" | "half" | "lg" | "xl" | "full";

const WIDTH: Record<DialogSize, string> = { sm: "sm:max-w-md", md: "sm:max-w-xl", half: "sm:max-w-[clamp(36rem,52vw,58rem)]", lg: "sm:max-w-4xl", xl: "sm:max-w-[min(72rem,calc(100vw-3rem))]", full: "sm:top-0 sm:left-0 sm:h-dvh sm:max-h-dvh sm:w-screen sm:max-w-none sm:translate-x-0 sm:translate-y-0 sm:rounded-none" };
// the two big sizes take the whole screen on a phone, so a picture and its panel have room; the small ones stay a sheet from the bottom
const PHONE: Record<DialogSize, string> = {
  sm: "max-sm:max-h-[90dvh] max-sm:rounded-t-2xl",
  md: "max-sm:max-h-[92dvh] max-sm:rounded-t-2xl",
  half: "max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none",
  lg: "max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none",
  xl: "max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none",
  full: "max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none",
};
const TALL: Record<DialogSize, string> = { sm: "", md: "", half: "sm:h-[min(54rem,92dvh)]", lg: "sm:h-[min(48rem,92dvh)]", xl: "sm:h-[min(52rem,94dvh)]", full: "" };

/**
 * A modal with a fixed title, a body that scrolls on its own, and an optional bar of actions that stays in view (so Save is never below the fold).
 * Bottom sheet or full screen on phones, centred from `sm` (640 px). Text is 16 px on a phone and 14 px from `sm`.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  bodyClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Buttons that stay at the bottom while the body scrolls. */
  footer?: React.ReactNode;
  size?: DialogSize;
  className?: string;
  bodyClassName?: string;
}) {
  const big = size === "half" || size === "lg" || size === "xl" || size === "full";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // one column: title, scrolling body, actions
          "flex flex-col gap-0 overflow-hidden p-0 text-base sm:text-sm",
          // phone: a sheet from the bottom (or the whole screen), clear of the home bar
          "max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:shadow-lg max-sm:data-open:slide-in-from-bottom max-sm:data-closed:slide-out-to-bottom",
          PHONE[size],
          // from 640 px: centred, as wide as the content needs
          size === "full" ? "" : "sm:max-h-[92dvh]", WIDTH[size], TALL[size],
          className,
        )}
      >
        <DialogHeader className="shrink-0 gap-1 border-b px-4 pt-4 pb-3 sm:px-5">
          <DialogTitle className="pr-10 font-heading text-lg leading-snug font-semibold break-words">{title}</DialogTitle>
          {description && <DialogDescription className="pr-10 text-sm text-muted-foreground">{description}</DialogDescription>}
        </DialogHeader>
        <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5", big && "max-sm:px-3", bodyClassName)}>{children}</div>
        {footer && <div className="shrink-0 border-t bg-popover px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-3">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}
