-- One queue for everything the grokbots do. A job waits ("queued") until its bot has a free place, then it is sent ("sent") and finally
-- "done" or "failed". Two bots: "scan" reads the document photos, "sheet" reads and edits the Google Sheets.
alter table public.grokbot_jobs drop constraint if exists grokbot_jobs_status_check;
alter table public.grokbot_jobs add constraint grokbot_jobs_status_check check (status in ('queued', 'sent', 'done', 'failed'));
alter table public.grokbot_jobs add column if not exists bot text not null default 'sheet' check (bot in ('scan', 'sheet'));
alter table public.grokbot_jobs add column if not exists priority int not null default 0 check (priority between 0 and 100);
alter table public.grokbot_jobs add column if not exists plate_no text check (plate_no is null or plate_no ~ '^[A-Z0-9]+$');
alter table public.grokbot_jobs add column if not exists started_at timestamptz;
create index if not exists grokbot_jobs_queue_idx on public.grokbot_jobs (bot, status, priority desc, created_at) where status in ('queued', 'sent');
create index if not exists grokbot_jobs_plate_idx on public.grokbot_jobs (plate_no) where plate_no is not null;
