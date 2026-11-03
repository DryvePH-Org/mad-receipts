import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE } from "@/lib/search";

/** Previous / next links that keep the current search and filters. */
export function Pagination({
  page,
  total,
  path,
  params,
}: {
  page: number;
  total: number;
  path: string;
  params: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (target: number) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    if (target > 1) query.set("page", String(target));
    const text = query.toString();
    return text ? `${path}?${text}` : path;
  };

  return (
    <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Pages">
      {page > 1 ? (
        <Button render={<Link href={href(page - 1)} />} nativeButton={false} variant="outline" className="h-11">
          Previous
        </Button>
      ) : (
        <span className="w-24" />
      )}
      <span className="text-sm text-muted-foreground">
        Page {Math.min(page, pages)} of {pages}
      </span>
      {page < pages ? (
        <Button render={<Link href={href(page + 1)} />} nativeButton={false} variant="outline" className="h-11">
          Next
        </Button>
      ) : (
        <span className="w-24" />
      )}
    </nav>
  );
}
