-- The car-documents workflow after the reading: the staff's details checklist (spare key, casa maintenance, battery,
-- where it was bought, EV charger and card), approval ("documents OK, ready to market"), and the Handoff of the
-- documents of a sold unit (with its 3-day follow-ups). One row per car, written only by the server.
create table if not exists public.unit_details (
  plate_no text primary key check (plate_no = upper(plate_no) and plate_no ~ '^[A-Z0-9]+$'),
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table if not exists public.unit_workflow (
  plate_no text primary key check (plate_no = upper(plate_no) and plate_no ~ '^[A-Z0-9]+$'),
  -- the reader has finished every photo of the car and the staff was told once
  scan_notified_at timestamptz,
  -- a sold car whose papers are all there was announced once
  sold_ready_notified_at timestamptz,
  -- the staff approved the documents: ready to market
  docs_approved_at timestamptz,
  docs_approved_by uuid references public.profiles (id),
  marketing_notified_at timestamptz,
  -- Sales and Documentation finished the sold documents; Handoff to the person who processes them, and their return
  handoff_at timestamptz,
  handoff_by uuid references public.profiles (id),
  handoff_note text check (handoff_note is null or char_length(handoff_note) <= 300),
  handoff_checked text[] not null default '{}',
  handoff_last_reminded_at timestamptz,
  handoff_returned_at timestamptz,
  handoff_returned_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

alter table public.unit_details enable row level security;
alter table public.unit_workflow enable row level security;
revoke all on public.unit_details from anon, authenticated;
revoke all on public.unit_workflow from anon, authenticated;

drop trigger if exists unit_details_set_updated_at on public.unit_details;
create trigger unit_details_set_updated_at before update on public.unit_details
  for each row execute function public.set_updated_at();
drop trigger if exists unit_workflow_set_updated_at on public.unit_workflow;
create trigger unit_workflow_set_updated_at before update on public.unit_workflow
  for each row execute function public.set_updated_at();
