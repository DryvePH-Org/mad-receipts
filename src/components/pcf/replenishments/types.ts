import type { ReplenishmentStatus } from "@/lib/pcf/replenishment-status";

export type ReplenishmentListRow = {
  id: string;
  request_no: string;
  fund_name: string;
  status: ReplenishmentStatus;
  total: string;
  voucher_count: number;
  requested_by_name: string;
  created_at: string;
};

export type ReplenishmentFundOption = {
  fund_id: string;
  fund_name: string;
  voucher_count: number;
  total: string;
};

export type ReplenishmentVoucherRow = {
  id: string;
  pcv_number: string;
  voucher_date: string;
  payee: string;
  particulars: string;
  amount: string;
  category_id: string;
  category_name: string;
  lines: { amount: string; category_name: string }[];
  receipt_url: string | null;
  no_receipt_reason: string | null;
};
