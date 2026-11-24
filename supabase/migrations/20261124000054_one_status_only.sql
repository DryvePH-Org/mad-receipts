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
