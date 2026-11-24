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
