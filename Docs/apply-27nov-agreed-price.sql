-- The price agreed with the buyer, on the car's own record (Car Inventory: Change price or state). It is TEXT on purpose: staff write it the way they know it
-- ("476,000", "600,000 plus the fee", "TBC"), and some cars already carry it in the note of their state.
-- A sale of the Sold list still has its own number (car_sales.agreed_price); Car Inventory shows this one when it is filled in, else that one.

drop view if exists public.docs_units_current;
alter table public.docs_units add column if not exists agreed_price text check (agreed_price is null or char_length(agreed_price) <= 60);
create view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units where archived_at is null order by plate_no, arrival_date desc nulls last, created_at desc;
revoke all on public.docs_units_current from anon, authenticated;

-- The Admins wrote the agreed price in the note of the state ("Agreed at 471,000", "Closed at 449,000"): the first amount of such a note becomes the agreed price.
-- The note itself is left as it is.
update public.docs_units
   set agreed_price = substring(stock_note from '[0-9]{1,3}(?:,[0-9]{3})+')
 where agreed_price is null and archived_at is null and stock_state in ('Reserved', 'Sold')
   and stock_note ~* '(agre|closed|sold|reserved)' and stock_note ~ '[0-9]{1,3}(,[0-9]{3})+';
