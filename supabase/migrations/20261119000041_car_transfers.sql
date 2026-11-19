-- Transfers of the OR/CR to the buyer (the old ORCR WITH MAD tab, now records). One row per transfer, linked to the car record by plate. A car that is not in
-- the car record yet (older sales) is kept by its plate, with the car as the sheet described it, and is linked automatically when that car is added.
-- Read and written by the server only (service role): RLS on, no policies. Personal data of buyers: only Documentation, Approver and Admin see it.

create table public.car_transfers (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.docs_units (id) on delete set null,
  plate_no text not null check (plate_no = upper(plate_no) and plate_no ~ '^[A-Z0-9]+$'),
  car_text text,                                  -- the car as the sheet described it (year make model), for a car that has no record yet
  particular text,                                -- what is being done: ORCR TRANSFER, DUPLICATE PLATE...
  financing text,
  buyer text,
  address text,
  contact text,                                   -- as typed: a number, or a name and a number
  cr_date date,
  transaction_date date,
  liaison text,
  sales text,
  balance text,
  note text,
  done_on date,                                   -- when the transfer was finished (empty = still in process)
  source text not null default 'app' check (source in ('import', 'app')),
  sheet_row integer,
  raw jsonb,
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.car_transfers enable row level security;
create index car_transfers_plate on public.car_transfers (plate_no);
create index car_transfers_unit on public.car_transfers (unit_id);

-- a transfer waiting for its car is linked the moment the car is added
create function public.car_transfers_link() returns trigger language plpgsql set search_path = '' as $$
begin
  update public.car_transfers set unit_id = new.id where unit_id is null and plate_no = new.plate_no;
  return new;
end $$;
create trigger car_transfers_link after insert on public.docs_units for each row execute function public.car_transfers_link();
