-- Receipts: one payment on a deal. Never deleted, only voided.
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id),
  receipt_no text not null unique,
  receipt_date date,
  amount numeric(12, 2) not null check (amount > 0),
  payment_type text not null check (payment_type in ('earnest', 'partial', 'full')),
  paper_payment_type text check (paper_payment_type in ('earnest', 'partial', 'full')),
  payment_method text check (payment_method in ('cash', 'check')),
  check_no text,
  bank_branch text,
  balance_after numeric(12, 2) not null check (balance_after >= 0),
  balance_due_date date,
  amount_words text,
  balance_words text,
  photo_path text,
  drive_file_id text,
  extraction_raw jsonb,
  status text not null default 'confirmed' check (status in ('confirmed', 'voided')),
  void_reason text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index receipts_deal_id_idx on public.receipts (deal_id, created_at);
create index receipts_balance_due_date_idx on public.receipts (balance_due_date);
