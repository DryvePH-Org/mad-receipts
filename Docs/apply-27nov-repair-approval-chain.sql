-- Who is asked first to approve a repair report, and who next when nobody acts: the escalation chain (Super Admin sets it on the Repairs page),
-- and every ask that was sent to someone on Telegram (the message with the Approve / Reject buttons). Read and written by the server only: RLS stays on, no policies.

create table public.escalation_chain (
  topic text not null check (topic in ('repair_approval')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  position integer not null check (position >= 1),
  wait_minutes integer not null default 120 check (wait_minutes between 5 and 1440), -- how long this person has before the next one is asked
  primary key (topic, user_id)
);
alter table public.escalation_chain enable row level security;

create table public.repair_approval_asks (
  id uuid primary key default gen_random_uuid(),
  report_id text not null,
  level integer not null check (level >= 1),            -- 1 = the first person asked, 2 = the next, ...
  user_id uuid not null references public.profiles (id) on delete cascade,
  chat_id bigint not null,
  message_id bigint,
  body text,                                            -- what the message said, so it can be shown again with the decision
  prompt_id bigint,                                     -- the "type the reason" message, after Reject was pressed
  sent_at timestamptz not null default now(),
  closed_at timestamptz,                                -- decided (here, in the app or in the group)
  unique (report_id, level)
);
alter table public.repair_approval_asks enable row level security;
create index repair_approval_asks_open on public.repair_approval_asks (report_id) where closed_at is null;
