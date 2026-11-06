-- PCF (petty cash, from the PCF web app), merged into MAD.
-- Built from PCF's migrations phase 1-19 in order, with these changes (marked MERGE):
--  * profiles is MAD's table: petty cash adds pcf_role (null = no petty cash access) and is_active.
--    Its role enum is renamed user_role -> pcf_role. A MAD Admin counts as a petty cash admin.
--  * MAD's profile policies stay; petty cash adds none.
--  * Revokes that PCF ran on every function/sequence in the schema only touch petty cash's own.
-- MAD's functions before this migration, so the petty cash revoke leaves them alone.
create temp table mad_functions as
  select oid from pg_proc where pronamespace = 'public'::regnamespace;

-- ======== from PCF 20261031120000_phase1_schema.sql ========
-- Phase 1: enums, tables, helpers, triggers, and the live balance view.

create type public.pcf_role as enum ('admin', 'custodian', 'approver', 'accounting');
create type public.voucher_status as enum ('draft', 'submitted', 'approved', 'released', 'closed', 'rejected', 'void');
create type public.replenishment_status as enum ('draft', 'submitted', 'approved', 'rejected', 'closed');

-- DECISION: request numbers need a race-free counter; the plan only requires
-- `request_no` to be unique, so a plain sequence backs REP-YYYY-NNNN.
create sequence public.replenishment_no_seq start 1;

-- MERGE: profiles belongs to MAD (Invoice). Petty cash adds its own role (null = no petty cash access)
-- and an active flag the petty cash rules check. A MAD Admin is a petty cash admin (see app_role).
alter table public.profiles
  add column pcf_role public.pcf_role,
  add column is_active boolean not null default true;

create table public.funds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12,2) not null check (amount > 0),
  per_txn_limit numeric(12,2) not null check (per_txn_limit > 0),
  low_balance_pct int not null default 25 check (low_balance_pct between 1 and 100),
  custodian_id uuid references public.profiles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true
);

create table public.fund_counters (
  fund_id uuid not null references public.funds(id),
  year int not null,
  last_no int not null default 0,
  primary key (fund_id, year)
);

create table public.replenishments (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id),
  request_no text not null unique,
  status public.replenishment_status not null default 'draft',
  total numeric(12,2) not null default 0,
  requested_by uuid references public.profiles(id),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id),
  pcv_number text not null unique,
  voucher_date date not null default current_date,
  payee text not null,
  particulars text not null,
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid not null references public.categories(id),
  status public.voucher_status not null default 'draft',
  receipt_path text,
  no_receipt_reason text,
  prepared_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  released_at timestamptz,
  reject_reason text,
  void_reason text,
  replenishment_id uuid references public.replenishments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vouchers_fund_status_idx on public.vouchers (fund_id, status);
create index vouchers_date_idx on public.vouchers (voucher_date);
create index vouchers_replenishment_idx on public.vouchers (replenishment_id);

create table public.cash_counts (
  id uuid primary key default gen_random_uuid(),
  fund_id uuid not null references public.funds(id),
  counted_cash numeric(12,2) not null check (counted_cash >= 0),
  expected_cash numeric(12,2) not null,
  variance numeric(12,2) generated always as (counted_cash - expected_cash) stored,
  note text,
  counted_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);

alter table public.funds enable row level security;
alter table public.categories enable row level security;
alter table public.fund_counters enable row level security;
alter table public.replenishments enable row level security;
alter table public.vouchers enable row level security;
alter table public.cash_counts enable row level security;
alter table public.audit_log enable row level security;

create or replace function public.app_role() returns public.pcf_role
language sql stable security definer set search_path = public as $$
  select coalesce(pcf_role, case when role = 'admin' then 'admin'::public.pcf_role end)
  from public.profiles where id = auth.uid() and is_active
$$;

-- DECISION: the fund year follows the app timezone, Asia/Manila, per plan rule 9.
create or replace function public.next_pcv_number(p_fund_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from (now() at time zone 'Asia/Manila'))::int;
  v_no int;
begin
  insert into public.fund_counters (fund_id, year, last_no)
  values (p_fund_id, v_year, 1)
  on conflict (fund_id, year)
    do update set last_no = public.fund_counters.last_no + 1
  returning last_no into v_no;

  return format('PCV-%s-%s', v_year, lpad(v_no::text, 4, '0'));
end $$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger vouchers_set_updated_at
  before update on public.vouchers
  for each row execute function public.set_updated_at();

create or replace function public.log_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_action text := lower(tg_op);
  v_entity_id uuid;
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(old) ->> 'status') is distinct from (to_jsonb(new) ->> 'status') then
    v_action := 'status_change';
  end if;

  v_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;

  insert into public.audit_log (entity_type, entity_id, action, actor_id, old_data, new_data)
  values (
    tg_table_name,
    v_entity_id,
    v_action,
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );

  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger vouchers_audit
  after insert or update or delete on public.vouchers
  for each row execute function public.log_audit();
create trigger replenishments_audit
  after insert or update or delete on public.replenishments
  for each row execute function public.log_audit();
create trigger funds_audit
  after insert or update or delete on public.funds
  for each row execute function public.log_audit();
create trigger cash_counts_audit
  after insert or update or delete on public.cash_counts
  for each row execute function public.log_audit();
create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.log_audit();

create or replace view public.fund_balance_v as
select
  f.id as fund_id,
  f.name,
  f.amount as fund_amount,
  coalesce(sum(v.amount) filter (where v.status = 'released'), 0)::numeric(12,2) as released_vouchers_total,
  (f.amount - coalesce(sum(v.amount) filter (where v.status = 'released'), 0))::numeric(12,2) as expected_cash,
  (
    f.amount - coalesce(sum(v.amount) filter (where v.status = 'released'), 0)
  ) < f.amount * f.low_balance_pct / 100.0 as is_low
from public.funds f
left join public.vouchers v on v.fund_id = f.id
group by f.id, f.name, f.amount, f.low_balance_pct;

-- ======== from PCF 20261031120100_phase1_rpcs.sql ========
-- Phase 1: every voucher and replenishment state change goes through these RPCs.
-- All are security definer, pin search_path, and validate role + current state.

create or replace function public.require_role(p_roles public.pcf_role[])
returns public.pcf_role
language plpgsql stable security definer set search_path = public as $$
declare
  v_role public.pcf_role := public.app_role();
begin
  if v_role is null or not (v_role = any(p_roles)) then
    raise exception 'Not authorized for this action';
  end if;
  return v_role;
end $$;

