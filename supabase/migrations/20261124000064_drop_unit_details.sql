-- Step 4, second part: the About-the-car blobs are removed once the code reads the car record (migration 63). Each blob is kept first, whole, in
-- car_dropped_values (migration 53). Run this AFTER the code is deployed and migration 63 is applied.

insert into public.car_dropped_values (unit_id, plate_no, column_name, value, reason)
select null, d.plate_no, 'unit_details blob', d.data::text, 'the About-the-car answers, now columns of the car record (migration 63)'
from public.unit_details d;

drop table public.unit_details;
