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
