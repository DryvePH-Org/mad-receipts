import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

/**
 * A list that is a stack of cards on phones and tablets and a real table from `lg` (1024 px).
 * `getRowHref` makes the whole table row a link (through the first column).
 */
export function ResponsiveList<T>({
  rows,
  getRowKey,
  columns,
  renderCard,
  getRowHref,
  empty,
}: {
  rows: T[];
  getRowKey: (row: T) => string;
  columns: Column<T>[];
  renderCard: (row: T) => React.ReactNode;
  getRowHref?: (row: T) => string;
  empty: React.ReactNode;
}) {
  if (rows.length === 0) return <>{empty}</>;

  return (
    <>
      <ul className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <li key={getRowKey(row)}>{renderCard(row)}</li>
        ))}
      </ul>

      <div className="hidden rounded-xl bg-card ring-1 ring-foreground/10 lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.key} className={column.headerClassName}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={getRowKey(row)} className={cn("relative", getRowHref && "hover:bg-muted/50")}>
                {columns.map((column, index) => (
                  <TableCell key={column.key} className={column.className}>
                    {index === 0 && getRowHref ? (
                      <Link href={getRowHref(row)} className="font-medium after:absolute after:inset-0 hover:underline">
                        {column.cell(row)}
                      </Link>
                    ) : (
                      column.cell(row)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
