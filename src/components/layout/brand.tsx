import { cn } from "@/lib/utils";

/**
 * The logo and the name, drawn in dark ink on a light page and in white on a dark one (the page's theme decides).
 * With `tagline` (the side menu, the login page) the whole logo is shown, which says Manila Auto Display itself;
 * without it (the phone header, where there is little room) only the car is shown, next to the name.
 */
export function Brand({ className, tagline = true }: { className?: string; tagline?: boolean }) {
  const art = tagline ? "logo" : "mark";
  const size = tagline ? "h-12" : "h-7";
  return (
    <span className={cn("flex items-center gap-3", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brand/mad-${art}-dark.png`} alt="Manila Auto Display" className={cn(size, "w-auto shrink-0 dark:hidden")} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brand/mad-${art}-light.png`} alt="" aria-hidden className={cn(size, "hidden w-auto shrink-0 dark:block")} />
      <span className="text-base font-semibold tracking-tight">MAD App</span>
    </span>
  );
}
