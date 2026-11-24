-- Step 5a, second part: the other_docs column is removed once the code no longer shows it and migration 65 has joined it into remarks. Each text is kept
-- first in car_dropped_values (migration 53). Run this AFTER the code is deployed.

insert into public.car_dropped_values (unit_id, plate_no, column_name, value, reason)
select u.id, u.plate_no, 'other_docs', u.other_docs, 'free note, joined into remarks (migration 65)'
from public.docs_units u where nullif(btrim(u.other_docs), '') is not null;

drop view if exists public.docs_units_current;
alter table public.docs_units drop column if exists other_docs;
create view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units where archived_at is null order by plate_no, arrival_date desc nulls last, created_at desc;
revoke all on public.docs_units_current from anon, authenticated;
