-- One status per car. It is kept on the car record (stock_state, who it is reserved or sold for, and when). The two old Docs Bible columns (STATUS,
-- VEHICLE STATUS) are worked out from it by this trigger whenever a state is set, so they can never disagree again; the price list's REMARKS text is
-- only a note. Cars without a state yet (before the backfill) keep their old columns untouched.

alter table public.docs_units add column if not exists stock_state text
  check (stock_state is null or stock_state in ('Onhand', 'Reserved', 'Sold', 'Not for sale', 'For repair', 'Sell as is', 'Shipped to Cebu'));
alter table public.docs_units add column if not exists state_for text;
alter table public.docs_units add column if not exists state_on date;

create or replace function public.docs_units_state_sync() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.stock_state is not null then
    new.sale_status := case new.stock_state when 'Sold' then 'Sold' when 'Reserved' then 'Reserved' when 'Not for sale' then 'Not For Sale' else 'Onhand' end;
    new.vehicle_status := case new.stock_state when 'Sold' then 'SOLD' when 'Not for sale' then 'NOT FOR SALE' when 'Shipped to Cebu' then 'SHIPPED TO CEB' else 'AVAILABLE' end;
  end if;
  if new.stock_state is distinct from 'Reserved' and new.stock_state is distinct from 'Sold' then new.state_for := null; new.state_on := null; end if;
  return new;
end $$;
drop trigger if exists docs_units_state_sync on public.docs_units;
create trigger docs_units_state_sync before insert or update on public.docs_units for each row execute function public.docs_units_state_sync();

-- the stock row's REMARKS becomes only the note: its status part now lives in the state (the backfill script moves it, keeping the original in `raw`)

-- the car list view must list the new columns
create or replace view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units where archived_at is null order by plate_no, arrival_date desc nulls last, created_at desc;

-- a status the staff settle on the Data check
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.car_sync_items'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%arrival_date%' loop
    execute format('alter table public.car_sync_items drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.car_sync_items add constraint car_sync_items_field_check check (field in (
  'arrival_date', 'model', 'color', 'mileage', 'fuel', 'encumbrance', 'year', 'brand', 'trans', 'spare_key', 'status', 'docs_code', 'unmatched', 'odd_value', 'or_expiry'));
