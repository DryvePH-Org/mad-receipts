-- 24 Nov 2026, SECOND: run this AFTER the new code is pushed and deployed. One run, all or nothing.
-- It keeps every value it removes in car_dropped_values first. Same text as supabase/migrations 53, 54, 55, 56 and 58, in that order.

begin;

-- Step 1a of the clean database (Docs/DATABASE_PLAN.md): the six "list_*" copies of identity fields (model, color, mileage, fuel, arrival date,
-- encumbrance) existed only so the screens looked like the old price list. The car record's own field is the one value now.
-- Nothing is lost: every non-empty copy is first kept, one row per value, in car_dropped_values (read only, never read by the app).
-- Run this AFTER the code that no longer reads the copies is deployed.

create table if not exists public.car_dropped_values (
  id bigint generated always as identity primary key,
  unit_id uuid,
  plate_no text,
  column_name text not null,
  value text,
  dropped_on date not null default current_date,
  reason text not null
);
alter table public.car_dropped_values enable row level security;
revoke all on public.car_dropped_values from anon, authenticated;

insert into public.car_dropped_values (unit_id, plate_no, column_name, value, reason)
select u.id, u.plate_no, c.col, c.val, 'price list copy, replaced by the car record'
from public.docs_units u
cross join lateral (values
  ('list_model', u.list_model), ('list_color', u.list_color), ('list_mileage', u.list_mileage), ('list_fuel', u.list_fuel),
  ('list_arrived_on', u.list_arrived_on::text), ('list_encumbrance', u.list_encumbrance)
) as c(col, val)
where c.val is not null;

-- the current-car view lists every column of the table, so it is made again around the drop
drop view if exists public.docs_units_current;
alter table public.docs_units
  drop column if exists list_model, drop column if exists list_color, drop column if exists list_mileage,
  drop column if exists list_fuel, drop column if exists list_arrived_on, drop column if exists list_encumbrance;
create view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units where archived_at is null order by plate_no, arrival_date desc nulls last, created_at desc;
revoke all on public.docs_units_current from anon, authenticated;

-- Step 1b of the clean database (Docs/DATABASE_PLAN.md): a car has ONE status, stock_state. The two old Docs Bible columns (sale_status, vehicle_status)
-- were only worked out from it. Every car gets its state first (from the two columns where it has none), the old values are kept in car_dropped_values
-- (migration 53), then the columns and the view around them are rebuilt. Run this AFTER the code that no longer reads them is deployed.

update public.docs_units set stock_state = case
  when vehicle_status = 'SOLD' or sale_status = 'Sold' then 'Sold'
  when sale_status = 'Reserved' then 'Reserved'
  when vehicle_status = 'NOT FOR SALE' or sale_status = 'Not For Sale' then 'Not for sale'
  when vehicle_status = 'SHIPPED TO CEB' then 'Shipped to Cebu'
  else 'Onhand' end
where stock_state is null;

insert into public.car_dropped_values (unit_id, plate_no, column_name, value, reason)
select u.id, u.plate_no, c.col, c.val, 'old status column, replaced by stock_state'
from public.docs_units u
cross join lateral (values ('sale_status', u.sale_status), ('vehicle_status', u.vehicle_status)) as c(col, val)
where c.val is not null;

-- the trigger no longer writes the two columns; it only clears who/when for a car that is neither reserved nor sold
create or replace function public.docs_units_state_sync() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.stock_state is distinct from 'Reserved' and new.stock_state is distinct from 'Sold' then new.state_for := null; new.state_on := null; end if;
  return new;
end $$;

drop view if exists public.docs_units_current;
alter table public.docs_units drop column if exists sale_status, drop column if exists vehicle_status;
create view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units where archived_at is null order by plate_no, arrival_date desc nulls last, created_at desc;
revoke all on public.docs_units_current from anon, authenticated;
alter table public.docs_units alter column stock_state set default 'Onhand';
alter table public.docs_units alter column stock_state set not null;

-- Step 1c of the clean database (Docs/DATABASE_PLAN.md): the OR expiry is one real date, or_expiry. The typed text (`renewal`) and the text that was not
-- a date (`or_expiry_raw`) were its old spelling. Every typed text that is not already a date is kept first in car_dropped_values (migration 53), then the
-- two columns and the trigger that kept them in step are removed. Run this AFTER the code that no longer reads them is deployed.

insert into public.car_dropped_values (unit_id, plate_no, column_name, value, reason)
select u.id, u.plate_no, c.col, c.val, 'old OR expiry text, replaced by the date or_expiry'
from public.docs_units u
cross join lateral (values ('renewal', u.renewal), ('or_expiry_raw', u.or_expiry_raw)) as c(col, val)
where c.val is not null and btrim(c.val) <> '' and (c.col = 'or_expiry_raw' or u.or_expiry is null or c.val <> u.or_expiry::text);

drop trigger if exists docs_units_or_expiry on public.docs_units;
drop function if exists public.docs_units_or_expiry();

drop view if exists public.docs_units_current;
alter table public.docs_units drop column if exists renewal, drop column if exists or_expiry_raw;
create view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units where archived_at is null order by plate_no, arrival_date desc nulls last, created_at desc;
revoke all on public.docs_units_current from anon, authenticated;

-- Step 1e (first part) of the clean database (Docs/DATABASE_PLAN.md): car_stock was the safety copy of the sale list fields kept when they moved onto the
-- car record (migration 40). Nothing reads it. Each row is kept first as one line of car_dropped_values (migration 53), then the table is removed.
-- Run this after migration 53.

insert into public.car_dropped_values (unit_id, plate_no, column_name, value, reason)
select s.unit_id, s.plate_no, 'car_stock row', to_jsonb(s)::text, 'the old sale list copy (migration 35), replaced by the car record'
from public.car_stock s;

drop table public.car_stock;

-- Step 1d, second part: the two old note columns are removed once the code reads `remarks` (migration 57). Each text is first kept in car_dropped_values
-- (migration 53). Run this AFTER the code is deployed and migrations 53 to 57 are applied.

insert into public.car_dropped_values (unit_id, plate_no, column_name, value, reason)
select u.id, u.plate_no, c.col, c.val, 'old note column, joined into remarks'
from public.docs_units u
cross join lateral (values ('remarks_1', u.remarks_1), ('remarks_2', u.remarks_2)) as c(col, val)
where c.val is not null and btrim(c.val) <> '';

drop view if exists public.docs_units_current;
alter table public.docs_units drop column if exists remarks_1, drop column if exists remarks_2;
create view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units where archived_at is null order by plate_no, arrival_date desc nulls last, created_at desc;
revoke all on public.docs_units_current from anon, authenticated;

commit;
