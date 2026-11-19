-- Two facts of the old REMARKS register that nothing else held, now fields of the car record (Car documents): where the original papers are
-- ("papers with": C, L:ORIG ORCR-KAREN...) and the registry of deeds (QC, MANILA, MARIKINA...). "Papers with" used to sit on the stock row (the DOCS column of
-- the price list); it moves to the car record so it is stored once. The stock row's own column stays for now and is dropped in the cleanup that follows
-- the cut-over (its original value is also kept in the saved original row).

alter table public.docs_units add column if not exists registry_of_deeds text;
alter table public.docs_units add column if not exists papers_with text;

-- the codes already on the stock rows move to their cars (history and updated-at stamps paused: the same value, in its proper place)
alter table public.docs_units disable trigger docs_units_track_trg;
alter table public.docs_units disable trigger docs_units_set_updated_at;
update public.docs_units u set papers_with = s.papers_with
  from public.car_stock s
  where s.unit_id = u.id and s.papers_with is not null and btrim(s.papers_with) <> '' and u.papers_with is null;
alter table public.docs_units enable trigger docs_units_track_trg;
alter table public.docs_units enable trigger docs_units_set_updated_at;

-- a view lists the columns the table had when it was made: refresh it so the new columns (and the OR date) are in it
create or replace view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units where archived_at is null order by plate_no, arrival_date desc nulls last, created_at desc;
