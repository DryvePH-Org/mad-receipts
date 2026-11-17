-- The Docs Bible as a table: the database is the source of truth, the Google Sheet becomes an archive.
-- One row per car ARRIVAL (a plate that arrived twice has two rows; the latest arrival is the current one).
-- Everything here is written only by the server (service role); staff reach it through the app.

create table if not exists public.docs_units (
  id uuid primary key default gen_random_uuid(),
  plate_no text not null check (plate_no = upper(plate_no) and plate_no ~ '^[A-Z0-9]+$'),
  plate_display text not null,
  arrival_date date,
  arrival_raw text,

  -- who the car is (imported from the arrivals list; the app owns new arrivals from now on)
  category text, body_type text, year_model text, make text, model_variant text, color text, mileage text,
  trans text, fuel text, cs_no text, sale_status text, encumbrance text, mo_file text, reg_owner_name text,
  buying_source text, awarded_to text, spare_key text,

  -- the staff's own columns
  vehicle_status text,
  classification text not null default 'Not classified (legacy)'
    check (classification in ('Clean', 'Repo (bank)', 'Encumbered (Indiv)', 'Not classified (legacy)')),
  bank_source text, renewal text,
  cr text check (cr in ('Yes', 'No', 'To follow', 'N/A')),
  or_receipt text check (or_receipt in ('Yes', 'No', 'To follow', 'N/A')),
  deed text check (deed in ('Yes', 'No', 'To follow', 'N/A')),
  sellers_id text check (sellers_id in ('Yes', 'No', 'To follow', 'N/A')),
  sec_cert text check (sec_cert in ('Yes', 'No', 'To follow', 'N/A')),
  sec_ids text check (sec_ids in ('Yes', 'No', 'To follow', 'N/A')),
  boards_reso text check (boards_reso in ('Yes', 'No', 'To follow', 'N/A')),
  encumbered text check (encumbered in ('Yes', 'No', 'To follow', 'N/A')),
  chattel text check (chattel in ('Yes', 'No', 'To follow', 'N/A')),
  promissory text check (promissory in ('Yes', 'No', 'To follow', 'N/A')),
  stencil text check (stencil in ('Yes', 'No', 'To follow', 'N/A')),
  other_docs text, paper_status text, remarks_1 text, remarks_2 text,

  -- where the row came from
  source text not null default 'app' check (source in ('import', 'app')),
  import_run_id uuid,
  source_row integer,
  raw jsonb,                      -- the original cells of the imported row, exactly as the sheet showed them
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  last_change_source text not null default 'app',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists docs_units_plate_idx on public.docs_units (plate_no, arrival_date desc nulls last);

-- The latest arrival of each plate is the current one (the same rule the bots used).
create or replace view public.docs_units_current as
  select distinct on (plate_no) * from public.docs_units order by plate_no, arrival_date desc nulls last, created_at desc;

-- COMPLETE / NOT YET, computed (the sheet's column AA, with one change the owner chose: a Repo (bank) car also needs the secretary papers).
create or replace view public.docs_complete as
  select id, plate_no,
    case
      when classification = 'Not classified (legacy)' then null
      when classification = 'Clean' then
        case when cr = 'Yes' and or_receipt = 'Yes' and deed = 'Yes' and sellers_id = 'Yes' then 'COMPLETE' else 'NOT YET' end
      when classification = 'Repo (bank)' then
        case when cr = 'Yes' and or_receipt = 'Yes' and deed = 'Yes' and sellers_id = 'Yes' and chattel = 'Yes' and sec_cert = 'Yes' and sec_ids = 'Yes' then 'COMPLETE' else 'NOT YET' end
      when classification = 'Encumbered (Indiv)' then
        case when cr = 'Yes' and or_receipt = 'Yes' and deed = 'Yes' and sellers_id = 'Yes'
              and sec_cert in ('Yes', 'N/A') and sec_ids in ('Yes', 'N/A') and boards_reso in ('Yes', 'N/A')
              and encumbered = 'Yes' and chattel = 'Yes' then 'COMPLETE' else 'NOT YET' end
      else 'NOT YET'
    end as complete_docs
  from public.docs_units;

-- Every change to a row: who, when, what it was and what it became. Filled by a trigger, so no code path can skip it.
create table if not exists public.docs_unit_history (
  id bigserial primary key,
  unit_id uuid not null references public.docs_units (id) on delete cascade,
  plate_no text not null,
  field text not null,
  before_value text,
  after_value text,
  actor uuid references public.profiles (id),
  source text not null,
  at timestamptz not null default now()
);
create index if not exists docs_unit_history_unit_idx on public.docs_unit_history (unit_id, at desc);

create or replace function public.docs_units_track() returns trigger language plpgsql as $$
declare k text; o jsonb; n jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.docs_unit_history (unit_id, plate_no, field, before_value, after_value, actor, source)
      values (new.id, new.plate_no, '(created)', null, new.plate_display, new.created_by, new.last_change_source);
    return new;
  end if;
  o := to_jsonb(old); n := to_jsonb(new);
  for k in select jsonb_object_keys(n) loop
    if k in ('updated_at', 'updated_by', 'last_change_source', 'raw', 'import_run_id', 'source_row', 'source', 'created_at', 'created_by', 'id') then continue; end if;
    if (o -> k) is distinct from (n -> k) then
      insert into public.docs_unit_history (unit_id, plate_no, field, before_value, after_value, actor, source)
        values (new.id, new.plate_no, k, o ->> k, n ->> k, new.updated_by, new.last_change_source);
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists docs_units_track_trg on public.docs_units;
create trigger docs_units_track_trg after insert or update on public.docs_units for each row execute function public.docs_units_track();
drop trigger if exists docs_units_set_updated_at on public.docs_units;
create trigger docs_units_set_updated_at before update on public.docs_units for each row execute function public.set_updated_at();

-- What staff must look at: two arrivals of one plate, a row with no plate, two status columns that disagree, an old car with no
-- classification... Each one stays open until a person decides; nothing is silently fixed.
create table if not exists public.docs_review_items (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.docs_units (id) on delete cascade,
  plate_no text,
  kind text not null check (kind in ('duplicate_plate', 'no_plate', 'status_disagree', 'legacy_classification', 'odd_date', 'odd_plate', 'unknown_value', 'other')),
  message text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  decision text,
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz,
  import_run_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists docs_review_open_idx on public.docs_review_items (status, kind);

-- The handoff of the papers after a sale ("SUBMITTED TO JEP 9/15", "ORIG DOCS RECEIVED FROM JEP 10/21/2026").
create table if not exists public.docs_handoff_events (
  id bigserial primary key,
  unit_id uuid references public.docs_units (id) on delete cascade,
  plate_no text not null,
  event text not null check (event in ('submitted', 'received', 'note')),
  event_date date,
  person text,
  original_text text not null,
  source text not null default 'app' check (source in ('import', 'app')),
  tab text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists docs_handoff_plate_idx on public.docs_handoff_events (plate_no, created_at desc);

-- The migration itself: each run, the frozen snapshot it read, and every non-empty cell of it (the safety net for the cell-by-cell balance).
create table if not exists public.docs_import_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_name text not null,
  snapshot_sha256 text not null,
  mode text not null check (mode in ('dry_run', 'apply')),
  counts jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  started_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create table if not exists public.docs_import_cells (
  run_id uuid not null references public.docs_import_runs (id) on delete cascade,
  tab text not null,
  row_no integer not null,
  col_no integer not null,
  col_letter text not null,
  value text,
  formula text,
  primary key (run_id, tab, row_no, col_no)
);

alter table public.docs_units enable row level security;
alter table public.docs_unit_history enable row level security;
alter table public.docs_review_items enable row level security;
alter table public.docs_handoff_events enable row level security;
alter table public.docs_import_runs enable row level security;
alter table public.docs_import_cells enable row level security;
revoke all on public.docs_units, public.docs_unit_history, public.docs_review_items, public.docs_handoff_events, public.docs_import_runs, public.docs_import_cells from anon, authenticated;
revoke all on public.docs_units_current, public.docs_complete from anon, authenticated;
