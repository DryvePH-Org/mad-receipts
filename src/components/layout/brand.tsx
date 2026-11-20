import { cn } from "@/lib/utils";

/**
 * The logo and the name. With `tagline` (the side menu, the login page) the whole logo is shown, which says Manila Auto Display itself;
 * without it (the phone header, where there is little room) only the car is shown, small, next to the name.
 */
export function Brand({ className, tagline = true }: { className?: string; tagline?: boolean }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      {tagline ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/brand/mad-badge.png" alt="Manila Auto Display" width={480} height={200} className="h-14 w-auto shrink-0 rounded-lg ring-1 ring-foreground/10" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/brand/mad-mark.png" alt="" width={168} height={108} className="h-9 w-auto shrink-0 rounded-lg ring-1 ring-foreground/10" />
      )}
      <span className="text-base font-semibold tracking-tight">MAD App</span>
    </span>
  );
}
