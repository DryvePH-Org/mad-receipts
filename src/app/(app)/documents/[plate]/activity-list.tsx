import type { ActivityEntry } from "@/lib/docs/activity-text";

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/** What people did on this car's documents: the date and time (Manila), who, and what. Newest first. */
export function ActivityList({ entries, first = 6 }: { entries: ActivityEntry[]; first?: number }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">Nothing has been recorded for this car yet. What people do here (uploads, checks, approval, the sale, payments) is listed with the date and time.</p>;
  const row = (e: ActivityEntry) => (
    <li key={e.id} className="flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:gap-3">
      <time dateTime={e.at} className="shrink-0 text-xs text-muted-foreground sm:w-40 sm:pt-0.5">{when(e.at)}</time>
      <span className="min-w-0"><b className="font-medium">{e.who}</b> · {e.text}</span>
    </li>
  );
  const rest = entries.slice(first);
  return (
    <div>
      <ul className="divide-y" aria-label="Activity on this car">{entries.slice(0, first).map(row)}</ul>
      {rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer py-2 text-xs text-muted-foreground underline-offset-2 hover:underline group-open:hidden">Show {rest.length} older {rest.length === 1 ? "entry" : "entries"}</summary>
          <ul className="divide-y border-t">{rest.map(row)}</ul>
        </details>
      )}
    </div>
  );
}
