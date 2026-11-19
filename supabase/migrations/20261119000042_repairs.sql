-- Repairs in the app's own database (the repairs bot used to write them to a Google sheet through grokbot). One row per problem of a car.
-- A report waits for an Approver (approval = 'pending'), then it is approved or rejected; an approved job is open until it is done.
-- The 14 rows that were imported from the sheet stay (approval 'approved'). Read and written by the server only.

alter table public.car_repairs drop constraint if exists car_repairs_source_check;
alter table public.car_repairs add constraint car_repairs_source_check check (source in ('import', 'app', 'bot'));

alter table public.car_repairs add column if not exists unit_id uuid references public.docs_units (id) on delete set null;   -- the car record, found by plate
alter table public.car_repairs add column if not exists key text;                                                              -- the bot's id of the job (the sheet's BOT ID)
alter table public.car_repairs add column if not exists due_on date;                                                           -- est_timeline when it is a clear date
alter table public.car_repairs add column if not exists approval text not null default 'approved' check (approval in ('pending', 'approved', 'rejected'));
alter table public.car_repairs add column if not exists approved_by_user uuid references public.profiles (id);
alter table public.car_repairs add column if not exists approved_at timestamptz;
alter table public.car_repairs add column if not exists reject_reason text;
alter table public.car_repairs add column if not exists reported_by text;                                                      -- who said it (as the bot knew them)
alter table public.car_repairs add column if not exists reported_tg bigint;                                                    -- their Telegram id
alter table public.car_repairs add column if not exists report_id text;                                                        -- the report the job came with (several problems, one car)
alter table public.car_repairs add column if not exists vehicle text;                                                          -- make and model as said, for a plate with no record

create unique index if not exists car_repairs_key on public.car_repairs (key) where key is not null;
create index if not exists car_repairs_unit on public.car_repairs (unit_id);
create index if not exists car_repairs_open on public.car_repairs (approval, status);

-- everything that happened to a job: reported, approved, rejected, status, timeline, notes
create table if not exists public.repair_events (
  id bigserial primary key,
  repair_id uuid not null references public.car_repairs (id) on delete cascade,
  kind text not null check (kind in ('reported', 'approved', 'rejected', 'status', 'timeline', 'note', 'edited')),
  detail text,
  by_name text,
  by_user uuid references public.profiles (id),
  at timestamptz not null default now()
);
alter table public.repair_events enable row level security;
create index if not exists repair_events_job on public.repair_events (repair_id, at);

-- an old row typed in a clear ISO date gets its due date
update public.car_repairs set due_on = est_timeline::date where due_on is null and est_timeline ~ '^\d{4}-\d{2}-\d{2}$';
update public.car_repairs r set unit_id = (select u.id from public.docs_units u where u.plate_no = r.plate_no and u.archived_at is null order by u.arrival_date desc nulls last limit 1) where r.unit_id is null;
