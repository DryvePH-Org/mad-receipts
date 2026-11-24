-- Step 1e (first part) of the clean database (Docs/DATABASE_PLAN.md): car_stock was the safety copy of the sale list fields kept when they moved onto the
-- car record (migration 40). Nothing reads it. Each row is kept first as one line of car_dropped_values (migration 53), then the table is removed.
-- Run this after migration 53.

insert into public.car_dropped_values (unit_id, plate_no, column_name, value, reason)
select s.unit_id, s.plate_no, 'car_stock row', to_jsonb(s)::text, 'the old sale list copy (migration 35), replaced by the car record'
from public.car_stock s;

drop table public.car_stock;
