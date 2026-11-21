-- The documents handoff and the transfer were two trackers of one thing: the originals going to the liaison and coming back. They become one:
-- the sale/transfer record (car_transfers) holds the dates of every step: sent out to the liaison, back at MAD, released to the buyer or the
-- financing company, delivered. The handoff columns of unit_workflow are no longer used (they stay in place as the old copy).
-- Run this BEFORE pushing the code that reads the new columns. It changes no value that is shown today: the handoffs already out are copied over.

alter table public.car_transfers
  add column if not exists handed_off_at timestamptz,        -- the originals were sent to the liaison (the old "Handed off")
  add column if not exists handed_off_by uuid references public.profiles (id) on delete set null,
  add column if not exists handoff_note text check (handoff_note is null or char_length(handoff_note) <= 300),
  add column if not exists handoff_checked text[] not null default '{}',   -- the papers ticked off before sending
  add column if not exists back_at timestamptz,              -- the originals are back at MAD with the new CR (the old "Mark as done")
  add column if not exists back_by uuid references public.profiles (id) on delete set null,
  add column if not exists released_on date,                 -- given to the buyer or the financing company
  add column if not exists delivered_on date,                -- the buyer or the bank confirmed they have it
  add column if not exists last_reminded_at timestamptz;     -- the reminder every 3 days while the originals are out
create index if not exists car_transfers_out on public.car_transfers (handed_off_at) where handed_off_at is not null and back_at is null;

-- Copies the handoffs of unit_workflow onto the car's record (the latest sale of the plate, or a new record when the car has none).
-- Safe to run again: a handoff already copied (same plate, same moment) is skipped.
create or replace function public.move_handoffs_to_transfers() returns integer language plpgsql security definer set search_path = '' as $$
declare r record; t uuid; n integer := 0; u uuid;
begin
  for r in select * from public.unit_workflow where handoff_at is not null loop
    if exists (select 1 from public.car_transfers x where x.plate_no = r.plate_no and x.handed_off_at = r.handoff_at) then continue; end if;
    select id into t from public.car_transfers where plate_no = r.plate_no and stage <> 'cancelled' and handed_off_at is null
      order by sold_on desc nulls last, created_at desc limit 1;
    if t is null then
      select id into u from public.docs_units where plate_no = r.plate_no and archived_at is null order by arrival_date desc nulls last limit 1;
      insert into public.car_transfers (plate_no, unit_id, source, stage, handed_off_at, handed_off_by, handoff_note, handoff_checked, back_at, back_by, last_reminded_at)
      values (r.plate_no, u, 'app', case when r.handoff_returned_at is null then 'in_process' else 'transferred' end, r.handoff_at, r.handoff_by, r.handoff_note,
              coalesce(r.handoff_checked, '{}'), r.handoff_returned_at, r.handoff_returned_by, r.handoff_last_reminded_at);
    else
      update public.car_transfers set handed_off_at = r.handoff_at, handed_off_by = r.handoff_by, handoff_note = r.handoff_note, handoff_checked = coalesce(r.handoff_checked, '{}'),
        back_at = r.handoff_returned_at, back_by = r.handoff_returned_by, last_reminded_at = r.handoff_last_reminded_at,
        stage = case when r.handoff_returned_at is null then (case when stage = 'unknown' then 'in_process' else stage end)
                     else (case when stage in ('released', 'delivered') then stage else 'transferred' end) end
      where id = t;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.move_handoffs_to_transfers() from public, anon, authenticated;
grant execute on function public.move_handoffs_to_transfers() to service_role;
select public.move_handoffs_to_transfers();
