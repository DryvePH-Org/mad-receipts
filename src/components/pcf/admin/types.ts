export type FundRow = {
  id: string;
  name: string;
  amount: string;
  per_txn_limit: string;
  approval_threshold: string;
  low_balance_pct: number;
  custodian_ids: string[];
  custodian_names: string[];
};

export type CustodianOption = {
  id: string;
  full_name: string;
};

export type CategoryRow = {
  id: string;
  name: string;
  is_active: boolean;
};

export type FundAssignmentOption = {
  id: string;
  name: string;
  amount: string;
  custodian_ids: string[];
  custodian_names: string[];
};
