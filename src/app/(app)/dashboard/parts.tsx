import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const peso = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `₱${Math.round(n).toLocaleString("en-US")}`);
export const names = (list: string[]) => (list.length ? list.map((n) => n.charAt(0) + n.slice(1).toLowerCase()).join(" / ") : "—");

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl p-3 ring-1 ring-foreground/10 sm:p-4">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:text-xs">{label}</p>
      <p className={cn("text-xl font-semibold tracking-tight tabular-nums sm:text-2xl", tone)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** A titled block with an optional count, and a sentence saying what it shows. */
export function Section({ title, count, hint, children }: { title: string; count?: number; hint?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline gap-2">{title}{count !== undefined && <span className="text-sm font-normal text-muted-foreground tabular-nums">{count}</span>}</CardTitle>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

/** A table that scrolls sideways on a phone instead of squeezing. */
export function Grid({ head, rows, right = [] }: { head: string[]; rows: ReactNode[][]; right?: number[] }) {
  return (
    <div className="-mx-2 overflow-x-auto">
      <Table>
        <TableHeader><TableRow>{head.map((h, i) => <TableHead key={h} className={cn("whitespace-nowrap", right.includes(i) && "text-right")}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map((cells, r) => (
            <TableRow key={r}>{cells.map((c, i) => <TableCell key={i} className={cn("align-top whitespace-normal", i === 0 && "font-medium", right.includes(i) && "text-right tabular-nums")}>{c}</TableCell>)}</TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function SheetProblem({ message, url }: { message: string; url: string }) {
  return (
    <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p className="font-medium text-destructive">The sheet could not be read</p>
      <p>{message}</p>
      <a href={url} target="_blank" rel="noreferrer" className="underline">Open the sheet</a>
    </div>
  );
}
