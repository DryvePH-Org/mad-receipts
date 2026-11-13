-- Jobs sent to the grokbot (the bot that reads and edits the Google Sheets). The app POSTs a job to the bot's webhook;
-- the bot does the work and POSTs its answer back to the app, which stores it here. Written only by the server.
create table if not exists public.grokbot_jobs (
  id text primary key check (id ~ '^[a-z_]{3,40}-[0-9a-f]{10}$'),
  action text not null check (char_length(action) between 3 and 40),
  status text not null default 'sent' check (status in ('sent', 'done', 'failed')),
  request jsonb not null default '{}'::jsonb,
  result jsonb,
  error text check (error is null or char_length(error) <= 500),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists grokbot_jobs_recent_idx on public.grokbot_jobs (created_at desc);

alter table public.grokbot_jobs enable row level security;
revoke all on public.grokbot_jobs from anon, authenticated;
