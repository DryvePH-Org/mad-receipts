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
