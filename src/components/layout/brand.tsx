import { cn } from "@/lib/utils";

/**
 * The MAD logo (Manila Auto Display), drawn in dark ink on a light page and in white on a dark one (the page's theme decides), with "Powered by" and the
 * Dryve logo under it. With `tagline` (the side menu, the login page) the whole MAD logo is shown, which says Manila Auto Display itself;
 * without it (the phone header, where there is little room) only the car is shown, with a smaller Dryve line beside it.
 * Dryve's blue is hard to read on a dark page, so there its logo sits on a small white tag.
 */
export function Brand({ className, tagline = true }: { className?: string; tagline?: boolean }) {
  const art = tagline ? "logo" : "mark";
  const size = tagline ? "h-12" : "h-7";
  return (
    <span className={cn(tagline ? "flex flex-col items-start gap-2" : "flex items-center gap-3", className)}>
      <span className="flex shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/brand/mad-${art}-dark.png`} alt="Manila Auto Display" className={cn(size, "w-auto shrink-0 dark:hidden")} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/brand/mad-${art}-light.png`} alt="" aria-hidden className={cn(size, "hidden w-auto shrink-0 dark:block")} />
      </span>
      <span className={cn("flex items-center gap-1.5 text-muted-foreground", tagline ? "pl-0.5" : "border-l pl-3")}>
        <span className={cn("leading-none tracking-wide", tagline ? "text-[11px]" : "text-[10px]")}>Powered by</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/dryve-logo.png" alt="Dryve" className={cn("w-auto shrink-0 rounded-sm dark:bg-white/95 dark:px-1.5 dark:py-0.5", tagline ? "h-5" : "h-4")} />
      </span>
    </span>
  );
}
