-- The Documentation role and the car-documents module: each car has a Drive folder (Available units,
-- then Sold units), the files in it are read and sorted into document types, and a checklist per
-- case says what is still missing. Only the server (service role) writes these tables.

-- ======================= 1. The role =======================
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('sales', 'admin', 'approver', 'documentation'));

-- ======================= 2. Folders =======================
-- One row per car, keyed by the plate without spaces or dashes ("AAX3622").
create table public.unit_folders (
  plate_no text primary key check (plate_no = upper(plate_no) and plate_no ~ '^[A-Z0-9]+$'),
  plate_display text not null,
  folder_id text unique,
  folder_name text,
  folder_url text,
  location text not null default 'available' check (location in ('available', 'sold')),
  -- linked: exactly one folder found; none / several: a person has to look
  match_status text not null default 'linked' check (match_status in ('linked', 'none', 'several')),
  candidates jsonb not null default '[]'::jsonb,
  case_type text check (case_type in ('clean', 'encumbered', 'repo_bank', 'company')),
  case_source text not null default 'auto' check (case_source in ('auto', 'manual')),
  deal_id uuid references public.deals (id) on delete set null,
  scanned_at timestamptz,
  moved_at timestamptz,
  moved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger unit_folders_set_updated_at before update on public.unit_folders
  for each row execute function public.set_updated_at();
create index unit_folders_deal_idx on public.unit_folders (deal_id);

-- ======================= 3. Files =======================
-- One row per file in a car folder. A photo can show more than one document (an LTO official receipt
-- and the certificate of registration are often photographed together), so doc_types is a list.
create table public.folder_files (
  id uuid primary key default gen_random_uuid(),
  plate_no text not null references public.unit_folders (plate_no) on delete cascade,
  drive_file_id text not null unique,
  filename text not null,
  mime_type text,
  size_bytes bigint,
  drive_url text,
  source text not null default 'drive' check (source in ('drive', 'upload')),
  uploaded_by uuid references public.profiles (id),
  read_status text not null default 'pending' check (read_status in ('pending', 'done', 'failed', 'unreadable')),
  read_error text,
  read_at timestamptz,
  doc_types text[] not null default '{}',
  doc_types_source text not null default 'auto' check (doc_types_source in ('auto', 'manual')),
  details jsonb not null default '{}'::jsonb,
  flags text[] not null default '{}',
  confidence numeric(3, 2),
  duplicate_of uuid references public.folder_files (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger folder_files_set_updated_at before update on public.folder_files
  for each row execute function public.set_updated_at();
create index folder_files_plate_idx on public.folder_files (plate_no);

alter table public.unit_folders enable row level security;
alter table public.folder_files enable row level security;
create policy "read unit folders" on public.unit_folders for select to authenticated using (true);
create policy "read folder files" on public.folder_files for select to authenticated using (true);

-- ======================= 4. Link the folder when an AR is created =======================
-- The first receipt of a deal (approved or not) queues a "docs" job that finds the car's folder by plate.
alter table public.sync_jobs drop constraint if exists sync_jobs_target_check;
alter table public.sync_jobs add constraint sync_jobs_target_check check (target in ('drive', 'sheets', 'telegram', 'inventory', 'docs'));
alter table public.sync_jobs drop constraint if exists sync_jobs_event_check;
alter table public.sync_jobs add constraint sync_jobs_event_check check (event in ('submit', 'confirm', 'void', 'cancel', 'edit'));

create function public.queue_docs_link()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.receipts where deal_id = new.deal_id) = 1 then
    insert into public.sync_jobs (receipt_id, target, event) values (new.id, 'docs', 'submit')
    on conflict (receipt_id, target, event) do nothing;
  end if;
  return new;
end;
$$;
create trigger receipts_queue_docs_link after insert on public.receipts
  for each row execute function public.queue_docs_link();
