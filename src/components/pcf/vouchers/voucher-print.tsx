import { amountInWords } from "@/lib/pcf/amount-words";
import { formatDate, formatDateTime } from "@/lib/pcf/dates";
import { formatPHP } from "@/lib/pcf/money";
import { VOUCHER_STATUS_LABELS } from "@/lib/pcf/voucher-status";
import type { VoucherStatus } from "@/lib/pcf/voucher-status";

// Laid out like the paper Petty Cash Voucher: title, date, "To:", a
// particulars / amount table and two signature lines.
export function VoucherPrint({
  pcvNumber,
  fundName,
  voucherDate,
  payee,
  lines,
  amount,
  status,
  preparedByName,
  approvedByName,
  approvedAt,
  releasedAt,
  noReceiptReason,
  voidReason,
}: {
  pcvNumber: string;
  fundName: string;
  voucherDate: string;
  payee: string;
  lines: { particulars: string; amount: string; category_name: string }[];
  amount: string;
  categoryName: string;
  status: VoucherStatus;
  preparedByName: string;
  approvedByName: string | null;
  approvedAt: string | null;
  releasedAt: string | null;
  noReceiptReason: string | null;
  voidReason: string | null;
}) {
  const multiple = lines.length > 1;
  return (
    <div className="mx-auto max-w-3xl bg-white p-2 text-black">
      <div className="border-2 border-black p-6">
        <div className="flex items-start justify-between gap-6">
          <p className="text-[10px] uppercase">{fundName}</p>
          <div className="text-right text-[10px] uppercase">
            <p>
              PCV No. <span className="font-mono text-sm font-bold">{pcvNumber}</span>
            </p>
            <p>Status: {VOUCHER_STATUS_LABELS[status]}</p>
          </div>
        </div>

        <h1 className="mt-2 border-b-4 border-black pb-1 text-center text-2xl font-bold tracking-[0.2em] uppercase">
          Petty Cash Voucher
        </h1>

        <p className="mt-5 text-right text-sm">
          <span className="inline-block min-w-56 border-b border-black pb-0.5 text-center font-medium">
            {formatDate(voucherDate)}
          </span>
        </p>

        <p className="mt-4 flex items-end gap-2 text-sm">
          <span className="font-semibold italic">To:</span>
          <span className="flex-1 border-b border-black pb-0.5 font-medium">
            {payee}
          </span>
        </p>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-black px-2 py-1 text-center font-semibold tracking-[0.3em] uppercase">
                Particulars
              </th>
              {multiple ? (
                <th className="w-36 border border-black px-2 py-1 text-left font-semibold">
                  Category
                </th>
              ) : null}
              <th className="w-36 border border-black px-2 py-1 text-right font-semibold">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td className="border border-black px-2 py-2 align-top whitespace-pre-wrap">
                  {line.particulars}
                </td>
                {multiple ? (
                  <td className="border border-black px-2 py-2 align-top text-xs">
                    {line.category_name}
                  </td>
                ) : null}
                <td className="border border-black px-2 py-2 text-right align-top font-mono">
                  {formatPHP(line.amount)}
                </td>
              </tr>
            ))}
            {/* Blank rows keep the sheet looking like the paper form. */}
            {Array.from({ length: Math.max(0, 6 - lines.length) }, (_, index) => (
              <tr key={`blank-${index}`}>
                <td className="h-9 border border-black" />
                {multiple ? <td className="border border-black" /> : null}
                <td className="border border-black" />
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td
                colSpan={multiple ? 2 : 1}
                className="border border-black px-2 py-1 text-right font-semibold"
              >
                Total
              </td>
              <td className="border border-black px-2 py-1 text-right font-mono font-bold">
                {formatPHP(amount)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-3 text-sm">
          <span className="font-semibold">Amount in words: </span>
          {amountInWords(amount)}
        </p>

        {noReceiptReason ? (
          <p className="mt-2 text-xs">
            <span className="font-semibold">No receipt: </span>
            {noReceiptReason}
          </p>
        ) : null}

        {voidReason ? (
          <p className="mt-2 text-xs">
            <span className="font-semibold">Voided: </span>
            {voidReason}
          </p>
        ) : null}

        <div className="mt-12 grid grid-cols-2 gap-10 text-sm">
          <Signature
            label="Approved for payment:"
            name={approvedByName ?? ""}
            note={approvedAt ? formatDateTime(approvedAt) : undefined}
          />
          <Signature label="Received payment:" name="" />
        </div>

        <p className="mt-6 text-[10px] text-neutral-600">
          Prepared by {preparedByName}
          {releasedAt ? ` · cash released ${formatDateTime(releasedAt)}` : ""}
        </p>
      </div>
    </div>
  );
}

function Signature({
  label,
  name,
  note,
}: {
  label: string;
  name: string;
  note?: string;
}) {
  return (
    <div className="break-inside-avoid">
      <p className="font-semibold italic">{label}</p>
      <p className="mt-8 border-b border-black pb-1 text-center text-xs font-medium">
        {name || " "}
      </p>
      {note ? <p className="mt-1 text-center text-[9px]">{note}</p> : null}
    </div>
  );
}
