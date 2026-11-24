-- Step 1d of the clean database (Docs/DATABASE_PLAN.md): the two note columns of the register (REMARKS I and REMARKS II) become ONE note, `remarks`.
-- The two texts are joined (blank line between) and nothing is dropped here: remarks_1 and remarks_2 stay, untouched, until migration 58 removes them.
-- Run this BEFORE pushing the code that reads `remarks`.

alter table public.docs_units add column if not exists remarks text;

alter table public.docs_units disable trigger docs_units_track_trg;
alter table public.docs_units disable trigger docs_units_set_updated_at;
update public.docs_units set remarks = nullif(concat_ws(E'\n\n', nullif(btrim(remarks_1), ''), nullif(btrim(remarks_2), '')), '')
  where remarks is null and (remarks_1 is not null or remarks_2 is not null);
alter table public.docs_units enable trigger docs_units_track_trg;
alter table public.docs_units enable trigger docs_units_set_updated_at;

-- the current-car view lists every column of the table, so it is made again to include the new one
drop view if exists public.docs_units_current;
create view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units where archived_at is null order by plate_no, arrival_date desc nulls last, created_at desc;
revoke all on public.docs_units_current from anon, authenticated;
