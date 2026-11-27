-- The documents of a car have three stages, each read by its own bot and approved on its own: IN (the papers the car came with), OUT (after the sale: the
-- buyer's ID, the deed and the physical AR) and TRANSFER (the papers that come back from Sir Jep: OR, CR, PNP clearance, macro-etching).
-- IN keeps its approval where it was (the car's folder row); OUT and TRANSFER are kept here. Written by the server only: RLS on, no policies.

-- every photo belongs to a stage ('in' for everything that exists now); the stage decides which bot reads it
alter table public.folder_files add column if not exists stage text not null default 'in' check (stage in ('in', 'out', 'transfer'));
create index if not exists folder_files_stage_pending on public.folder_files (plate_no, stage) where read_status = 'pending';

create table if not exists public.unit_stage_approvals (
  plate_no text not null,
  stage text not null check (stage in ('out', 'transfer')),
  approved_at timestamptz not null default now(),
  approved_by uuid references public.profiles (id) on delete set null,
  approved_by_name text,
  primary key (plate_no, stage)
);
alter table public.unit_stage_approvals enable row level security;

-- the queue has three scanners now
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.grokbot_jobs'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%bot%scan%' loop
    execute format('alter table public.grokbot_jobs drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.grokbot_jobs add constraint grokbot_jobs_bot_check check (bot in ('scan', 'scan_out', 'scan_transfer', 'sheet'));
