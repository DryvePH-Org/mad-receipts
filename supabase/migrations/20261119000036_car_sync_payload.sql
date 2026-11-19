-- A car that is on the price list but not in the Docs Bible keeps its price list row on the check item, so a person can add the car
-- (or link it to the right plate) from the Price list check without the workbook.
alter table public.car_sync_items add column if not exists payload jsonb;
