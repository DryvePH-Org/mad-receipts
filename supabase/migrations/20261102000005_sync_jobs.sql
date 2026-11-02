-- Background sync jobs, one per receipt per target.
create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id),
  target text not null check (target in ('drive', 'sheets', 'telegram', 'inventory')),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_id, target)
);

create index sync_jobs_due_idx on public.sync_jobs (next_run_at) where status <> 'done';

create trigger sync_jobs_set_updated_at
  before update on public.sync_jobs
  for each row execute function public.set_updated_at();
