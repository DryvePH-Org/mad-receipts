-- 24 Nov 2026, FILE 6: run this BEFORE pushing the step 4 code. It only ADDS the About-the-car columns to the car record and copies the answers into them; nothing is removed.
-- Same text as supabase/migrations/20261124000063_car_details_on_record.sql.

begin;

-- Step 4 of the clean database (Docs/DATABASE_PLAN.md): the "About the car" answers (which owner, casa maintenance, battery, the dealership it was bought from,
-- EV extras, the note) were one JSON blob per plate in unit_details. Each is one fact per car, so each becomes a column of the car record, with the rest of its
-- facts. The blob stays untouched until migration 64 (it keeps each blob first in car_dropped_values, then removes the table).
-- The spare key is already a column of the car record (spare_key), so the blob's copy is only used to fill it when it is empty.
-- Run this BEFORE pushing the code that reads the columns.

alter table public.docs_units
  add column if not exists owner_no smallint check (owner_no is null or (owner_no between 1 and 30)),
  add column if not exists casa_maintained text check (casa_maintained is null or casa_maintained in ('yes', 'no')),
  add column if not exists casa_when text,
  add column if not exists casa_where text,
  add column if not exists battery_when text,
  add column if not exists bought_from text,
  add column if not exists ev_type text check (ev_type is null or ev_type in ('ev', 'phev')),
  add column if not exists wall_charger text check (wall_charger is null or wall_charger in ('yes', 'no')),
  add column if not exists portable_charger text check (portable_charger is null or portable_charger in ('yes', 'no')),
  add column if not exists key_card text check (key_card is null or key_card in ('yes', 'no')),
  add column if not exists charging_card text check (charging_card is null or charging_card in ('yes', 'no')),
  add column if not exists condition_note text check (condition_note is null or char_length(condition_note) <= 300);

-- copy each blob onto the car's current record (the latest arrival of the plate)
alter table public.docs_units disable trigger docs_units_track_trg;
alter table public.docs_units disable trigger docs_units_set_updated_at;
update public.docs_units u set
  owner_no = case when (d.data ->> 'ownerNo') ~ '^[0-9]+$' and (d.data ->> 'ownerNo')::int between 1 and 30 then (d.data ->> 'ownerNo')::smallint end,
  casa_maintained = case when d.data ->> 'casaMaintained' in ('yes', 'no') then d.data ->> 'casaMaintained' end,
  casa_when = nullif(btrim(d.data ->> 'casaWhen'), ''),
  casa_where = nullif(btrim(d.data ->> 'casaWhere'), ''),
  battery_when = nullif(btrim(d.data ->> 'batteryWhen'), ''),
  bought_from = nullif(btrim(d.data ->> 'boughtFrom'), ''),
  ev_type = case when d.data ->> 'evType' in ('ev', 'phev') then d.data ->> 'evType' when (d.data ->> 'isEv') = 'true' then 'ev' end,
  wall_charger = case when d.data ->> 'wallCharger' in ('yes', 'no') then d.data ->> 'wallCharger' end,
  portable_charger = case when d.data ->> 'portableCharger' in ('yes', 'no') then d.data ->> 'portableCharger' end,
  key_card = case when d.data ->> 'keyCard' in ('yes', 'no') then d.data ->> 'keyCard' end,
  charging_card = case when d.data ->> 'chargingCard' in ('yes', 'no') then d.data ->> 'chargingCard' end,
  condition_note = nullif(left(btrim(d.data ->> 'note'), 300), ''),
  spare_key = coalesce(u.spare_key, case d.data ->> 'spareKey' when 'yes' then 'W/SPAREKEY' when 'no' then 'W/O SPAREKEY' end)
from public.unit_details d
where u.plate_no = d.plate_no and u.id = (select c.id from public.docs_units c where c.plate_no = d.plate_no and c.archived_at is null order by c.arrival_date desc nulls last, c.created_at desc limit 1);
alter table public.docs_units enable trigger docs_units_track_trg;
alter table public.docs_units enable trigger docs_units_set_updated_at;

-- the current-car view lists every column of the table, so it is made again to include the new ones
drop view if exists public.docs_units_current;
create view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units where archived_at is null order by plate_no, arrival_date desc nulls last, created_at desc;
revoke all on public.docs_units_current from anon, authenticated;

commit;
