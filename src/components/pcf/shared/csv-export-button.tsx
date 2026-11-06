"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/pcf/csv";

export function CsvExportButton({
  filename,
  header,
  rows,
  label = "Export CSV",
}: {
  filename: string;
  header: string[];
  rows: (string | number)[][];
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={rows.length === 0}
      onClick={() => downloadCsv(filename, header, rows)}
    >
      <Download />
      {label}
    </Button>
  );
}
