-- The MAD Price List in the database. The car's identity (brand, model, year, color, spare key...) stays in the Docs Bible row (docs_units);
-- this adds only what the price list alone knew: prices, where the car is, repair state, and the sheet's own notes. Plus the two small lists
-- that lived in the same workbook (repairs, OR renewals). Read and written by the server only (service role): RLS on, no policies.

create table public.car_stock (
  unit_id uuid primary key references public.docs_units (id) on delete cascade,   -- the car (its current arrival in the Docs Bible)
  plate_no text not null check (plate_no = upper(plate_no) and plate_no ~ '^[A-Z0-9]+$'),
  body_group text,                                -- the heading the sheet put the car under: HATCHBACK, SEDAN, SUV/MPV...
  sort_order integer not null default 0,          -- its place in the sheet, so the Excel export keeps the same order
  list_price numeric(12, 2) check (list_price is null or list_price >= 0),
  target_price numeric(12, 2) check (target_price is null or target_price >= 0),
  reprice numeric(12, 2) check (reprice is null or reprice >= 0),
  retarget numeric(12, 2) check (retarget is null or retarget >= 0),
  or_expiry date,
  or_expiry_raw text,                             -- what was typed, when it was not a clear date
  -- What the price list showed where it differs from the Docs Bible row (empty = the Docs Bible value is shown). Nothing the sheet said is lost,
  -- and the Excel export reads exactly as the sheet did. The review list asks the staff to settle real disagreements.
  list_model text, list_color text, list_mileage text, list_fuel text, list_arrived_on date, list_encumbrance text,
  papers_with text,                               -- the sheet's DOCS column, as typed (C, K, EW...): the staff say what it means
  tools text,
  location text,                                  -- as typed: ROSE MARY, CLEMENTE, MANILA UNIT TO CEBU
  repair_status text,
  remarks text,                                   -- the sheet's REMARKS text, as it was (RESERVED - NAME 11/2, FOR REPAIR - ...)
  in_stock boolean not null default true,
  source text not null default 'import' check (source in ('import', 'app')),
  raw jsonb,                                      -- the original cells of the imported row
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.car_stock enable row level security;
create unique index car_stock_plate_in_stock on public.car_stock (plate_no) where in_stock;
create index car_stock_order on public.car_stock (sort_order);

-- Every price change, so "by price" and "repriced" are views and never typed copies. Filled by a trigger, whoever or whatever changes the row.
create table public.car_price_history (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.docs_units (id) on delete cascade,
  plate_no text not null,
  field text not null check (field in ('list_price', 'target_price', 'reprice', 'retarget')),
  old_value numeric(12, 2),
  new_value numeric(12, 2),
  changed_by uuid references public.profiles (id),
  changed_at timestamptz not null default now()
);
alter table public.car_price_history enable row level security;
create index car_price_history_unit on public.car_price_history (unit_id, changed_at desc);

create function public.car_stock_history() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.list_price is distinct from new.list_price then
    insert into public.car_price_history (unit_id, plate_no, field, old_value, new_value, changed_by) values (new.unit_id, new.plate_no, 'list_price', old.list_price, new.list_price, new.updated_by);
  end if;
  if old.target_price is distinct from new.target_price then
    insert into public.car_price_history (unit_id, plate_no, field, old_value, new_value, changed_by) values (new.unit_id, new.plate_no, 'target_price', old.target_price, new.target_price, new.updated_by);
  end if;
  if old.reprice is distinct from new.reprice then
    insert into public.car_price_history (unit_id, plate_no, field, old_value, new_value, changed_by) values (new.unit_id, new.plate_no, 'reprice', old.reprice, new.reprice, new.updated_by);
  end if;
  if old.retarget is distinct from new.retarget then
    insert into public.car_price_history (unit_id, plate_no, field, old_value, new_value, changed_by) values (new.unit_id, new.plate_no, 'retarget', old.retarget, new.retarget, new.updated_by);
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger car_stock_history before update on public.car_stock for each row execute function public.car_stock_history();

-- The repairs list (the REPAIRS REPORT tab).
create table public.car_repairs (
  id uuid primary key default gen_random_uuid(),
  plate_no text not null,
  ym text, brand text,
  problem text, happened_on date, happened_raw text, solution text,
  supplier text, company text, est_timeline text, status text, bot_id text, approved_by text,
  sort_order integer not null default 0,
  source text not null default 'import' check (source in ('import', 'app')),
  raw jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.car_repairs enable row level security;
create index car_repairs_plate on public.car_repairs (plate_no);

-- The OR renewal list (the FOR RENEWAL tab). "Days late" is worked out when shown, never stored.
create table public.or_renewals (
  id uuid primary key default gen_random_uuid(),
  plate_no text not null,
  month_label text, or_expiry date, or_expiry_raw text, location text,
  notes text[] not null default '{}',             -- REMARKS I to VI, in order, blanks left out
  sort_order integer not null default 0,
  source text not null default 'import' check (source in ('import', 'app')),
  raw jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.or_renewals enable row level security;
create index or_renewals_plate on public.or_renewals (plate_no);

-- The price list check: every place where the price list and the Docs Bible do not say the same thing about a car, one row per car and field,
-- with both values side by side. The staff settle each one (use the price list's value, use the Docs Bible's, or note it); nothing is silently fixed.
create table public.car_sync_items (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.docs_units (id) on delete cascade,
  plate_no text,
  field text not null check (field in ('arrival_date', 'model', 'color', 'mileage', 'fuel', 'encumbrance', 'year', 'brand', 'trans', 'spare_key', 'status', 'docs_code', 'unmatched', 'odd_value')),
  list_value text,                                -- what the price list says
  docs_value text,                                -- what the Docs Bible says
  message text not null,
  source_row integer,                             -- the row of the price list workbook
  status text not null default 'open' check (status in ('open', 'settled')),
  decision text,                                  -- 'list' (the price list's value was used), 'docs' (the Docs Bible's), or 'noted'
  settled_by uuid references public.profiles (id),
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.car_sync_items enable row level security;
create index car_sync_items_open on public.car_sync_items (status, plate_no);
