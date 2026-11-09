-- The transmittal receipt: the list of papers and items handed over with a car, filled in by the Documentation staff
-- (starting from what the car's folder shows). One per car, written only by the server.
create table if not exists public.transmittals (
  plate_no text primary key check (plate_no = upper(plate_no) and plate_no ~ '^[A-Z0-9]+$'),
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
alter table public.transmittals enable row level security;
revoke all on public.transmittals from anon, authenticated;
drop trigger if exists transmittals_set_updated_at on public.transmittals;
create trigger transmittals_set_updated_at before update on public.transmittals
  for each row execute function public.set_updated_at();
