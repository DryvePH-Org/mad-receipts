import type { VoucherStatus } from "@/lib/pcf/voucher-status";

export type FundOption = {
  id: string;
  name: string;
  per_txn_limit: string;
  approval_threshold: string;
};

export type CategoryOption = {
  id: string;
  name: string;
};

export type VoucherListRow = {
  id: string;
  pcv_number: string;
  voucher_date: string;
  payee: string;
  particulars: string;
  amount: string;
  status: VoucherStatus;
  category_name: string;
  fund_name: string;
};
