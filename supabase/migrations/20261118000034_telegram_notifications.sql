-- Personal Telegram notifications: who is connected, what each person muted, and every message sent (or held for the morning).
-- Everything is read and written by the server with the service role; nobody reads these tables directly, so RLS stays on with no policies.

create table public.telegram_links (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  chat_id bigint not null unique,
  username text,
  connected_at timestamptz not null default now(),
  last_error text,
  last_error_at timestamptz
);
alter table public.telegram_links enable row level security;

-- A category the person switched OFF (a missing row means "on").
create table public.notify_prefs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (char_length(category) between 1 and 60),
  enabled boolean not null default true,
  primary key (user_id, category)
);
alter table public.notify_prefs enable row level security;

-- One row per message to one person: the log, the quiet-hours hold, the retry list and the "already sent today" guard in one.
create table public.notify_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null check (char_length(category) between 1 and 60),
  body text not null check (char_length(body) between 1 and 4096),
  dedupe_key text check (dedupe_key is null or char_length(dedupe_key) <= 120),
  send_after timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);
alter table public.notify_outbox enable row level security;
create unique index notify_outbox_dedupe on public.notify_outbox (user_id, dedupe_key) where dedupe_key is not null;
create index notify_outbox_due on public.notify_outbox (send_after) where sent_at is null;
create index notify_outbox_user on public.notify_outbox (user_id, created_at desc);
