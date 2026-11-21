-- The 2026 sold list (the SOLD INFORMATION workbook) as records. A transfer (migration 41) becomes the record of one SALE and its
-- transfer: who bought, for how much, when, who sold it, who does the transfer (MAD's liaison or the client), where the original
-- documents are, and which stage the transfer is in. One record per sale, linked to the car by plate (the car need not have a record).
-- Run this BEFORE pushing the code that reads the new columns. It changes no existing value except the stage of finished transfers.

alter table public.car_transfers
  add column if not exists sold_on date,
  add column if not exists agreed_price numeric(12, 2) check (agreed_price is null or agreed_price >= 0),
  add column if not exists route text not null default 'unknown' check (route in ('mad', 'client', 'unknown')),   -- who does the transfer
  add column if not exists stage text not null default 'in_process' check (stage in ('in_process', 'transferred', 'released', 'delivered', 'unknown')),
  add column if not exists liaison_status text,
  add column if not exists liaison_received_on date,
  add column if not exists originals_at text,            -- where the original documents are: "with Jep", "on hand at MAD"
  add column if not exists next_step text,               -- "release to buyer", "received by GDFI 9/10/26"
  add column if not exists chassis_no text,              -- the car as the sold list described it, for a car with no record
  add column if not exists engine_no text,
  add column if not exists is_reference boolean not null default false,   -- an old row kept so staff can look it up: not counted as open work
  add column if not exists flags text[] not null default '{}',            -- what a person has to look at; cleared with "Checked"
  add column if not exists edited_in_app boolean not null default false,  -- once a person changed it here, a later import never overwrites it
  add column if not exists plate_original text,                           -- the plate as typed in the sheet when it was corrected
  add column if not exists deal_id uuid references public.deals (id) on delete set null,
  add column if not exists source_key text;                               -- makes the import safe to run twice

create unique index if not exists car_transfers_source_key on public.car_transfers (source_key) where source_key is not null;
create index if not exists car_transfers_stage on public.car_transfers (stage) where not is_reference;

-- the transfers already in MAD (the old ORCR WITH MAD tab): finished ones are delivered
update public.car_transfers set stage = 'delivered' where done_on is not null and stage = 'in_process';

-- the car record keeps the chassis and engine numbers (the CR's own, not the conduction sticker that cs_no holds)
alter table public.docs_units add column if not exists chassis_no text;
alter table public.docs_units add column if not exists engine_no text;

-- the car list view must list the new columns
create or replace view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units where archived_at is null order by plate_no, arrival_date desc nulls last, created_at desc;
