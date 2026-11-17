-- The Docs Bible pages: the module can be given or hidden like any other, a row can be archived (a double entry the staff removed:
-- nothing is ever deleted, its history stays), and a review item remembers which sheet row it came from.
alter table public.profiles drop constraint if exists profiles_module_values_check;
alter table public.profiles add constraint profiles_module_values_check check (
  module_grants <@ array['dashboard','cars','register','new','deals','approvals','reminders','documents','upload','cash','activity','settings','users','sync']
  and module_denies <@ array['dashboard','cars','register','new','deals','approvals','reminders','documents','upload','cash','activity','settings','users','sync']
);

alter table public.docs_units add column if not exists archived_at timestamptz;
alter table public.docs_units add column if not exists archived_by uuid references public.profiles (id);

alter table public.docs_review_items add column if not exists source_row integer;
update public.docs_review_items set source_row = substring(message from '^Row ([0-9]+)')::integer where kind = 'no_plate' and source_row is null;

create or replace view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units where archived_at is null order by plate_no, arrival_date desc nulls last, created_at desc;

create or replace view public.docs_complete as
  select id, plate_no,
    case
      when classification = 'Not classified (legacy)' then null
      when classification = 'Clean' then
        case when cr = 'Yes' and or_receipt = 'Yes' and deed = 'Yes' and sellers_id = 'Yes' then 'COMPLETE' else 'NOT YET' end
      when classification = 'Repo (bank)' then
        case when cr = 'Yes' and or_receipt = 'Yes' and deed = 'Yes' and sellers_id = 'Yes' and chattel = 'Yes' and sec_cert = 'Yes' and sec_ids = 'Yes' then 'COMPLETE' else 'NOT YET' end
      when classification = 'Encumbered (Indiv)' then
        case when cr = 'Yes' and or_receipt = 'Yes' and deed = 'Yes' and sellers_id = 'Yes'
              and sec_cert in ('Yes', 'N/A') and sec_ids in ('Yes', 'N/A') and boards_reso in ('Yes', 'N/A')
              and encumbered = 'Yes' and chattel = 'Yes' then 'COMPLETE' else 'NOT YET' end
      else 'NOT YET'
    end as complete_docs
  from public.docs_units where archived_at is null;
revoke all on public.docs_units_current, public.docs_complete from anon, authenticated;
