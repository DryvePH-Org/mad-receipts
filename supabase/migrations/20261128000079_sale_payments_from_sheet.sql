-- The sheet is the source of truth for sales and their payments (Sales Passbook, the monthly SALES MONITORING tabs). The sale stays ONE record
-- (car_sales); its payments are kept here, one row for each payment of the sheet (reservation, additional, full, financing, split).
-- Run this BEFORE pushing the code that fills it.

-- a sale record can now come from the sheet
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.car_sales'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%source%import%' loop
    execute format('alter table public.car_sales drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.car_sales add constraint car_sales_source_check check (source in ('import', 'app', 'sheet'));

create table if not exists public.car_sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.car_sales (id) on delete cascade,
  plate_no text not null,
  stage text not null check (stage in ('reservation', 'additional', 'full', 'financing', 'split')),
  bank text,
  paid_on date,
  amount numeric(14, 2) not null,
  ar_no text,
  source_tab text not null,
  source_row int not null,
  updated_at timestamptz not null default now(),
  unique (source_tab, source_row, stage)
);
create index if not exists car_sale_payments_sale on public.car_sale_payments (sale_id);
create index if not exists car_sale_payments_plate on public.car_sale_payments (plate_no);
alter table public.car_sale_payments enable row level security; -- read and written by the server only
