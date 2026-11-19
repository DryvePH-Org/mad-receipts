-- The repairs bot inside the app (Telegram group): who may use it, the reports being written, what the bot is waiting for each person to say,
-- the Telegram updates already handled (so a resend never does the work twice), and the daily counts that protect the cost.
-- Read and written by the server only (service role): RLS on, no policies.

create table public.repair_people (
  tg_id bigint primary key,                                    -- the person's Telegram id (the bot's /whoami shows it)
  name text not null,
  role text not null check (role in ('repairman', 'approver', 'admin')),
  lang text check (lang is null or lang in ('en', 'tl', 'mix')),
  active boolean not null default true,
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.repair_people enable row level security;

create table public.repair_bot_drafts (
  id text primary key,
  owner_tg bigint not null,
  chat_id bigint not null,
  state text not null check (state in ('parsing', 'ready', 'failed', 'pending', 'approved', 'rejected', 'applied', 'cancelled')),
  data jsonb not null,                                         -- the whole draft: words heard, what was read, the card, who decided
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.repair_bot_drafts enable row level security;
create index repair_bot_drafts_state on public.repair_bot_drafts (state, updated_at);

-- what the bot waits for from a person in a chat: a correction (edit), a typed report (text) or the reason for a rejection (reject)
create table public.repair_bot_awaiting (
  kind text not null check (kind in ('edit', 'text', 'reject')),
  chat_id bigint not null,
  user_id bigint not null,
  ref text,
  created_at timestamptz not null default now(),
  primary key (kind, chat_id, user_id)
);
alter table public.repair_bot_awaiting enable row level security;

create table public.repair_bot_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);
alter table public.repair_bot_updates enable row level security;

create table public.repair_bot_usage (
  day date not null,
  kind text not null,
  n integer not null default 0,
  primary key (day, kind)
);
alter table public.repair_bot_usage enable row level security;

-- the group's language and other small settings
create table public.repair_bot_kv (
  key text primary key,
  value text not null
);
alter table public.repair_bot_kv enable row level security;

-- the draft a job came from, so the Repairs page can say who reported it in Telegram
alter table public.car_repairs add column if not exists draft_id text;
