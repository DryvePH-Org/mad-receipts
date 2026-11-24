-- Step 3b, second part: the temporary view with the old name is removed. Run this AFTER the code that says car_sales is deployed and migration 60 is applied.

drop view if exists public.car_transfers;
