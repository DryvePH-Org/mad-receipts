-- One table of cars. What the price list kept on its own stock row (prices, where the car is, tools, note, the sheet's section and order, and what the sheet
-- showed where it differs from the record) now lives on the car record itself (docs_units). Nothing is deleted here: car_stock stays, untouched, as the
-- safety copy until the cut-over is checked, and a later migration removes it. Run this BEFORE pushing the code that reads the new columns.

alter table public.docs_units add column if not exists in_stock boolean not null default false;   -- on the sale list now (what the stock row's in_stock was)
alter table public.docs_units add column if not exists body_group text;                          -- the section the sheet listed the car under
alter table public.docs_units add column if not exists stock_order integer not null default 0;   -- its place in the list
alter table public.docs_units add column if not exists list_price numeric(12, 2) check (list_price is null or list_price >= 0);
alter table public.docs_units add column if not exists target_price numeric(12, 2) check (target_price is null or target_price >= 0);
alter table public.docs_units add column if not exists reprice numeric(12, 2) check (reprice is null or reprice >= 0);
alter table public.docs_units add column if not exists retarget numeric(12, 2) check (retarget is null or retarget >= 0);
alter table public.docs_units add column if not exists tools text;
alter table public.docs_units add column if not exists location text;                            -- as typed: ROSE MARY, CLEMENTE...
alter table public.docs_units add column if not exists stock_note text;                          -- the note only; the status is the state
-- what the price list showed where it differs from the record (empty = the record's value is shown); the Data check settles them, then they are removed
alter table public.docs_units add column if not exists list_model text;
alter table public.docs_units add column if not exists list_color text;
alter table public.docs_units add column if not exists list_mileage text;
alter table public.docs_units add column if not exists list_fuel text;
alter table public.docs_units add column if not exists list_arrived_on date;
alter table public.docs_units add column if not exists list_encumbrance text;

create unique index if not exists docs_units_in_stock_plate on public.docs_units (plate_no) where in_stock;
create index if not exists docs_units_stock_order on public.docs_units (stock_order) where in_stock;

-- copy: one stock row per car record. Idempotent (re-running it copies again only what the record does not have yet).
alter table public.docs_units disable trigger docs_units_track_trg;
alter table public.docs_units disable trigger docs_units_set_updated_at;
update public.docs_units u set
  in_stock = s.in_stock, body_group = s.body_group, stock_order = s.sort_order,
  list_price = s.list_price, target_price = s.target_price, reprice = s.reprice, retarget = s.retarget,
  tools = s.tools, location = s.location, stock_note = s.remarks,
  list_model = s.list_model, list_color = s.list_color, list_mileage = s.list_mileage, list_fuel = s.list_fuel,
  list_arrived_on = s.list_arrived_on, list_encumbrance = s.list_encumbrance
from public.car_stock s
where s.unit_id = u.id and not u.in_stock and u.list_price is null and u.stock_note is null and u.location is null;
alter table public.docs_units enable trigger docs_units_track_trg;
alter table public.docs_units enable trigger docs_units_set_updated_at;

-- every price change is kept, as before, now from the car record
create or replace function public.docs_units_price_history() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.list_price is distinct from new.list_price then
    insert into public.car_price_history (unit_id, plate_no, field, old_value, new_value, changed_by) values (new.id, new.plate_no, 'list_price', old.list_price, new.list_price, new.updated_by);
  end if;
  if old.target_price is distinct from new.target_price then
    insert into public.car_price_history (unit_id, plate_no, field, old_value, new_value, changed_by) values (new.id, new.plate_no, 'target_price', old.target_price, new.target_price, new.updated_by);
  end if;
  if old.reprice is distinct from new.reprice then
    insert into public.car_price_history (unit_id, plate_no, field, old_value, new_value, changed_by) values (new.id, new.plate_no, 'reprice', old.reprice, new.reprice, new.updated_by);
  end if;
  if old.retarget is distinct from new.retarget then
    insert into public.car_price_history (unit_id, plate_no, field, old_value, new_value, changed_by) values (new.id, new.plate_no, 'retarget', old.retarget, new.retarget, new.updated_by);
  end if;
  return new;
end $$;
drop trigger if exists docs_units_price_history on public.docs_units;
create trigger docs_units_price_history after update on public.docs_units for each row execute function public.docs_units_price_history();

-- the car list view must list the new columns
create or replace view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units where archived_at is null order by plate_no, arrival_date desc nulls last, created_at desc;
