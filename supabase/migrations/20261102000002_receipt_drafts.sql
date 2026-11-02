-- Drafts: an uploaded photo plus its AI extraction, before staff confirm it.
create table public.receipt_drafts (
  id uuid primary key default gen_random_uuid(),
  photo_path text not null,
  extraction jsonb,
  status text not null default 'extracting'
    check (status in ('extracting', 'ready', 'failed', 'consumed')),
  error text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create index receipt_drafts_created_by_idx on public.receipt_drafts (created_by, created_at desc);
