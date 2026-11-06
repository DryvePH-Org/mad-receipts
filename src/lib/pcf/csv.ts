// Spreadsheet apps run cells that start with = + - @ as formulas, so a payee
// like "=HYPERLINK(...)" could exfiltrate data from whoever opens the export.
// Text cells get a leading apostrophe; real numbers are left alone.
function toCsvCell(value: string | number): string {
  const raw = String(value);
  const text =
    typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  header: string[],
  rows: (string | number)[][],
): string {
  return [header, ...rows]
    .map((row) => row.map(toCsvCell).join(","))
    .join("\r\n");
}

export function downloadCsv(
  filename: string,
  header: string[],
  rows: (string | number)[][],
) {
  const csv = toCsv(header, rows);
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
