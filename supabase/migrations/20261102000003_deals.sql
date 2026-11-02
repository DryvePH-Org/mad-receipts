-- Deals: one sale of one unit to one buyer.
create table public.deals (
  id uuid primary key default gen_random_uuid(),
  plate_no text not null check (plate_no ~ '^[A-Z0-9]+$'), -- normalized: uppercase, no spaces/dashes
  make_type text,
  color text,
  motor_no text,
  chassis_no text,
  buyer_name text not null,
  buyer_address text,
  buyer_contact text,
  agreed_price numeric(12, 2) not null check (agreed_price > 0),
  total_paid numeric(12, 2) not null default 0 check (total_paid >= 0),
  balance numeric(12, 2) not null check (balance >= 0),
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  cancel_reason text,
  forfeited boolean not null default false,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_paid <= agreed_price),
  check (balance = agreed_price - total_paid)
);

-- Only one open deal per plate.
create unique index deals_one_open_per_plate on public.deals (plate_no) where status = 'open';
create index deals_plate_no_idx on public.deals (plate_no);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger deals_set_updated_at
  before update on public.deals
  for each row execute function public.set_updated_at();
