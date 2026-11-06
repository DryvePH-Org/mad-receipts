import { formatDate, formatDateTime } from "@/lib/pcf/dates";
import { formatPHP } from "@/lib/pcf/money";
import { REPLENISHMENT_STATUS_LABELS } from "@/lib/pcf/replenishment-status";
import type { ReplenishmentStatus } from "@/lib/pcf/replenishment-status";

type PrintVoucher = {
  pcv_number: string;
  voucher_date: string;
  payee: string;
  category_name: string;
  amount: string;
};

type PrintCategoryTotal = {
  name: string;
  amount: string;
};

export function ReplenishmentPrint({
  requestNo,
  fundName,
  createdAt,
  status,
  total,
  vouchers,
  categoryTotals,
  requestedByName,
  reviewedByName,
  reviewedAt,
  reviewNote,
}: {
  requestNo: string;
  fundName: string;
  createdAt: string;
  status: ReplenishmentStatus;
  total: string;
  vouchers: PrintVoucher[];
  categoryTotals: PrintCategoryTotal[];
  requestedByName: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}) {
  return (
    <div className="mx-auto max-w-3xl bg-white p-2 text-black">
      <div className="border-2 border-black p-6">
        <div className="flex items-start justify-between gap-6 border-b-2 border-black pb-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase">
              Replenishment Request
            </p>
            <h1 className="mt-1 text-xl font-bold">{fundName}</h1>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold tracking-[0.2em] uppercase">
              Request No.
            </p>
            <p className="font-mono text-lg font-bold">{requestNo}</p>
            <p className="mt-1 text-[10px] uppercase">
              Status: {REPLENISHMENT_STATUS_LABELS[status]}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <Field label="Requested" value={formatDate(createdAt)} />
          <Field label="Vouchers" value={String(vouchers.length)} />
          <Field label="Total" value={formatPHP(total)} />
        </div>

        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-black px-2 py-1 text-left font-semibold">
                PCV No.
              </th>
              <th className="border border-black px-2 py-1 text-left font-semibold">
                Date
              </th>
              <th className="border border-black px-2 py-1 text-left font-semibold">
                Payee
              </th>
              <th className="border border-black px-2 py-1 text-left font-semibold">
                Category
              </th>
              <th className="w-32 border border-black px-2 py-1 text-right font-semibold">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {vouchers.map((voucher) => (
              <tr key={voucher.pcv_number}>
                <td className="border border-black px-2 py-1 font-mono">
                  {voucher.pcv_number}
                </td>
                <td className="border border-black px-2 py-1">
                  {formatDate(voucher.voucher_date)}
                </td>
                <td className="border border-black px-2 py-1">
                  {voucher.payee}
                </td>
                <td className="border border-black px-2 py-1">
                  {voucher.category_name}
                </td>
                <td className="border border-black px-2 py-1 text-right font-mono">
                  {formatPHP(voucher.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td
                colSpan={4}
                className="border border-black px-2 py-1 text-right font-semibold"
              >
                Total
              </td>
              <td className="border border-black px-2 py-1 text-right font-mono font-bold">
                {formatPHP(total)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-4">
          <p className="text-[10px] font-semibold tracking-[0.15em] uppercase">
            Totals by category
          </p>
          <table className="mt-1 w-full border-collapse text-sm">
            <tbody>
              {categoryTotals.map((category) => (
                <tr key={category.name}>
                  <td className="border border-black px-2 py-1">
                    {category.name}
                  </td>
                  <td className="w-32 border border-black px-2 py-1 text-right font-mono">
                    {formatPHP(category.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {reviewNote ? (
          <p className="mt-3 text-xs">
            <span className="font-semibold">Review note: </span>
            {reviewNote}
          </p>
        ) : null}

        <div className="mt-10 grid grid-cols-3 gap-8 text-xs">
          <Signature
            label="Requested by"
            name={requestedByName}
            date={formatDateTime(createdAt)}
          />
          <Signature
            label="Reviewed by"
            name={reviewedByName ?? ""}
            date={reviewedAt ? formatDateTime(reviewedAt) : undefined}
          />
          <Signature label="Received by" name="" />
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.15em] uppercase">
        {label}
      </p>
      <p className="border-b border-black pb-1 font-medium">{value}</p>
    </div>
  );
}

function Signature({
  label,
  name,
  date,
}: {
  label: string;
  name: string;
  date?: string;
}) {
  return (
    <div className="break-inside-avoid">
      <p className="border-b border-black pb-1 text-center text-[11px] font-medium">
        {name || "\u00a0"}
      </p>
      <p className="mt-1 text-center text-[10px] uppercase">{label}</p>
      {date ? <p className="text-center text-[9px]">{date}</p> : null}
    </div>
  );
}
