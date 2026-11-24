-- 24 Nov 2026, THIRD file: run this AFTER the code with step 3a is pushed and deployed (the first two files were run already).
-- The handoff of the originals is kept once, on the car's sale record; the old copy on unit_workflow is removed (each one is kept first in car_dropped_values).

begin;

-- Step 3a of the clean database (Docs/DATABASE_PLAN.md): the handoff of the originals (sent out, back, who, the note, the ticked papers, the reminder) is kept
-- ONCE, on the car's sale and transfer record (car_transfers, migration 48). The old copy on unit_workflow is no longer read or written by the app.
-- Each old handoff is kept first in car_dropped_values (migration 53), then the one-time copy function and the columns are removed.
-- Run this AFTER the code that no longer reads them is deployed.

insert into public.car_dropped_values (unit_id, plate_no, column_name, value, reason)
select null, w.plate_no, 'unit_workflow handoff', jsonb_strip_nulls(jsonb_build_object(
  'handoff_at', w.handoff_at, 'handoff_by', w.handoff_by, 'handoff_note', w.handoff_note, 'handoff_checked', nullif(w.handoff_checked, '{}'::text[]),
  'handoff_returned_at', w.handoff_returned_at, 'handoff_returned_by', w.handoff_returned_by, 'handoff_last_reminded_at', w.handoff_last_reminded_at))::text,
  'the old copy of the handoff, kept on the sale record since migration 48'
from public.unit_workflow w
where w.handoff_at is not null or w.handoff_returned_at is not null or w.handoff_note is not null;

drop function if exists public.move_handoffs_to_transfers();
alter table public.unit_workflow
  drop column if exists handoff_at, drop column if exists handoff_by, drop column if exists handoff_note, drop column if exists handoff_checked,
  drop column if exists handoff_returned_at, drop column if exists handoff_returned_by, drop column if exists handoff_last_reminded_at;

commit;