create or replace function public.create_voucher(
  p_fund_id uuid,
  p_payee text,
  p_particulars text,
  p_amount numeric,
  p_category_id uuid,
  p_voucher_date date default current_date,
  p_receipt_path text default null,
  p_no_receipt_reason text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_fund public.funds%rowtype;
  v_category public.categories%rowtype;
  v_id uuid;
begin
  perform public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  if nullif(btrim(coalesce(p_payee, '')), '') is null then
    raise exception 'Payee is required';
  end if;
  if nullif(btrim(coalesce(p_particulars, '')), '') is null then
    raise exception 'Particulars are required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select * into v_fund from public.funds where id = p_fund_id and is_active;
  if not found then
    raise exception 'Fund not found or inactive';
  end if;
  if p_amount > v_fund.per_txn_limit then
    raise exception 'Amount exceeds the per-transaction limit of %', v_fund.per_txn_limit;
  end if;

  select * into v_category from public.categories where id = p_category_id and is_active;
  if not found then
    raise exception 'Category not found or inactive';
  end if;

  insert into public.vouchers (
    fund_id, pcv_number, voucher_date, payee, particulars, amount, category_id,
    status, receipt_path, no_receipt_reason, prepared_by
  ) values (
    p_fund_id,
    public.next_pcv_number(p_fund_id),
    coalesce(p_voucher_date, current_date),
    btrim(p_payee),
    btrim(p_particulars),
    round(p_amount, 2),
    p_category_id,
    'draft',
    nullif(btrim(coalesce(p_receipt_path, '')), ''),
    nullif(btrim(coalesce(p_no_receipt_reason, '')), ''),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.submit_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
  v_role public.pcf_role;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status not in ('draft', 'rejected') then
    raise exception 'Voucher cannot be submitted from status %', v_voucher.status;
  end if;
  if v_role = 'custodian' and v_voucher.prepared_by <> auth.uid() then
    raise exception 'You can only submit your own vouchers';
  end if;
  if nullif(btrim(coalesce(v_voucher.receipt_path, '')), '') is null
     and nullif(btrim(coalesce(v_voucher.no_receipt_reason, '')), '') is null then
    raise exception 'Attach a receipt or provide a no-receipt reason';
  end if;

  update public.vouchers
  set status = 'submitted', reject_reason = null
  where id = p_id;
end $$;

create or replace function public.approve_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
begin
  perform public.require_role(array['approver', 'admin']::public.pcf_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'submitted' then
    raise exception 'Voucher cannot be approved from status %', v_voucher.status;
  end if;
  if v_voucher.prepared_by = auth.uid() then
    raise exception 'You cannot approve a voucher you prepared';
  end if;

  update public.vouchers
  set status = 'approved', approved_by = auth.uid(), approved_at = now()
  where id = p_id;
end $$;

create or replace function public.reject_voucher(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
begin
  perform public.require_role(array['approver', 'admin']::public.pcf_role[]);

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'submitted' then
    raise exception 'Voucher cannot be rejected from status %', v_voucher.status;
  end if;

  update public.vouchers
  set status = 'rejected', reject_reason = btrim(p_reason)
  where id = p_id;
end $$;

create or replace function public.release_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
  v_expected numeric;
begin
  perform public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'approved' then
    raise exception 'Voucher cannot be released from status %', v_voucher.status;
  end if;

  -- Serialize releases per fund so two requests cannot both pass the cash check.
  perform 1 from public.funds where id = v_voucher.fund_id for update;

  select expected_cash into v_expected from public.fund_balance_v where fund_id = v_voucher.fund_id;
  if v_expected is null then
    raise exception 'Fund balance not found';
  end if;
  if v_voucher.amount > v_expected then
    raise exception 'Insufficient cash on hand: % available, % required', v_expected, v_voucher.amount;
  end if;

  update public.vouchers
  set status = 'released', released_at = now()
  where id = p_id;
end $$;

create or replace function public.void_voucher(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
  v_role public.pcf_role;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A void reason is required';
  end if;

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status = 'closed' then
    raise exception 'Closed vouchers cannot be voided';
  end if;
  if v_role = 'custodian' then
    if v_voucher.prepared_by <> auth.uid() then
      raise exception 'You can only void your own vouchers';
    end if;
    if v_voucher.status not in ('draft', 'rejected') then
      raise exception 'Custodians can only void draft or rejected vouchers';
    end if;
  end if;

  -- DECISION: keep replenishment totals consistent by refusing to void a
  -- voucher that is currently bundled in a replenishment request.
  if v_voucher.replenishment_id is not null then
    raise exception 'Voucher is part of a replenishment request; review that request first';
  end if;

  update public.vouchers
  set status = 'void', void_reason = btrim(p_reason)
  where id = p_id;
end $$;

create or replace function public.create_replenishment(p_fund_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_total numeric(12,2);
  v_id uuid;
  v_no bigint;
  v_year int := extract(year from (now() at time zone 'Asia/Manila'))::int;
begin
  perform public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  perform 1 from public.funds where id = p_fund_id and is_active for update;
  if not found then
    raise exception 'Fund not found or inactive';
  end if;

  select count(*), coalesce(sum(amount), 0)
  into v_count, v_total
  from public.vouchers
  where fund_id = p_fund_id
    and status = 'released'
    and replenishment_id is null;

  if v_count = 0 then
    raise exception 'No released vouchers are available to replenish';
  end if;

  v_no := nextval('public.replenishment_no_seq');

  insert into public.replenishments (fund_id, request_no, status, total, requested_by)
  values (
    p_fund_id,
    format('REP-%s-%s', v_year, lpad(v_no::text, 4, '0')),
    'draft',
    v_total,
    auth.uid()
  )
  returning id into v_id;

  update public.vouchers
  set replenishment_id = v_id
  where fund_id = p_fund_id
    and status = 'released'
    and replenishment_id is null;

  return v_id;
end $$;

create or replace function public.submit_replenishment(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_repl public.replenishments%rowtype;
  v_role public.pcf_role;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  select * into v_repl from public.replenishments where id = p_id for update;
  if not found then
    raise exception 'Replenishment not found';
  end if;
  if v_repl.status <> 'draft' then
    raise exception 'Replenishment cannot be submitted from status %', v_repl.status;
  end if;
  if v_role = 'custodian' and v_repl.requested_by <> auth.uid() then
    raise exception 'You can only submit your own replenishment requests';
  end if;

  update public.replenishments set status = 'submitted' where id = p_id;
end $$;

create or replace function public.review_replenishment(
  p_id uuid,
  p_approve boolean,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_repl public.replenishments%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.require_role(array['accounting', 'admin']::public.pcf_role[]);

  if p_approve is null then
    raise exception 'An approve/reject decision is required';
  end if;
  if not p_approve and v_note is null then
    raise exception 'A note is required when rejecting a replenishment';
  end if;

  select * into v_repl from public.replenishments where id = p_id for update;
  if not found then
    raise exception 'Replenishment not found';
  end if;
  if v_repl.status <> 'submitted' then
    raise exception 'Replenishment cannot be reviewed from status %', v_repl.status;
  end if;

  if p_approve then
    update public.replenishments
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
    where id = p_id;
  else
    update public.replenishments
    set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
    where id = p_id;

    update public.vouchers set replenishment_id = null where replenishment_id = p_id;
  end if;
end $$;

create or replace function public.close_replenishment(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_repl public.replenishments%rowtype;
begin
  perform public.require_role(array['accounting', 'admin']::public.pcf_role[]);

  select * into v_repl from public.replenishments where id = p_id for update;
  if not found then
    raise exception 'Replenishment not found';
  end if;
  if v_repl.status <> 'approved' then
    raise exception 'Replenishment cannot be closed from status %', v_repl.status;
  end if;
  if v_repl.reviewed_by is null then
    raise exception 'Replenishment must be reviewed before it can be closed';
  end if;

  update public.vouchers
  set status = 'closed'
  where replenishment_id = p_id and status = 'released';

  update public.replenishments set status = 'closed' where id = p_id;
end $$;

create or replace function public.record_cash_count(
  p_fund_id uuid,
  p_counted numeric,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_expected numeric;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  perform public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  if p_counted is null or p_counted < 0 then
    raise exception 'Counted cash must be zero or more';
  end if;

  select expected_cash into v_expected from public.fund_balance_v where fund_id = p_fund_id;
  if v_expected is null then
    raise exception 'Fund not found';
  end if;

  if p_counted <> v_expected and v_note is null then
    raise exception 'A note is required when the counted cash differs from expected cash';
  end if;

  insert into public.cash_counts (fund_id, counted_cash, expected_cash, note, counted_by)
  values (p_fund_id, round(p_counted, 2), v_expected, v_note, auth.uid())
  returning id into v_id;

  return v_id;
end $$;

-- ======== from PCF 20261031120200_phase1_rls_storage.sql ========
-- Phase 1: Row Level Security, protected-column guards, grants, and storage policies.

-- MERGE: profiles policies come from MAD (Invoice).

-- ---------------------------------------------------------- funds, categories
create policy funds_select on public.funds
  for select to authenticated
  using (true);

create policy funds_admin_insert on public.funds
  for insert to authenticated
  with check (public.app_role() = 'admin');

create policy funds_admin_update on public.funds
  for update to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

create policy categories_select on public.categories
  for select to authenticated
  using (true);

create policy categories_admin_insert on public.categories
  for insert to authenticated
  with check (public.app_role() = 'admin');

create policy categories_admin_update on public.categories
  for update to authenticated
  using (public.app_role() = 'admin')
  with check (public.app_role() = 'admin');

-- ---------------------------------------------------- vouchers (read + limited edit)
create policy vouchers_select on public.vouchers
  for select to authenticated
  using (true);

-- Custodians may edit the descriptive fields of their own draft/rejected
-- vouchers. Status and workflow columns are guarded by the trigger below and
-- by the column-level UPDATE grant at the end of this file.
create policy vouchers_custodian_update on public.vouchers
  for update to authenticated
  using (prepared_by = auth.uid() and status in ('draft', 'rejected'))
  with check (prepared_by = auth.uid() and status in ('draft', 'rejected'));

-- ---------------------------------------------------------- replenishments, counts
create policy replenishments_select on public.replenishments
  for select to authenticated
  using (true);

create policy cash_counts_select on public.cash_counts
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------- audit log
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.app_role() in ('admin', 'accounting'));

-- ------------------------------------------------- protected-column triggers
-- These are intentionally invoker-security functions: inside an RPC (security
-- definer) current_user is the function owner, while a direct PostgREST write
-- arrives as `authenticated`. That lets us tell the two paths apart.

create or replace function public.protect_voucher_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.status is distinct from old.status
       or new.fund_id is distinct from old.fund_id
       or new.pcv_number is distinct from old.pcv_number
       or new.prepared_by is distinct from old.prepared_by
       or new.approved_by is distinct from old.approved_by
       or new.approved_at is distinct from old.approved_at
       or new.released_at is distinct from old.released_at
       or new.reject_reason is distinct from old.reject_reason
       or new.void_reason is distinct from old.void_reason
       or new.replenishment_id is distinct from old.replenishment_id
       or new.created_at is distinct from old.created_at
       or new.updated_at is distinct from old.updated_at then
      raise exception 'Voucher status and workflow fields can only be changed through voucher actions';
    end if;

    if new.amount is distinct from old.amount then
      if new.amount <= 0 then
        raise exception 'Amount must be greater than zero';
      end if;
      if new.amount > (select per_txn_limit from public.funds where id = old.fund_id) then
        raise exception 'Amount exceeds the per-transaction limit';
      end if;
    end if;
  end if;

  return new;
end $$;

-- Alphabetical trigger order matters: vouchers_protect_columns runs before
-- vouchers_set_updated_at, so a client-supplied updated_at is still rejected.
create trigger vouchers_protect_columns
  before update on public.vouchers
  for each row execute function public.protect_voucher_columns();

create or replace function public.protect_profile_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated')
     and public.app_role() is distinct from 'admin' then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.id is distinct from old.id
       or new.created_at is distinct from old.created_at then
      raise exception 'Only admins can change a role or active status';
    end if;
  end if;

  return new;
end $$;


-- Suppress linter warnings and evaluate the view's underlying RLS as the caller.
alter view public.fund_balance_v set (security_invoker = true);

-- ------------------------------------------------------------------ grants
-- RLS decides which rows; grants decide which operations PostgREST may attempt.
revoke all on table
  public.funds,
  public.categories,
  public.fund_counters,
  public.replenishments,
  public.vouchers,
  public.cash_counts,
  public.audit_log
from anon, authenticated;

revoke all on public.fund_balance_v from anon, authenticated;
revoke all on sequence public.replenishment_no_seq, public.audit_log_id_seq from anon, authenticated;

grant select on table
  public.funds,
  public.categories,
  public.replenishments,
  public.vouchers,
  public.cash_counts,
  public.audit_log
to authenticated;

grant select on public.fund_balance_v to authenticated;

grant insert, update on public.funds to authenticated;
grant insert, update on public.categories to authenticated;

-- Direct edits are limited to the descriptive voucher columns.
grant update (payee, particulars, amount, category_id, receipt_path, no_receipt_reason, voucher_date)
  on public.vouchers to authenticated;

-- Functions: remove the implicit PUBLIC grant, then allow signed-in users to
-- call the RPC surface. Helpers stay internal.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.oid not in (select oid from pg_temp.mad_functions)
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

grant execute on function public.app_role() to authenticated;

grant execute on function public.create_voucher(uuid, text, text, numeric, uuid, date, text, text) to authenticated;
grant execute on function public.submit_voucher(uuid) to authenticated;
grant execute on function public.approve_voucher(uuid) to authenticated;
grant execute on function public.reject_voucher(uuid, text) to authenticated;
grant execute on function public.release_voucher(uuid) to authenticated;
grant execute on function public.void_voucher(uuid, text) to authenticated;
grant execute on function public.create_replenishment(uuid) to authenticated;
grant execute on function public.submit_replenishment(uuid) to authenticated;
grant execute on function public.review_replenishment(uuid, boolean, text) to authenticated;
grant execute on function public.close_replenishment(uuid) to authenticated;
grant execute on function public.record_cash_count(uuid, numeric, text) to authenticated;

grant execute on function public.app_role() to service_role;
grant execute on function public.create_voucher(uuid, text, text, numeric, uuid, date, text, text) to service_role;
grant execute on function public.submit_voucher(uuid) to service_role;
grant execute on function public.approve_voucher(uuid) to service_role;
grant execute on function public.reject_voucher(uuid, text) to service_role;
grant execute on function public.release_voucher(uuid) to service_role;
grant execute on function public.void_voucher(uuid, text) to service_role;
grant execute on function public.create_replenishment(uuid) to service_role;
grant execute on function public.submit_replenishment(uuid) to service_role;
grant execute on function public.review_replenishment(uuid, boolean, text) to service_role;
grant execute on function public.close_replenishment(uuid) to service_role;
grant execute on function public.record_cash_count(uuid, numeric, text) to service_role;

-- ----------------------------------------------------------------- storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy receipts_read on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts');

create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.app_role() in ('custodian', 'admin')
  );

-- ======== from PCF 20261031120300_phase1_advisor_fixes.sql ========
-- Phase 1 advisor fixes: pin the timestamp trigger's search_path and evaluate
-- auth helpers once per query inside RLS policies.

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop policy funds_admin_insert on public.funds;
drop policy funds_admin_update on public.funds;

create policy funds_admin_insert on public.funds
  for insert to authenticated
  with check ((select public.app_role()) = 'admin');

create policy funds_admin_update on public.funds
  for update to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');

drop policy categories_admin_insert on public.categories;
drop policy categories_admin_update on public.categories;

create policy categories_admin_insert on public.categories
  for insert to authenticated
  with check ((select public.app_role()) = 'admin');

create policy categories_admin_update on public.categories
  for update to authenticated
  using ((select public.app_role()) = 'admin')
  with check ((select public.app_role()) = 'admin');

drop policy vouchers_custodian_update on public.vouchers;

create policy vouchers_custodian_update on public.vouchers
  for update to authenticated
  using (
    prepared_by = (select auth.uid())
    and status in ('draft', 'rejected')
  )
  with check (
    prepared_by = (select auth.uid())
    and status in ('draft', 'rejected')
  );

drop policy audit_log_select on public.audit_log;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using ((select public.app_role()) in ('admin', 'accounting'));

drop policy receipts_read on storage.objects;
drop policy receipts_insert on storage.objects;

create policy receipts_read on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts');

create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (select public.app_role()) in ('custodian', 'admin')
  );

-- ======== from PCF 20261031130000_phase4_release_first.sql ========
-- Release-first workflow: the custodian hands out cash immediately and the
-- approver reviews afterwards. Status now means:
--   draft -> released (cash out, awaiting review) -> approved (reviewed) -> closed
-- `rejected` is a post-release flag: the cash stays counted and the custodian
-- or an admin must correct or void the voucher. `void` stays terminal.

-- Normalize rows created under the old submit/approve-first flow. Rows that
-- never had cash released go back to draft; rows released after approval are
-- marked reviewed so they do not reappear in the approver queue.
update public.vouchers
set status = 'draft', reject_reason = null
where status = 'submitted';

update public.vouchers
set status = 'draft', reject_reason = null
where status in ('approved', 'rejected')
  and released_at is null;

update public.vouchers
set status = 'approved'
where status = 'released'
  and approved_at is not null;

-- Cash now leaves the fund before approval; the separate submit step is gone.
drop function if exists public.submit_voucher(uuid);

create or replace function public.release_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
  v_role public.pcf_role;
  v_expected numeric;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'draft' then
    raise exception 'Voucher cannot be released from status %', v_voucher.status;
  end if;
  if v_role = 'custodian' and v_voucher.prepared_by <> auth.uid() then
    raise exception 'You can only release your own vouchers';
  end if;
  if nullif(btrim(coalesce(v_voucher.receipt_path, '')), '') is null
     and nullif(btrim(coalesce(v_voucher.no_receipt_reason, '')), '') is null then
    raise exception 'Attach a receipt or provide a no-receipt reason';
  end if;

  -- Serialize releases per fund so two requests cannot both pass the cash check.
  perform 1 from public.funds where id = v_voucher.fund_id for update;

  select expected_cash into v_expected from public.fund_balance_v where fund_id = v_voucher.fund_id;
  if v_expected is null then
    raise exception 'Fund balance not found';
  end if;
  if v_voucher.amount > v_expected then
    raise exception 'Insufficient cash on hand: % available, % required', v_expected, v_voucher.amount;
  end if;

  update public.vouchers
  set status = 'released', released_at = now(), reject_reason = null
  where id = p_id;
end $$;

create or replace function public.approve_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
begin
  perform public.require_role(array['approver', 'admin']::public.pcf_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status not in ('released', 'rejected') then
    raise exception 'Voucher cannot be approved from status %', v_voucher.status;
  end if;
  if v_voucher.prepared_by = auth.uid() then
    raise exception 'You cannot approve a voucher you prepared';
  end if;

  update public.vouchers
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      reject_reason = null
  where id = p_id;
end $$;

create or replace function public.reject_voucher(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
begin
  perform public.require_role(array['approver', 'admin']::public.pcf_role[]);

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status not in ('released', 'approved') then
    raise exception 'Voucher cannot be flagged from status %', v_voucher.status;
  end if;

  -- The cash is already out, so the voucher stays counted until it is voided
  -- or corrected. Only the flag and its reason change here.
  update public.vouchers
  set status = 'rejected', reject_reason = btrim(p_reason)
  where id = p_id;
end $$;

create or replace function public.void_voucher(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
  v_role public.pcf_role;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A void reason is required';
  end if;

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status = 'closed' then
    raise exception 'Closed vouchers cannot be voided';
  end if;
  if v_role = 'custodian' then
    if v_voucher.prepared_by <> auth.uid() then
      raise exception 'You can only void your own vouchers';
    end if;
    if v_voucher.status <> 'draft' then
      raise exception 'Custodians can only void drafts; ask an admin to void released vouchers';
    end if;
  end if;

  -- DECISION: keep replenishment totals consistent by refusing to void a
  -- voucher that is currently bundled in a replenishment request.
  if v_voucher.replenishment_id is not null then
    raise exception 'Voucher is part of a replenishment request; review that request first';
  end if;

  update public.vouchers
  set status = 'void', void_reason = btrim(p_reason)
  where id = p_id;
end $$;

create or replace function public.create_replenishment(p_fund_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_total numeric(12,2);
  v_id uuid;
  v_no bigint;
  v_year int := extract(year from (now() at time zone 'Asia/Manila'))::int;
begin
  perform public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  perform 1 from public.funds where id = p_fund_id and is_active for update;
  if not found then
    raise exception 'Fund not found or inactive';
  end if;

  select count(*), coalesce(sum(amount), 0)
  into v_count, v_total
  from public.vouchers
  where fund_id = p_fund_id
    and status in ('released', 'approved', 'rejected')
    and replenishment_id is null;

  if v_count = 0 then
    raise exception 'No released vouchers are available to replenish';
  end if;

  v_no := nextval('public.replenishment_no_seq');

  insert into public.replenishments (fund_id, request_no, status, total, requested_by)
  values (
    p_fund_id,
    format('REP-%s-%s', v_year, lpad(v_no::text, 4, '0')),
    'draft',
    v_total,
    auth.uid()
  )
  returning id into v_id;

  update public.vouchers
  set replenishment_id = v_id
  where fund_id = p_fund_id
    and status in ('released', 'approved', 'rejected')
    and replenishment_id is null;

  return v_id;
end $$;

create or replace function public.close_replenishment(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_repl public.replenishments%rowtype;
begin
  perform public.require_role(array['accounting', 'admin']::public.pcf_role[]);

  select * into v_repl from public.replenishments where id = p_id for update;
  if not found then
    raise exception 'Replenishment not found';
  end if;
  if v_repl.status <> 'approved' then
    raise exception 'Replenishment cannot be closed from status %', v_repl.status;
  end if;
  if v_repl.reviewed_by is null then
    raise exception 'Replenishment must be reviewed before it can be closed';
  end if;

  -- DECISION: replenishment close does not wait for voucher approvals, so a
  -- slow approver never blocks restoring the fund.
  update public.vouchers
  set status = 'closed'
  where replenishment_id = p_id
    and status in ('released', 'approved', 'rejected');

  update public.replenishments set status = 'closed' where id = p_id;
end $$;

-- Cash is out for released, approved, and post-release rejected vouchers.
create or replace view public.fund_balance_v as
select
  f.id as fund_id,
  f.name,
  f.amount as fund_amount,
  coalesce(sum(v.amount) filter (
    where v.status in ('released', 'approved', 'rejected')
      and v.released_at is not null
  ), 0)::numeric(12,2) as released_vouchers_total,
  (f.amount - coalesce(sum(v.amount) filter (
    where v.status in ('released', 'approved', 'rejected')
      and v.released_at is not null
  ), 0))::numeric(12,2) as expected_cash,
  (
    f.amount - coalesce(sum(v.amount) filter (
      where v.status in ('released', 'approved', 'rejected')
        and v.released_at is not null
    ), 0)
  ) < f.amount * f.low_balance_pct / 100.0 as is_low
from public.funds f
left join public.vouchers v on v.fund_id = f.id
group by f.id, f.name, f.amount, f.low_balance_pct;

alter view public.fund_balance_v set (security_invoker = true);

-- Direct edits stay limited to drafts: a released voucher is a financial
-- record and must go through the review or void RPCs.
drop policy if exists vouchers_custodian_update on public.vouchers;
create policy vouchers_custodian_update on public.vouchers
  for update to authenticated
  using (prepared_by = auth.uid() and status = 'draft')
  with check (prepared_by = auth.uid() and status = 'draft');

-- ======== from PCF 20261102090000_phase11_notifications.sql ========
-- Phase 11: email notifications.
-- notification_log records every email the app tries to send (written by the
-- server with the service role; only admins can read it). notification_recipients
-- resolves active users by role to their sign-in email, for the server only.

create table if not exists public.notification_log (
  id bigint generated always as identity primary key,
  event text not null,
  entity_type text,
  entity_id uuid,
  recipient_id uuid,
  recipient_email text not null,
  subject text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists notification_log_created_at_idx
  on public.notification_log (created_at desc);

alter table public.notification_log enable row level security;

drop policy if exists notification_log_select on public.notification_log;
create policy notification_log_select on public.notification_log
  for select to authenticated
  using ((select public.app_role()) = 'admin');

revoke all on table public.notification_log from anon, authenticated;
grant select on table public.notification_log to authenticated;

create or replace function public.notification_recipients(
  p_roles public.pcf_role[],
  p_include uuid[] default '{}',
  p_exclude uuid[] default '{}'
)
returns table (id uuid, email text, full_name text, role public.pcf_role)
language sql stable security definer set search_path = public, auth as $$
  select p.id, u.email::text, p.full_name, coalesce(p.pcf_role, case when p.role = 'admin' then 'admin'::public.pcf_role end)
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.is_active
    and u.email is not null
    and (coalesce(p.pcf_role, case when p.role = 'admin' then 'admin'::public.pcf_role end) = any (p_roles) or p.id = any (p_include))
    and not (p.id = any (p_exclude));
$$;

revoke execute on function public.notification_recipients(public.pcf_role[], uuid[], uuid[])
  from public, anon, authenticated;
grant execute on function public.notification_recipients(public.pcf_role[], uuid[], uuid[])
  to service_role;

-- ======== from PCF 20261102100000_phase11_fund_custodians.sql ========
-- Phase 11: fund-specific custodians.
-- A fund has one accountable custodian (funds.custodian_id); a custodian can
-- hold many funds. Custodians only see and act on their own funds. Admins,
-- approvers, and accounting work across all funds.

create or replace function public.can_access_fund(p_fund_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select r.role is not null
    and (
      r.role <> 'custodian'
      or exists (
        select 1 from public.funds f
        where f.id = p_fund_id and f.custodian_id = auth.uid()
      )
    )
  from (select public.app_role() as role) r;
$$;

create or replace function public.require_fund_access(p_fund_id uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.app_role() = 'custodian'
     and not exists (
       select 1 from public.funds
       where id = p_fund_id and custodian_id = auth.uid()
     ) then
    raise exception 'You are not the custodian of this fund';
  end if;
end $$;

revoke execute on function public.can_access_fund(uuid) from public, anon;
grant execute on function public.can_access_fund(uuid) to authenticated, service_role;
revoke execute on function public.require_fund_access(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ reading
drop policy funds_select on public.funds;
create policy funds_select on public.funds
  for select to authenticated
  using (public.can_access_fund(id));

drop policy vouchers_select on public.vouchers;
create policy vouchers_select on public.vouchers
  for select to authenticated
  using (public.can_access_fund(fund_id));

drop policy replenishments_select on public.replenishments;
create policy replenishments_select on public.replenishments
  for select to authenticated
  using (public.can_access_fund(fund_id));

drop policy cash_counts_select on public.cash_counts;
create policy cash_counts_select on public.cash_counts
  for select to authenticated
  using (public.can_access_fund(fund_id));

-- Receipt photos live under {fund_id}/{voucher_id}/..., so the first folder
-- says which fund they belong to. The CASE keeps the uuid cast from running on
-- malformed paths.
drop policy receipts_read on storage.objects;
create policy receipts_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then public.can_access_fund(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

drop policy receipts_insert on storage.objects;
create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.app_role() in ('custodian', 'admin')
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then public.can_access_fund(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

-- ------------------------------------------------------------------- acting
create or replace function public.create_voucher(
  p_fund_id uuid,
  p_payee text,
  p_particulars text,
  p_amount numeric,
  p_category_id uuid,
  p_voucher_date date default current_date,
  p_receipt_path text default null,
  p_no_receipt_reason text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_fund public.funds%rowtype;
  v_category public.categories%rowtype;
  v_id uuid;
begin
  perform public.require_role(array['custodian', 'admin']::public.pcf_role[]);
  perform public.require_fund_access(p_fund_id);

  if nullif(btrim(coalesce(p_payee, '')), '') is null then
    raise exception 'Payee is required';
  end if;
  if nullif(btrim(coalesce(p_particulars, '')), '') is null then
    raise exception 'Particulars are required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  select * into v_fund from public.funds where id = p_fund_id and is_active;
  if not found then
    raise exception 'Fund not found or inactive';
  end if;
  if p_amount > v_fund.per_txn_limit then
    raise exception 'Amount exceeds the per-transaction limit of %', v_fund.per_txn_limit;
  end if;

  select * into v_category from public.categories where id = p_category_id and is_active;
  if not found then
    raise exception 'Category not found or inactive';
  end if;

  insert into public.vouchers (
    fund_id, pcv_number, voucher_date, payee, particulars, amount, category_id,
    status, receipt_path, no_receipt_reason, prepared_by
  ) values (
    p_fund_id,
    public.next_pcv_number(p_fund_id),
    coalesce(p_voucher_date, current_date),
    btrim(p_payee),
    btrim(p_particulars),
    round(p_amount, 2),
    p_category_id,
    'draft',
    nullif(btrim(coalesce(p_receipt_path, '')), ''),
    nullif(btrim(coalesce(p_no_receipt_reason, '')), ''),
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.release_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
  v_role public.pcf_role;
  v_expected numeric;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'draft' then
    raise exception 'Voucher cannot be released from status %', v_voucher.status;
  end if;
  if v_role = 'custodian' and v_voucher.prepared_by <> auth.uid() then
    raise exception 'You can only release your own vouchers';
  end if;
  perform public.require_fund_access(v_voucher.fund_id);
  if nullif(btrim(coalesce(v_voucher.receipt_path, '')), '') is null
     and nullif(btrim(coalesce(v_voucher.no_receipt_reason, '')), '') is null then
    raise exception 'Attach a receipt or provide a no-receipt reason';
  end if;

  -- Serialize releases per fund so two requests cannot both pass the cash check.
  perform 1 from public.funds where id = v_voucher.fund_id for update;

  select expected_cash into v_expected from public.fund_balance_v where fund_id = v_voucher.fund_id;
  if v_expected is null then
    raise exception 'Fund balance not found';
  end if;
  if v_voucher.amount > v_expected then
    raise exception 'Insufficient cash on hand: % available, % required', v_expected, v_voucher.amount;
  end if;

  update public.vouchers
  set status = 'released', released_at = now(), reject_reason = null
  where id = p_id;
end $$;

create or replace function public.create_replenishment(p_fund_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_total numeric(12,2);
  v_id uuid;
  v_no bigint;
  v_year int := extract(year from (now() at time zone 'Asia/Manila'))::int;
begin
  perform public.require_role(array['custodian', 'admin']::public.pcf_role[]);
  perform public.require_fund_access(p_fund_id);

  perform 1 from public.funds where id = p_fund_id and is_active for update;
  if not found then
    raise exception 'Fund not found or inactive';
  end if;

  select count(*), coalesce(sum(amount), 0)
  into v_count, v_total
  from public.vouchers
  where fund_id = p_fund_id
    and status in ('released', 'approved', 'rejected')
    and replenishment_id is null;

  if v_count = 0 then
    raise exception 'No released vouchers are available to replenish';
  end if;

  v_no := nextval('public.replenishment_no_seq');

  insert into public.replenishments (fund_id, request_no, status, total, requested_by)
  values (
    p_fund_id,
    format('REP-%s-%s', v_year, lpad(v_no::text, 4, '0')),
    'draft',
    v_total,
    auth.uid()
  )
  returning id into v_id;

  update public.vouchers
  set replenishment_id = v_id
  where fund_id = p_fund_id
    and status in ('released', 'approved', 'rejected')
    and replenishment_id is null;

  return v_id;
end $$;

create or replace function public.submit_replenishment(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_repl public.replenishments%rowtype;
  v_role public.pcf_role;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  select * into v_repl from public.replenishments where id = p_id for update;
  if not found then
    raise exception 'Replenishment not found';
  end if;
  if v_repl.status <> 'draft' then
    raise exception 'Replenishment cannot be submitted from status %', v_repl.status;
  end if;
  if v_role = 'custodian' and v_repl.requested_by <> auth.uid() then
    raise exception 'You can only submit your own replenishment requests';
  end if;
  perform public.require_fund_access(v_repl.fund_id);

  update public.replenishments set status = 'submitted' where id = p_id;
end $$;

create or replace function public.record_cash_count(
  p_fund_id uuid,
  p_counted numeric,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_expected numeric;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  perform public.require_role(array['custodian', 'admin']::public.pcf_role[]);
  perform public.require_fund_access(p_fund_id);

  if p_counted is null or p_counted < 0 then
    raise exception 'Counted cash must be zero or more';
  end if;

  select expected_cash into v_expected from public.fund_balance_v where fund_id = p_fund_id;
  if v_expected is null then
    raise exception 'Fund not found';
  end if;

  if p_counted <> v_expected and v_note is null then
    raise exception 'A note is required when the counted cash differs from expected cash';
  end if;

  insert into public.cash_counts (fund_id, counted_cash, expected_cash, note, counted_by)
  values (p_fund_id, round(p_counted, 2), v_expected, v_note, auth.uid())
  returning id into v_id;

  return v_id;
end $$;

-- ------------------------------------------------------------ assignment
-- Sets exactly which funds a custodian holds. Funds they held that are not in
-- the list become unassigned; listed funds move to them from whoever held them.
create or replace function public.assign_custodian_funds(p_user_id uuid, p_fund_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role(array['admin']::public.pcf_role[]);

  if not exists (
    select 1 from public.profiles
    where id = p_user_id and pcf_role = 'custodian' and is_active
  ) then
    raise exception 'Funds can only be assigned to an active custodian';
  end if;

  update public.funds
  set custodian_id = null
  where custodian_id = p_user_id
    and not (id = any (coalesce(p_fund_ids, '{}')));

  update public.funds
  set custodian_id = p_user_id
  where id = any (coalesce(p_fund_ids, '{}'))
    and is_active
    and custodian_id is distinct from p_user_id;
end $$;

revoke execute on function public.assign_custodian_funds(uuid, uuid[]) from public, anon;
grant execute on function public.assign_custodian_funds(uuid, uuid[]) to authenticated;

-- ======== from PCF 20261102110000_phase11_global_pcv_numbers.sql ========
-- Phase 11: voucher numbers must be unique across all funds (pcv_number has a
-- global unique constraint), but they were counted per fund, so a second fund
-- would restart at PCV-YYYY-0001 and collide.
-- DECISION: number vouchers sequentially across the whole system per year,
-- continuing from the highest number any fund has issued. Concurrent creations
-- are serialized per year with an advisory lock.
create or replace function public.next_pcv_number(p_fund_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_year int := extract(year from (now() at time zone 'Asia/Manila'))::int;
  v_no int;
begin
  perform pg_advisory_xact_lock(hashtext('pcv_number'), v_year);

  select coalesce(max(last_no), 0) + 1
  into v_no
  from public.fund_counters
  where year = v_year;

  insert into public.fund_counters (fund_id, year, last_no)
  values (p_fund_id, v_year, v_no)
  on conflict (fund_id, year) do update set last_no = excluded.last_no;

  return format('PCV-%s-%s', v_year, lpad(v_no::text, 4, '0'));
end $$;

-- ======== from PCF 20261103100000_phase12_pre_approval.sql ========
-- Phase 12: approval before release for larger vouchers.
-- Each fund has an approval_threshold (default 3,000). A voucher whose amount
-- is at or above it must be approved BEFORE cash is released:
--   draft -> submitted -> approved (released_at still null) -> released_at set
-- Smaller vouchers keep the release-first flow:
--   draft -> released -> approved
-- A pre-approved voucher is status 'approved'; whether its cash is out is
-- decided by released_at, which fund_balance_v already respects.

alter table public.funds
  add column if not exists approval_threshold numeric(12,2) not null default 3000
  check (approval_threshold > 0);

alter table public.vouchers
  add column if not exists submitted_at timestamptz;

create or replace function public.requires_pre_approval(p_fund_id uuid, p_amount numeric)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p_amount >= f.approval_threshold from public.funds f where f.id = p_fund_id),
    false
  );
$$;

revoke execute on function public.requires_pre_approval(uuid, numeric)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- submitting
create or replace function public.submit_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
  v_role public.pcf_role;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'draft' then
    raise exception 'Only drafts can be submitted for approval';
  end if;
  if v_role = 'custodian' and v_voucher.prepared_by <> auth.uid() then
    raise exception 'You can only submit your own vouchers';
  end if;
  perform public.require_fund_access(v_voucher.fund_id);

  if not public.requires_pre_approval(v_voucher.fund_id, v_voucher.amount) then
    raise exception 'This voucher is below the approval threshold; release it directly';
  end if;
  if nullif(btrim(coalesce(v_voucher.receipt_path, '')), '') is null
     and nullif(btrim(coalesce(v_voucher.no_receipt_reason, '')), '') is null then
    raise exception 'Attach a receipt or provide a no-receipt reason';
  end if;

  update public.vouchers
  set status = 'submitted', submitted_at = now(), reject_reason = null
  where id = p_id;
end $$;

revoke execute on function public.submit_voucher(uuid) from public, anon;
grant execute on function public.submit_voucher(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------- approving
create or replace function public.approve_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
begin
  perform public.require_role(array['approver', 'admin']::public.pcf_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status not in ('submitted', 'released', 'rejected') then
    raise exception 'Voucher cannot be approved from status %', v_voucher.status;
  end if;
  if v_voucher.prepared_by = auth.uid() then
    raise exception 'You cannot approve a voucher you prepared';
  end if;

  -- For a submitted voucher released_at stays null: approving only clears the
  -- custodian to hand over the cash.
  update public.vouchers
  set status = 'approved',
      approved_by = auth.uid(),
      approved_at = now(),
      reject_reason = null
  where id = p_id;
end $$;

-- Declines a request before any cash moved: it goes back to the custodian as
-- a draft, with the reason attached.
create or replace function public.return_voucher(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
begin
  perform public.require_role(array['approver', 'admin']::public.pcf_role[]);

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required';
  end if;

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'submitted' then
    raise exception 'Only vouchers awaiting approval can be returned';
  end if;
  if v_voucher.prepared_by = auth.uid() then
    raise exception 'You cannot return a voucher you prepared';
  end if;

  update public.vouchers
  set status = 'draft', submitted_at = null, reject_reason = btrim(p_reason)
  where id = p_id;
end $$;

revoke execute on function public.return_voucher(uuid, text) from public, anon;
grant execute on function public.return_voucher(uuid, text) to authenticated, service_role;

create or replace function public.reject_voucher(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
begin
  perform public.require_role(array['approver', 'admin']::public.pcf_role[]);

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A rejection reason is required';
  end if;

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status not in ('released', 'approved') then
    raise exception 'Voucher cannot be flagged from status %', v_voucher.status;
  end if;
  if v_voucher.released_at is null then
    raise exception 'Voucher has not been released yet; return or void it instead';
  end if;

  -- The cash is already out, so the voucher stays counted until it is voided
  -- or corrected. Only the flag and its reason change here.
  update public.vouchers
  set status = 'rejected', reject_reason = btrim(p_reason)
  where id = p_id;
end $$;

-- ----------------------------------------------------------------- releasing
create or replace function public.release_voucher(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
  v_role public.pcf_role;
  v_expected numeric;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;

  if v_voucher.status = 'approved' and v_voucher.released_at is null then
    null; -- pre-approved: cash can go out now
  elsif v_voucher.status = 'draft' then
    if public.requires_pre_approval(v_voucher.fund_id, v_voucher.amount) then
      raise exception 'This voucher needs approver approval before cash can be released; submit it for approval first';
    end if;
  elsif v_voucher.status = 'submitted' then
    raise exception 'This voucher is still waiting for approval';
  else
    raise exception 'Voucher cannot be released from status %', v_voucher.status;
  end if;

  if v_role = 'custodian' and v_voucher.prepared_by <> auth.uid() then
    raise exception 'You can only release your own vouchers';
  end if;
  perform public.require_fund_access(v_voucher.fund_id);
  if nullif(btrim(coalesce(v_voucher.receipt_path, '')), '') is null
     and nullif(btrim(coalesce(v_voucher.no_receipt_reason, '')), '') is null then
    raise exception 'Attach a receipt or provide a no-receipt reason';
  end if;

  -- Serialize releases per fund so two requests cannot both pass the cash check.
  perform 1 from public.funds where id = v_voucher.fund_id for update;

  select expected_cash into v_expected from public.fund_balance_v where fund_id = v_voucher.fund_id;
  if v_expected is null then
    raise exception 'Fund balance not found';
  end if;
  if v_voucher.amount > v_expected then
    raise exception 'Insufficient cash on hand: % available, % required', v_expected, v_voucher.amount;
  end if;

  if v_voucher.status = 'approved' then
    update public.vouchers set released_at = now() where id = p_id;
  else
    update public.vouchers
    set status = 'released', released_at = now(), reject_reason = null
    where id = p_id;
  end if;
end $$;

-- -------------------------------------------------------------------- voiding
create or replace function public.void_voucher(p_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_voucher public.vouchers%rowtype;
  v_role public.pcf_role;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A void reason is required';
  end if;

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status = 'closed' then
    raise exception 'Closed vouchers cannot be voided';
  end if;
  if v_role = 'custodian' then
    if v_voucher.prepared_by <> auth.uid() then
      raise exception 'You can only void your own vouchers';
    end if;
    if v_voucher.status not in ('draft', 'submitted') then
      raise exception 'Custodians can only void drafts or requests awaiting approval; ask an admin to void released vouchers';
    end if;
  end if;

  -- DECISION: keep replenishment totals consistent by refusing to void a
  -- voucher that is currently bundled in a replenishment request.
  if v_voucher.replenishment_id is not null then
    raise exception 'Voucher is part of a replenishment request; review that request first';
  end if;

  update public.vouchers
  set status = 'void', void_reason = btrim(p_reason)
  where id = p_id;
end $$;

-- ------------------------------------------------------------- replenishments
-- Only vouchers whose cash actually left the fund are reimbursed: a
-- pre-approved voucher that has not been released yet is status 'approved' too.
create or replace function public.create_replenishment(p_fund_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  v_total numeric(12,2);
  v_id uuid;
  v_no bigint;
  v_year int := extract(year from (now() at time zone 'Asia/Manila'))::int;
begin
  perform public.require_role(array['custodian', 'admin']::public.pcf_role[]);
  perform public.require_fund_access(p_fund_id);

  perform 1 from public.funds where id = p_fund_id and is_active for update;
  if not found then
    raise exception 'Fund not found or inactive';
  end if;

  select count(*), coalesce(sum(amount), 0)
  into v_count, v_total
  from public.vouchers
  where fund_id = p_fund_id
    and status in ('released', 'approved', 'rejected')
    and released_at is not null
    and replenishment_id is null;

  if v_count = 0 then
    raise exception 'No released vouchers are available to replenish';
  end if;

  v_no := nextval('public.replenishment_no_seq');

  insert into public.replenishments (fund_id, request_no, status, total, requested_by)
  values (
    p_fund_id,
    format('REP-%s-%s', v_year, lpad(v_no::text, 4, '0')),
    'draft',
    v_total,
    auth.uid()
  )
  returning id into v_id;

  update public.vouchers
  set replenishment_id = v_id
  where fund_id = p_fund_id
    and status in ('released', 'approved', 'rejected')
    and released_at is not null
    and replenishment_id is null;

  return v_id;
end $$;

create or replace function public.close_replenishment(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_repl public.replenishments%rowtype;
begin
  perform public.require_role(array['accounting', 'admin']::public.pcf_role[]);

  select * into v_repl from public.replenishments where id = p_id for update;
  if not found then
    raise exception 'Replenishment not found';
  end if;
  if v_repl.status <> 'approved' then
    raise exception 'Replenishment cannot be closed from status %', v_repl.status;
  end if;
  if v_repl.reviewed_by is null then
    raise exception 'Replenishment must be reviewed before it can be closed';
  end if;

  -- DECISION: replenishment close does not wait for voucher approvals, so a
  -- slow approver never blocks restoring the fund.
  update public.vouchers
  set status = 'closed'
  where replenishment_id = p_id
    and status in ('released', 'approved', 'rejected')
    and released_at is not null;

  update public.replenishments set status = 'closed' where id = p_id;
end $$;

-- ======== from PCF 20261103110000_phase13_voucher_lines.sql ========
-- Phase 13: one voucher, many lines (particulars + amount + category each).
-- vouchers.amount stays the total, vouchers.particulars a one-line summary and
-- vouchers.category_id the category of the largest line, so balances, approvals
-- and replenishments keep working unchanged. voucher_items holds the detail.

create table public.voucher_items (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  position int not null check (position > 0),
  particulars text not null check (btrim(particulars) <> ''),
  amount numeric(12,2) not null check (amount > 0),
  category_id uuid not null references public.categories(id),
  unique (voucher_id, position)
);

create index voucher_items_category_idx on public.voucher_items (category_id);

alter table public.voucher_items enable row level security;
create policy voucher_items_select on public.voucher_items
  for select to authenticated using (true);

revoke all on public.voucher_items from anon, authenticated;
grant select on public.voucher_items to authenticated;

-- Existing vouchers become single-line vouchers.
insert into public.voucher_items (voucher_id, position, particulars, amount, category_id)
select id, 1, particulars, amount, category_id from public.vouchers;

-- Lines are written only by the RPC; keep the summary columns in step with them.
revoke update (particulars, amount, category_id) on public.vouchers from authenticated;

create or replace function public.create_voucher_lines(
  p_fund_id uuid,
  p_payee text,
  p_items jsonb,
  p_voucher_date date default current_date,
  p_receipt_path text default null,
  p_no_receipt_reason text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_fund public.funds%rowtype;
  v_id uuid;
  v_item jsonb;
  v_pos int := 0;
  v_total numeric(12,2) := 0;
  v_amount numeric(12,2);
  v_text text;
  v_summary text;
  v_top_category uuid;
  v_top_amount numeric(12,2) := 0;
  v_category uuid;
begin
  perform public.require_role(array['custodian', 'admin']::public.pcf_role[]);
  perform public.require_fund_access(p_fund_id);

  if nullif(btrim(coalesce(p_payee, '')), '') is null then
    raise exception 'Payee is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 then
    raise exception 'Add at least one line';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'A voucher can have at most 20 lines';
  end if;

  select * into v_fund from public.funds where id = p_fund_id and is_active;
  if not found then
    raise exception 'Fund not found or inactive';
  end if;

  -- First pass: validate every line and total them.
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_text := nullif(btrim(coalesce(v_item->>'particulars', '')), '');
    if v_text is null then
      raise exception 'Every line needs particulars';
    end if;
    begin
      v_amount := round((v_item->>'amount')::numeric, 2);
    exception when others then
      raise exception 'Every line needs a valid amount';
    end;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Every line amount must be greater than zero';
    end if;
    begin
      v_category := (v_item->>'category_id')::uuid;
    exception when others then
      raise exception 'Every line needs a category';
    end;
    perform 1 from public.categories where id = v_category and is_active;
    if not found then
      raise exception 'Category not found or inactive';
    end if;
    v_total := v_total + v_amount;
  end loop;

  if v_total > v_fund.per_txn_limit then
    raise exception 'Amount exceeds the per-transaction limit of %', v_fund.per_txn_limit;
  end if;

  select string_agg(btrim(e->>'particulars'), '; ' order by ord)
    into v_summary
    from jsonb_array_elements(p_items) with ordinality as t(e, ord);
  v_summary := left(v_summary, 500);

  select (e->>'category_id')::uuid into v_top_category
    from jsonb_array_elements(p_items) with ordinality as t(e, ord)
    order by round((e->>'amount')::numeric, 2) desc, ord
    limit 1;

  insert into public.vouchers (
    fund_id, pcv_number, voucher_date, payee, particulars, amount, category_id,
    status, receipt_path, no_receipt_reason, prepared_by
  ) values (
    p_fund_id,
    public.next_pcv_number(p_fund_id),
    coalesce(p_voucher_date, current_date),
    btrim(p_payee),
    v_summary,
    v_total,
    v_top_category,
    'draft',
    nullif(btrim(coalesce(p_receipt_path, '')), ''),
    nullif(btrim(coalesce(p_no_receipt_reason, '')), ''),
    auth.uid()
  )
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    insert into public.voucher_items (voucher_id, position, particulars, amount, category_id)
    values (
      v_id, v_pos, btrim(v_item->>'particulars'),
      round((v_item->>'amount')::numeric, 2), (v_item->>'category_id')::uuid
    );
  end loop;

  return v_id;
end $$;

revoke execute on function public.create_voucher_lines(uuid, text, jsonb, date, text, text)
  from public, anon;
grant execute on function public.create_voucher_lines(uuid, text, jsonb, date, text, text)
  to authenticated, service_role;

-- The single-line RPC stays (tests, scripts) and now delegates.
create or replace function public.create_voucher(
  p_fund_id uuid,
  p_payee text,
  p_particulars text,
  p_amount numeric,
  p_category_id uuid,
  p_voucher_date date default current_date,
  p_receipt_path text default null,
  p_no_receipt_reason text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if nullif(btrim(coalesce(p_particulars, '')), '') is null then
    raise exception 'Particulars are required';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  return public.create_voucher_lines(
    p_fund_id, p_payee,
    jsonb_build_array(jsonb_build_object(
      'particulars', p_particulars, 'amount', p_amount, 'category_id', p_category_id)),
    p_voucher_date, p_receipt_path, p_no_receipt_reason
  );
end $$;

-- ======== from PCF 20261103120000_phase15_edit_draft_voucher.sql ========
-- Phase 15: a custodian can correct the payee, date and lines of their own
-- draft voucher. Submitted and released vouchers stay locked.

create or replace function public.update_voucher_lines(
  p_id uuid,
  p_payee text,
  p_items jsonb,
  p_voucher_date date default current_date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role public.pcf_role;
  v_voucher public.vouchers%rowtype;
  v_fund public.funds%rowtype;
  v_item jsonb;
  v_pos int := 0;
  v_total numeric(12,2) := 0;
  v_amount numeric(12,2);
  v_category uuid;
  v_summary text;
  v_top_category uuid;
begin
  v_role := public.require_role(array['custodian', 'admin']::public.pcf_role[]);

  select * into v_voucher from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'Voucher not found';
  end if;
  if v_voucher.status <> 'draft' then
    raise exception 'Only drafts can be edited';
  end if;
  if v_voucher.prepared_by <> auth.uid() then
    raise exception 'You can only edit your own vouchers';
  end if;
  perform public.require_fund_access(v_voucher.fund_id);

  if nullif(btrim(coalesce(p_payee, '')), '') is null then
    raise exception 'Payee is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 then
    raise exception 'Add at least one line';
  end if;
  if jsonb_array_length(p_items) > 20 then
    raise exception 'A voucher can have at most 20 lines';
  end if;

  select * into v_fund from public.funds where id = v_voucher.fund_id and is_active;
  if not found then
    raise exception 'Fund not found or inactive';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if nullif(btrim(coalesce(v_item->>'particulars', '')), '') is null then
      raise exception 'Every line needs particulars';
    end if;
    begin
      v_amount := round((v_item->>'amount')::numeric, 2);
    exception when others then
      raise exception 'Every line needs a valid amount';
    end;
    if v_amount is null or v_amount <= 0 then
      raise exception 'Every line amount must be greater than zero';
    end if;
    begin
      v_category := (v_item->>'category_id')::uuid;
    exception when others then
      raise exception 'Every line needs a category';
    end;
    perform 1 from public.categories where id = v_category and is_active;
    if not found then
      raise exception 'Category not found or inactive';
    end if;
    v_total := v_total + v_amount;
  end loop;

  if v_total > v_fund.per_txn_limit then
    raise exception 'Amount exceeds the per-transaction limit of %', v_fund.per_txn_limit;
  end if;

  select left(string_agg(btrim(e->>'particulars'), '; ' order by ord), 500)
    into v_summary
    from jsonb_array_elements(p_items) with ordinality as t(e, ord);

  select (e->>'category_id')::uuid into v_top_category
    from jsonb_array_elements(p_items) with ordinality as t(e, ord)
    order by round((e->>'amount')::numeric, 2) desc, ord
    limit 1;

  update public.vouchers
  set payee = btrim(p_payee),
      voucher_date = coalesce(p_voucher_date, voucher_date),
      particulars = v_summary,
      amount = v_total,
      category_id = v_top_category
  where id = p_id;

  delete from public.voucher_items where voucher_id = p_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos + 1;
    insert into public.voucher_items (voucher_id, position, particulars, amount, category_id)
    values (
      p_id, v_pos, btrim(v_item->>'particulars'),
      round((v_item->>'amount')::numeric, 2), (v_item->>'category_id')::uuid
    );
  end loop;
end $$;

revoke execute on function public.update_voucher_lines(uuid, text, jsonb, date)
  from public, anon;
grant execute on function public.update_voucher_lines(uuid, text, jsonb, date)
  to authenticated, service_role;

-- ======== from PCF 20261103130000_phase16_security_hardening.sql ========
-- Phase 16: security hardening.
-- 1. Text columns get length limits and may not contain control characters, so
--    even a direct database write cannot store oversized or binary-ish input.
--    Constraints are NOT VALID: they apply to every new or changed row without
--    failing on historical data.
-- 2. A small fixed-window rate limiter used by the app for sign-in codes,
--    code checks and receipt scans.

do $$
declare
  spec text[];
  specs text[][] := array[
    ['profiles',       'full_name',         '100'],
    ['funds',          'name',              '80'],
    ['categories',     'name',              '60'],
    ['vouchers',       'payee',             '120'],
    ['vouchers',       'particulars',       '500'],
    ['vouchers',       'no_receipt_reason', '300'],
    ['vouchers',       'reject_reason',     '300'],
    ['vouchers',       'void_reason',       '300'],
    ['voucher_items',  'particulars',       '300'],
    ['replenishments', 'review_note',       '300'],
    ['cash_counts',    'note',              '300']
  ];
begin
  foreach spec slice 1 in array specs loop
    execute format(
      'alter table public.%I add constraint %I check (%I is null or (char_length(%I) <= %s and %I !~ %L)) not valid',
      spec[1], spec[1] || '_' || spec[2] || '_safe_text', spec[2], spec[2], spec[3], spec[2],
      '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
    );
  end loop;
end $$;

create table public.rate_limits (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Counts one hit for `p_key` and says whether it is still within the limit.
create or replace function public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_window timestamptz;
  v_hits int;
begin
  if p_key is null or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit call';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits (key, window_start, hits)
  values (left(p_key, 200), v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  -- Occasionally sweep old windows so the table stays tiny.
  if random() < 0.02 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end $$;

revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

-- ======== from PCF 20261103140000_phase17_approver_creates_vouchers.sql ========
-- Phase 17: approvers can prepare vouchers too.
-- They get the same rights a custodian has over their OWN vouchers (create,
-- edit a draft, submit, release, void a draft). They still cannot approve a
-- voucher they prepared, and they cannot touch other people's vouchers.
do $$
declare
  fn text;
  def text;
begin
  foreach fn in array array[
    'create_voucher_lines', 'update_voucher_lines', 'submit_voucher',
    'release_voucher', 'void_voucher'
  ] loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = fn;

    def := replace(def,
      'array[''custodian'', ''admin'']::public.pcf_role[]',
      'array[''custodian'', ''approver'', ''admin'']::public.pcf_role[]');
    -- Anywhere the code limited a custodian to their own vouchers, limit approvers too.
    def := replace(def, 'v_role = ''custodian''', 'v_role in (''custodian'', ''approver'')');
    def := replace(def, 'Custodians can only void', 'You can only void');

    execute def;
  end loop;
end $$;

-- ======== from PCF 20261103150000_phase18_multiple_custodians.sql ========
-- Phase 18: a fund can have several custodians.
-- fund_custodians becomes the single source of truth; funds.custodian_id goes.
-- Any assigned custodian may prepare and release their own vouchers, count the
-- cash and request replenishments for that fund.

create table public.fund_custodians (
  fund_id uuid not null references public.funds(id) on delete cascade,
  custodian_id uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (fund_id, custodian_id)
);

create index fund_custodians_custodian_idx on public.fund_custodians (custodian_id);

alter table public.fund_custodians enable row level security;
create policy fund_custodians_select on public.fund_custodians
  for select to authenticated using (public.app_role() is not null);

revoke all on public.fund_custodians from anon, authenticated;
grant select on public.fund_custodians to authenticated;

insert into public.fund_custodians (fund_id, custodian_id)
select id, custodian_id from public.funds where custodian_id is not null
on conflict do nothing;

create or replace function public.can_access_fund(p_fund_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select r.role is not null
    and (
      r.role <> 'custodian'
      or exists (
        select 1 from public.fund_custodians fc
        where fc.fund_id = p_fund_id and fc.custodian_id = auth.uid()
      )
    )
  from (select public.app_role() as role) r;
$$;

create or replace function public.require_fund_access(p_fund_id uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.app_role() = 'custodian'
     and not exists (
       select 1 from public.fund_custodians
       where fund_id = p_fund_id and custodian_id = auth.uid()
     ) then
    raise exception 'You are not a custodian of this fund';
  end if;
end $$;

alter table public.funds drop column custodian_id;

-- Sets exactly which funds this custodian holds. Other custodians of those
-- funds are not affected.
create or replace function public.assign_custodian_funds(p_user_id uuid, p_fund_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.require_role(array['admin']::public.pcf_role[]);

  if not exists (
    select 1 from public.profiles
    where id = p_user_id and pcf_role = 'custodian' and is_active
  ) then
    raise exception 'Funds can only be assigned to an active custodian';
  end if;

  delete from public.fund_custodians
  where custodian_id = p_user_id
    and not (fund_id = any (coalesce(p_fund_ids, '{}')));

  insert into public.fund_custodians (fund_id, custodian_id)
  select f.id, p_user_id
  from public.funds f
  where f.id = any (coalesce(p_fund_ids, '{}')) and f.is_active
  on conflict do nothing;
end $$;

-- Sets exactly which custodians a fund has.
create or replace function public.set_fund_custodians(p_fund_id uuid, p_custodian_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[] := coalesce(p_custodian_ids, '{}');
begin
  perform public.require_role(array['admin']::public.pcf_role[]);

  if not exists (select 1 from public.funds where id = p_fund_id) then
    raise exception 'Fund not found';
  end if;
  if cardinality(v_ids) > 20 then
    raise exception 'A fund can have at most 20 custodians';
  end if;
  if (select count(*) from public.profiles
      where id = any (v_ids) and pcf_role = 'custodian' and is_active)
     <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'Funds can only be assigned to an active custodian';
  end if;

  delete from public.fund_custodians
  where fund_id = p_fund_id and not (custodian_id = any (v_ids));

  insert into public.fund_custodians (fund_id, custodian_id)
  select p_fund_id, x from unnest(v_ids) x
  on conflict do nothing;
end $$;

revoke execute on function public.assign_custodian_funds(uuid, uuid[]) from public, anon;
grant execute on function public.assign_custodian_funds(uuid, uuid[]) to authenticated, service_role;
revoke execute on function public.set_fund_custodians(uuid, uuid[]) from public, anon;
grant execute on function public.set_fund_custodians(uuid, uuid[]) to authenticated, service_role;

-- ======== from PCF 20261103160000_phase19_paper_voucher_drive.sql ========
-- Phase 19: keep the photo of the signed paper voucher, and remember where
-- copies were mirrored in Google Drive.
-- Also lets approvers upload photos for the vouchers they prepare (phase 17
-- gave them voucher rights but the storage policy was not widened).

alter table public.vouchers
  add column paper_voucher_path text,
  add column paper_drive_url text,
  add column receipt_drive_url text;

alter table public.vouchers
  add constraint vouchers_paper_voucher_path_len check (char_length(paper_voucher_path) <= 300) not valid,
  add constraint vouchers_paper_drive_url_len check (char_length(paper_drive_url) <= 500) not valid,
  add constraint vouchers_receipt_drive_url_len check (char_length(receipt_drive_url) <= 500) not valid;

-- The preparer attaches the paper photo themselves (RLS limits it to their own
-- drafts). The Drive links are written only by the server with its own key.
grant update (paper_voucher_path) on public.vouchers to authenticated;

drop policy receipts_insert on storage.objects;
create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.app_role() in ('custodian', 'approver', 'admin')
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then public.can_access_fund(((storage.foldername(name))[1])::uuid)
      else false
    end
  );


drop table pg_temp.mad_functions;
