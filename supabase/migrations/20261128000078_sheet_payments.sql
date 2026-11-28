-- A read-only copy of the 2026 Sales Passbook Monitoring sheet (deposit tabs of the bank accounts and the payments of the monthly sales tabs), refreshed from the sheet by the
-- app. The sheet is the master: MAD never writes to it and nobody edits these rows here. Used by the Payments tab of the Dashboard (Super Admin) so its charts do not wait
-- for Google, and later to compare what the bank shows with what the ARs say. Written and read by the server only: RLS stays on, no policies.

create table public.sheet_bank_lines (
  tab text not null,                 -- the sheet's tab, e.g. "BDO DEPOSIT MONITORING - 3321 (NOV2026)"
  row_no integer not null,           -- the row in that tab
  account text not null,             -- "BDO 3321", "Security Bank 5411"
  line_date date not null,
  tc text not null default '',
  ref text not null default '',      -- the code or check number written beside it
  particulars text not null default '',
  plate_no text not null default '',
  debit numeric(14, 2),
  credit numeric(14, 2),
  balance numeric(14, 2),
  remarks text not null default '',
  txn_type text not null default 'UNLABELLED',
  mode text not null default 'Other',
  note text not null default '',
  synced_at timestamptz not null default now(),
  primary key (tab, row_no)
);
alter table public.sheet_bank_lines enable row level security;
create index sheet_bank_lines_date on public.sheet_bank_lines (line_date);
create index sheet_bank_lines_plate on public.sheet_bank_lines (plate_no) where plate_no <> '';

create table public.sheet_sale_payments (
  tab text not null,
  row_no integer not null,
  stage text not null check (stage in ('reservation', 'additional', 'full', 'financing', 'split')),
  buyer text not null default '',
  plate_no text not null default '',
  sale_type text not null default '',
  agreed_price numeric(14, 2),
  bank text not null default '',
  pay_date date,
  amount numeric(14, 2) not null,
  ar_no text not null default '',
  synced_at timestamptz not null default now(),
  primary key (tab, row_no, stage)
);
alter table public.sheet_sale_payments enable row level security;
create index sheet_sale_payments_date on public.sheet_sale_payments (pay_date);
create index sheet_sale_payments_plate on public.sheet_sale_payments (plate_no) where plate_no <> '';

-- when each tab of the sheet was last copied, and how it went
create table public.sheet_sync_tabs (
  tab text primary key,
  kind text not null check (kind in ('bank', 'sales')),
  rows_copied integer not null default 0,
  synced_at timestamptz,
  error text
);
alter table public.sheet_sync_tabs enable row level security;
