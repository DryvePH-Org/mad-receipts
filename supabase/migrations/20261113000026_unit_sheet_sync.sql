-- What the app last did with the Docs Bible sheet for each car: the checklist written after the scan and approval, and the handoff
-- entries (submitted / received). One row per car and kind, written only by the server.
create table if not exists public.unit_sheet_sync (
  plate_no text not null check (plate_no = upper(plate_no) and plate_no ~ '^[A-Z0-9]+$'),
  kind text not null check (kind in ('checklist', 'submitted', 'received')),
  status text not null check (status in ('previewed', 'done', 'conflict', 'failed', 'frozen')),
  detail jsonb not null default '{}'::jsonb,
  error text check (error is null or char_length(error) <= 500),
  job_id text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (plate_no, kind)
);
alter table public.unit_sheet_sync enable row level security;
revoke all on public.unit_sheet_sync from anon, authenticated;
drop trigger if exists unit_sheet_sync_set_updated_at on public.unit_sheet_sync;
create trigger unit_sheet_sync_set_updated_at before update on public.unit_sheet_sync
  for each row execute function public.set_updated_at();
