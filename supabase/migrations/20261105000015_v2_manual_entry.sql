-- Version 2: staff fill the Acknowledgement of Payment by hand (no photo reading), every receipt
-- is approved by an Approver, and the money rules live here as well as in the app.
--
-- This replaces the photo-based tables (receipt_drafts, deals, receipts, salespeople, sync_jobs)
-- and their functions. There was no live deal or receipt data when this was written.

-- ======================= 1. Remove version 1 =======================
drop view if exists public.deal_summaries cascade;
drop view if exists public.receipt_list cascade;
drop function if exists public.confirm_receipt cascade;
drop function if exists public.void_receipt cascade;
drop function if exists public.cancel_deal cascade;
drop function if exists public.update_deal_details cascade;
drop function if exists public.queue_sync cascade;
drop function if exists public.claim_sync_jobs cascade;
drop function if exists public.deal_terms_from_payload cascade;
drop function if exists public.check_salespeople cascade;
drop function if exists public.parse_money cascade;
drop function if exists public.parse_percent cascade;
drop table if exists public.deal_salespeople, public.salespeople, public.sync_jobs,
  public.receipts, public.receipt_drafts, public.deals cascade;

-- ======================= 2. Roles =======================
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'sales' where role = 'staff';
alter table public.profiles alter column role set default 'sales';
alter table public.profiles add constraint profiles_role_check check (role in ('sales', 'admin', 'approver'));

create function public.is_approver()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'approver'); $$;

create function public.is_admin_or_approver()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'approver')); $$;

-- ======================= 3. Small helpers =======================
create function public.manila_today() returns date language sql stable set search_path = ''
as $$ select (now() at time zone 'Asia/Manila')::date; $$;

-- Plates are compared without spaces or dashes: "NBC 4821" and "nbc-4821" are the same car.
create function public.normalize_plate(p_text text) returns text language sql immutable set search_path = ''
as $$ select upper(regexp_replace(coalesce(p_text, ''), '[^A-Za-z0-9]', '', 'g')); $$;

-- A peso amount from JSON ("720000", "720,000.50", 720000) as numeric(12,2); null when blank.
create function public.to_num(p_value text) returns numeric language sql immutable set search_path = ''
as $$ select round(nullif(btrim(replace(coalesce(p_value, ''), ',', '')), '')::numeric, 2); $$;

-- The money rules for one deal (the same rules the app uses to show the numbers):
--   share = what the buyer owes before the trade-in: the down payment for financing, else the price
--   loan  = price - share (paid to us by the lender, never in the buyer's balance)
--   due   = share - trade-in value (what the buyer must pay us; negative means we pay the buyer)
create function public.deal_math(p_price numeric, p_sale text, p_dp numeric, p_trade numeric)
returns table (share numeric, loan numeric, due numeric)
language sql immutable set search_path = ''
as $$
  select s, p_price - s, s - coalesce(p_trade, 0)
  from (select case when p_sale = 'financing' then least(coalesce(p_dp, 0), p_price) else p_price end as s) x;
$$;

-- ======================= 4. Tables =======================
create sequence public.deal_no_seq start 1001;

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  deal_no text not null unique default ('D' || nextval('public.deal_no_seq')),
  buyer_name text not null check (btrim(buyer_name) <> ''),
  buyer_address text,
  buyer_contact text,
  sale_type text not null check (sale_type in ('cash', 'financing')),
  institution text,
  agreed_price numeric(12, 2) not null check (agreed_price > 0),
  down_payment numeric(12, 2) check (down_payment is null or down_payment > 0),
  loan_amount numeric(12, 2) not null default 0 check (loan_amount >= 0),
  processing_fee numeric(12, 2) not null default 0 check (processing_fee >= 0), -- owed to the lender, information only
  monthly_payment numeric(12, 2),
  years numeric(4, 1),
  opening_paid numeric(12, 2) not null default 0 check (opening_paid >= 0), -- received before the first receipt in the system
  trade_in_value numeric(12, 2) not null default 0 check (trade_in_value >= 0),
  trade_in jsonb,                               -- { year, unit, plate, mileage }
  amount_due numeric(12, 2) not null,           -- what the buyer must pay us; negative: we pay the buyer
  lieu_amount numeric(12, 2) not null default 0 check (lieu_amount >= 0), -- documents we hold as collateral
  lieu_until date,
  due_date date,
  due_text text,
  loan_status text not null default 'none' check (loan_status in ('none', 'waiting', 'released')),
  loan_since date,
  loan_released_on date,
  status text not null default 'open' check (status in ('open', 'cancelled')),
  cancelled_at timestamptz,
  cancel_reason text,
  refund_amount numeric(12, 2),
  terms jsonb not null,                         -- the form as first filled in, without payments
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sale_type = 'financing' or (loan_amount = 0 and processing_fee = 0 and institution is null)),
  check (sale_type = 'cash' or (down_payment is not null and institution is not null))
);

create trigger deals_set_updated_at before update on public.deals
  for each row execute function public.set_updated_at();
create index deals_status_idx on public.deals (status, created_at desc);

create table public.deal_units (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  position int not null,
  make_type text not null,
  plate_no text not null check (plate_no ~ '^[A-Z0-9]+$'),   -- normalized
  plate_display text not null,
  motor_no text,
  chassis_no text,
  color text,
  active boolean not null default true,                       -- false once the deal is cancelled
  unique (deal_id, position)
);
-- A car can be in only one live deal.
create unique index deal_units_one_live_deal_per_plate on public.deal_units (plate_no) where active;

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id),
  receipt_no text not null unique check (btrim(receipt_no) <> ''),
  receipt_date date not null,
  kind text not null check (kind in ('earnest', 'partial', 'full')),
  amount numeric(12, 2) not null check (amount >= 0),          -- paid with this receipt
  payout numeric(12, 2) not null default 0 check (payout >= 0), -- cash we handed the buyer (trade-in worth more)
  balance_after numeric(12, 2) not null,                       -- counting every receipt filled in before it
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'void')),
  submitted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  reject_reason text,
  void_reason text,
  voided_by uuid references public.profiles (id),
  voided_at timestamptz,
  remarks text,
  notes jsonb,
  snapshot jsonb not null,                                      -- the whole form, to print the receipt again
  drive_file_id text,
  created_at timestamptz not null default now()
);
create index receipts_deal_idx on public.receipts (deal_id, created_at);
create index receipts_status_idx on public.receipts (status, submitted_at);
create index receipts_date_idx on public.receipts (receipt_date);

create table public.receipt_payments (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  position int not null,
  method text not null check (method in ('cash', 'check', 'wallet')),
  label text not null,                                          -- Cash, Check, GCash, Bank transfer...
  amount numeric(12, 2) not null check (amount > 0),
  reference text,
  check_no text,
  bank text,
  branch text,
  unique (receipt_id, position)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  payment_id uuid references public.receipt_payments (id) on delete cascade, -- null for the payout
  purpose text not null check (purpose in ('payment', 'payout')),
  storage_path text not null unique,
  filename text not null,
  mime_type text,
  size_bytes int,
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index attachments_receipt_idx on public.attachments (receipt_id);

-- Everything the Admin can change in Settings, as one document (the app fills in defaults).
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  config jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id),
  target text not null check (target in ('drive', 'sheets', 'telegram', 'inventory')),
  event text not null default 'confirm' check (event in ('confirm', 'void', 'cancel', 'edit')),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_id, target, event)
);
create index sync_jobs_due_idx on public.sync_jobs (next_run_at) where status <> 'done';
create trigger sync_jobs_set_updated_at before update on public.sync_jobs
  for each row execute function public.set_updated_at();

create function public.queue_sync(p_receipt_id uuid, p_event text, p_targets text[])
returns void language sql security definer set search_path = ''
as $$
  insert into public.sync_jobs (receipt_id, target, event)
  select p_receipt_id, t, p_event from unnest(p_targets) as t
  on conflict (receipt_id, target, event)
  do update set status = 'pending', attempts = 0, last_error = null, next_run_at = now();
$$;

create function public.claim_sync_jobs(p_limit int default 20, p_receipt_id uuid default null)
returns setof public.sync_jobs language sql security definer set search_path = ''
as $$
  update public.sync_jobs j set next_run_at = now() + interval '5 minutes'
  where j.id in (
    select id from public.sync_jobs
    where status <> 'done' and attempts < 5 and next_run_at <= now()
      and (p_receipt_id is null or receipt_id = p_receipt_id)
    order by next_run_at, created_at limit p_limit for update skip locked
  )
  returning j.*;
$$;

-- ======================= 5. Submit a receipt =======================
-- Fills in one receipt (a new deal, or a new payment on an open deal) and sends it to the Approver.
-- The server recomputes every number from the raw amounts; nothing is trusted from the screen.
--
-- payload: { deal_id?, receipt_no, receipt_date, kind, buyer:{name,address,contact},
--   units:[{make_type,plate,motor,chassis,color}], price, sale_type, institution, down_payment,
--   processing_fee, monthly, years, trade_in:{value,year,unit,plate,mileage}|null,
--   lieu:{amount,until}|null, due:{mode,date,text}, terms:{...}, snapshot:{...}, remarks, notes,
--   payments:[{method,label,amount,reference,check_no,bank,branch,attachments:[{path,filename,mime,size}]}],
--   payout:{amount,attachments}|null }
create function public.submit_receipt(p_actor uuid, p_payload jsonb, p_require_proofs boolean default true)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_deal public.deals;
  v_deal_id uuid := nullif(p_payload ->> 'deal_id', '')::uuid;
  v_new boolean := v_deal_id is null;
  v_no text := btrim(coalesce(p_payload ->> 'receipt_no', ''));
  v_date date := coalesce(nullif(p_payload ->> 'receipt_date', '')::date, public.manila_today());
  v_kind text := p_payload ->> 'kind';
  v_buyer jsonb := coalesce(p_payload -> 'buyer', '{}'::jsonb);
  v_trade jsonb := p_payload -> 'trade_in';
  v_lieu jsonb := p_payload -> 'lieu';
  v_due_in jsonb := coalesce(p_payload -> 'due', '{}'::jsonb);
  v_price numeric; v_sale text; v_dp numeric; v_fee numeric; v_tv numeric := 0;
  v_share numeric; v_loan numeric; v_due numeric;
  v_opening numeric := 0; v_earlier_paid numeric := 0; v_earlier_payout numeric := 0;
  v_paid numeric := 0; v_payout numeric := 0; v_balance numeric;
  v_receipt public.receipts; v_payment_id uuid; v_pos int := 0;
  v_pay jsonb; v_att jsonb; v_unit jsonb; v_amt numeric; v_method text;
  v_date_text text; v_due_date date;
begin
  if not exists (select 1 from public.profiles where id = p_actor) then raise exception 'not_signed_in'; end if;
  if v_no = '' then raise exception 'receipt_no_required'; end if;
  if v_kind is null or v_kind not in ('earnest', 'partial', 'full') then raise exception 'kind_invalid'; end if;
  if jsonb_typeof(p_payload -> 'payments') is distinct from 'array' then raise exception 'payment_required'; end if;

  perform pg_advisory_xact_lock(hashtext('submit_receipt'));

  if v_new then
    -- ---- terms of a new deal ----
    if btrim(coalesce(v_buyer ->> 'name', '')) = '' then raise exception 'buyer_required'; end if;
    if jsonb_typeof(p_payload -> 'units') is distinct from 'array' or jsonb_array_length(p_payload -> 'units') = 0 then
      raise exception 'unit_required';
    end if;
    v_price := public.to_num(p_payload ->> 'price');
    v_sale := p_payload ->> 'sale_type';
    if v_price is null or v_price <= 0 then raise exception 'price_required'; end if;
    if v_sale is null or v_sale not in ('cash', 'financing') then raise exception 'sale_type_invalid'; end if;
    v_dp := case when v_sale = 'financing' then public.to_num(p_payload ->> 'down_payment') end;
    v_fee := case when v_sale = 'financing' then coalesce(public.to_num(p_payload ->> 'processing_fee'), 0) else 0 end;
    if v_trade is not null and jsonb_typeof(v_trade) = 'object' then v_tv := coalesce(public.to_num(v_trade ->> 'value'), 0); end if;
    if v_tv < 0 then raise exception 'trade_in_invalid'; end if;
    v_opening := coalesce(public.to_num(p_payload ->> 'earlier'), 0);
    if v_opening < 0 then raise exception 'earlier_invalid'; end if;
    if v_sale = 'financing' then
      if btrim(coalesce(p_payload ->> 'institution', '')) = '' then raise exception 'institution_required'; end if;
      if v_dp is null or v_dp <= 0 then raise exception 'down_payment_required'; end if;
      if v_dp > v_price then raise exception 'down_payment_too_high'; end if;
    end if;
    select m.share, m.loan, m.due into v_share, v_loan, v_due from public.deal_math(v_price, v_sale, v_dp, v_tv) m;
    if v_sale = 'financing' and v_tv > v_share then raise exception 'trade_in_exceeds_down_payment'; end if;
    v_date_text := nullif(btrim(coalesce(v_due_in ->> 'date', '')), '');
    v_due_date := case when v_due_in ->> 'mode' = 'date' then v_date_text::date end;

    insert into public.deals (
      buyer_name, buyer_address, buyer_contact, sale_type, institution, agreed_price, down_payment, loan_amount,
      processing_fee, monthly_payment, years, opening_paid, trade_in_value, trade_in, amount_due, lieu_amount, lieu_until,
      due_date, due_text, loan_status, loan_since, terms, created_by
    ) values (
      btrim(v_buyer ->> 'name'), nullif(btrim(coalesce(v_buyer ->> 'address', '')), ''), nullif(btrim(coalesce(v_buyer ->> 'contact', '')), ''),
      v_sale, case when v_sale = 'financing' then btrim(p_payload ->> 'institution') end, v_price, v_dp, v_loan,
      v_fee, public.to_num(p_payload ->> 'monthly'), nullif(btrim(coalesce(p_payload ->> 'years', '')), '')::numeric,
      v_opening, v_tv, case when v_tv > 0 then v_trade end, v_due,
      case when v_lieu is not null and jsonb_typeof(v_lieu) = 'object' then coalesce(public.to_num(v_lieu ->> 'amount'), 0) else 0 end,
      case when v_lieu is not null and jsonb_typeof(v_lieu) = 'object' then nullif(v_lieu ->> 'until', '')::date end,
      v_due_date, case when v_due_in ->> 'mode' = 'text' then nullif(btrim(coalesce(v_due_in ->> 'text', '')), '') end,
      case when v_loan > 0 then 'waiting' else 'none' end, case when v_loan > 0 then public.manila_today() end,
      coalesce(p_payload -> 'terms', '{}'::jsonb), p_actor
    ) returning * into v_deal;

    v_pos := 0;
    for v_unit in select * from jsonb_array_elements(p_payload -> 'units') loop
      v_pos := v_pos + 1;
      if btrim(coalesce(v_unit ->> 'make_type', '')) = '' then raise exception 'make_type_required'; end if;
      if public.normalize_plate(v_unit ->> 'plate') = '' then raise exception 'plate_required'; end if;
      begin
        insert into public.deal_units (deal_id, position, make_type, plate_no, plate_display, motor_no, chassis_no, color)
        values (v_deal.id, v_pos, btrim(v_unit ->> 'make_type'), public.normalize_plate(v_unit ->> 'plate'),
                btrim(v_unit ->> 'plate'), nullif(btrim(coalesce(v_unit ->> 'motor', '')), ''),
                nullif(btrim(coalesce(v_unit ->> 'chassis', '')), ''), nullif(btrim(coalesce(v_unit ->> 'color', '')), ''));
      exception when unique_violation then raise exception 'plate_in_use';
      end;
    end loop;
  else
    select * into v_deal from public.deals where id = v_deal_id for update;
    if not found then raise exception 'deal_not_found'; end if;
    if v_deal.status = 'cancelled' then raise exception 'deal_cancelled'; end if;
    v_due := v_deal.amount_due;
    v_opening := v_deal.opening_paid;
    v_tv := v_deal.trade_in_value;
    select coalesce(sum(amount), 0), coalesce(sum(payout), 0) into v_earlier_paid, v_earlier_payout
    from public.receipts where deal_id = v_deal.id and status in ('pending', 'approved');
  end if;
  v_earlier_paid := v_earlier_paid + v_opening;

  -- ---- this receipt's payments ----
  for v_pay in select * from jsonb_array_elements(p_payload -> 'payments') loop
    v_amt := public.to_num(v_pay ->> 'amount');
    v_method := v_pay ->> 'method';
    if v_amt is null or v_amt <= 0 then raise exception 'payment_amount_invalid'; end if;
    if v_method is null or v_method not in ('cash', 'check', 'wallet') then raise exception 'payment_method_invalid'; end if;
    if v_method = 'wallet' and btrim(coalesce(v_pay ->> 'label', '')) = '' then raise exception 'payment_name_required'; end if;
    if p_require_proofs and coalesce(jsonb_array_length(v_pay -> 'attachments'), 0) = 0 then raise exception 'proof_required'; end if;
    v_paid := v_paid + v_amt;
  end loop;

  if jsonb_typeof(p_payload -> 'payout') = 'object' then v_payout := coalesce(public.to_num(p_payload -> 'payout' ->> 'amount'), 0); end if;
  if v_payout > 0 and v_due >= 0 then raise exception 'payout_not_allowed'; end if;
  if v_payout > 0 and p_require_proofs and coalesce(jsonb_array_length(p_payload -> 'payout' -> 'attachments'), 0) = 0 then
    raise exception 'payout_proof_required';
  end if;
  if v_paid = 0 and v_payout = 0 and v_due > 0 then raise exception 'payment_required'; end if;

  v_balance := v_due - (v_earlier_paid + v_paid) + (v_earlier_payout + v_payout);
  if v_due >= 0 and v_balance < 0 then raise exception 'overpayment'; end if;
  if v_due < 0 and v_balance > 0 then raise exception 'payout_too_high'; end if;

  begin
    insert into public.receipts (deal_id, receipt_no, receipt_date, kind, amount, payout, balance_after, submitted_by, remarks, notes, snapshot)
    values (v_deal.id, v_no, v_date, v_kind, v_paid, v_payout, v_balance, p_actor,
            nullif(btrim(coalesce(p_payload ->> 'remarks', '')), ''), p_payload -> 'notes', coalesce(p_payload -> 'snapshot', '{}'::jsonb))
    returning * into v_receipt;
  exception when unique_violation then raise exception 'receipt_no_taken';
  end;

  v_pos := 0;
  for v_pay in select * from jsonb_array_elements(p_payload -> 'payments') loop
    v_pos := v_pos + 1;
    insert into public.receipt_payments (receipt_id, position, method, label, amount, reference, check_no, bank, branch)
    values (v_receipt.id, v_pos, v_pay ->> 'method',
            case when v_pay ->> 'method' = 'cash' then 'Cash' when v_pay ->> 'method' = 'check' then 'Check' else btrim(v_pay ->> 'label') end,
            public.to_num(v_pay ->> 'amount'), nullif(btrim(coalesce(v_pay ->> 'reference', '')), ''),
            nullif(btrim(coalesce(v_pay ->> 'check_no', '')), ''), nullif(btrim(coalesce(v_pay ->> 'bank', '')), ''),
            nullif(btrim(coalesce(v_pay ->> 'branch', '')), ''))
    returning id into v_payment_id;
    for v_att in select * from jsonb_array_elements(coalesce(v_pay -> 'attachments', '[]'::jsonb)) loop
      if split_part(v_att ->> 'path', '/', 1) <> p_actor::text then raise exception 'bad_attachment'; end if;
      insert into public.attachments (receipt_id, payment_id, purpose, storage_path, filename, mime_type, size_bytes, uploaded_by)
      values (v_receipt.id, v_payment_id, 'payment', v_att ->> 'path', coalesce(v_att ->> 'filename', 'proof'), v_att ->> 'mime',
              nullif(v_att ->> 'size', '')::int, p_actor);
    end loop;
  end loop;
  if v_payout > 0 then
    for v_att in select * from jsonb_array_elements(coalesce(p_payload -> 'payout' -> 'attachments', '[]'::jsonb)) loop
      if split_part(v_att ->> 'path', '/', 1) <> p_actor::text then raise exception 'bad_attachment'; end if;
      insert into public.attachments (receipt_id, purpose, storage_path, filename, mime_type, size_bytes, uploaded_by)
      values (v_receipt.id, 'payout', v_att ->> 'path', coalesce(v_att ->> 'filename', 'proof'), v_att ->> 'mime',
              nullif(v_att ->> 'size', '')::int, p_actor);
    end loop;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, after)
  values (p_actor, 'receipt.submit', 'receipt', v_receipt.id,
          jsonb_build_object('receipt', to_jsonb(v_receipt) - 'snapshot', 'deal_no', v_deal.deal_no, 'new_deal', v_new));

  return jsonb_build_object('deal_id', v_deal.id, 'deal_no', v_deal.deal_no, 'receipt_id', v_receipt.id,
                            'receipt_no', v_receipt.receipt_no, 'balance_after', v_balance, 'new_deal', v_new);
end;
$$;

-- ======================= 6. Approve or reject =======================
create function public.review_receipt(p_actor uuid, p_receipt_id uuid, p_approve boolean, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_receipt public.receipts; v_deal public.deals; v_paid numeric; v_payout numeric;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'approver') then raise exception 'not_approver'; end if;
  perform pg_advisory_xact_lock(hashtext('submit_receipt'));
  select * into v_receipt from public.receipts where id = p_receipt_id for update;
  if not found then raise exception 'receipt_not_found'; end if;
  if v_receipt.status <> 'pending' then raise exception 'not_pending'; end if;
  if v_receipt.submitted_by = p_actor then raise exception 'own_receipt'; end if;
  select * into v_deal from public.deals where id = v_receipt.deal_id for update;
  if v_deal.status = 'cancelled' then raise exception 'deal_cancelled'; end if;

  if p_approve then
    select coalesce(sum(amount), 0), coalesce(sum(payout), 0) into v_paid, v_payout
    from public.receipts where deal_id = v_deal.id and status = 'approved';
    v_paid := v_paid + v_deal.opening_paid;
    if v_deal.amount_due >= 0 and v_deal.amount_due - (v_paid + v_receipt.amount) + (v_payout + v_receipt.payout) < 0 then
      raise exception 'overpayment';
    end if;
    update public.receipts set status = 'approved', reviewed_by = p_actor, reviewed_at = now()
    where id = v_receipt.id returning * into v_receipt;
    perform public.queue_sync(v_receipt.id, 'confirm', array['drive', 'sheets', 'telegram', 'inventory']);
  else
    if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required'; end if;
    update public.receipts set status = 'rejected', reviewed_by = p_actor, reviewed_at = now(), reject_reason = v_reason
    where id = v_receipt.id returning * into v_receipt;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, after)
  values (p_actor, case when p_approve then 'receipt.approve' else 'receipt.reject' end, 'receipt', v_receipt.id,
          jsonb_build_object('receipt', to_jsonb(v_receipt) - 'snapshot', 'deal_no', v_deal.deal_no, 'reason', v_reason));
  return jsonb_build_object('receipt_id', v_receipt.id, 'receipt_no', v_receipt.receipt_no, 'status', v_receipt.status, 'deal_id', v_deal.id);
end;
$$;

-- ======================= 7. Admin: void, cancel, loan, settings =======================
create function public.void_receipt(p_actor uuid, p_receipt_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_reason text := btrim(coalesce(p_reason, '')); v_receipt public.receipts;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin') then raise exception 'not_admin'; end if;
  if char_length(v_reason) < 3 then raise exception 'reason_required'; end if;
  select * into v_receipt from public.receipts where id = p_receipt_id for update;
  if not found then raise exception 'receipt_not_found'; end if;
  if v_receipt.status <> 'approved' then raise exception 'not_approved'; end if;
  update public.receipts set status = 'void', void_reason = v_reason, voided_by = p_actor, voided_at = now()
  where id = v_receipt.id returning * into v_receipt;
  perform public.queue_sync(v_receipt.id, 'void', array['sheets', 'telegram', 'inventory']);
  insert into public.audit_logs (actor_id, action, entity, entity_id, after)
  values (p_actor, 'receipt.void', 'receipt', v_receipt.id, jsonb_build_object('receipt', to_jsonb(v_receipt) - 'snapshot', 'reason', v_reason));
  return jsonb_build_object('receipt_id', v_receipt.id, 'deal_id', v_receipt.deal_id);
end;
$$;

create function public.cancel_deal(p_actor uuid, p_deal_id uuid, p_reason text, p_refund numeric default 0)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_reason text := btrim(coalesce(p_reason, '')); v_deal public.deals; v_paid numeric; v_last uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin') then raise exception 'not_admin'; end if;
  if char_length(v_reason) < 3 then raise exception 'reason_required'; end if;
  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal_not_found'; end if;
  if v_deal.status = 'cancelled' then raise exception 'already_cancelled'; end if;
  select coalesce(sum(amount), 0) + v_deal.opening_paid into v_paid from public.receipts where deal_id = v_deal.id and status = 'approved';
  if coalesce(p_refund, 0) < 0 or coalesce(p_refund, 0) > v_paid then raise exception 'refund_invalid'; end if;

  update public.receipts set status = 'rejected', reject_reason = 'The deal was cancelled', reviewed_at = now()
  where deal_id = v_deal.id and status = 'pending';
  update public.deal_units set active = false where deal_id = v_deal.id;
  update public.deals set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason, refund_amount = coalesce(p_refund, 0)
  where id = v_deal.id returning * into v_deal;

  select id into v_last from public.receipts where deal_id = v_deal.id and status = 'approved' order by created_at desc limit 1;
  if v_last is not null then perform public.queue_sync(v_last, 'cancel', array['sheets', 'telegram', 'inventory']); end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, after)
  values (p_actor, 'deal.cancel', 'deal', v_deal.id, jsonb_build_object('deal_no', v_deal.deal_no, 'reason', v_reason, 'refund', coalesce(p_refund, 0)));
  return jsonb_build_object('deal_id', v_deal.id, 'deal_no', v_deal.deal_no);
end;
$$;

create function public.set_loan_status(p_actor uuid, p_deal_id uuid, p_status text, p_on date default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_deal public.deals; v_last uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin') then raise exception 'not_admin'; end if;
  if p_status not in ('waiting', 'released') then raise exception 'loan_status_invalid'; end if;
  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal_not_found'; end if;
  if v_deal.status = 'cancelled' then raise exception 'deal_cancelled'; end if;
  if v_deal.sale_type <> 'financing' or v_deal.loan_status = 'none' then raise exception 'no_loan'; end if;
  update public.deals
  set loan_status = p_status,
      loan_released_on = case when p_status = 'released' then coalesce(p_on, public.manila_today()) end
  where id = v_deal.id returning * into v_deal;
  select id into v_last from public.receipts where deal_id = v_deal.id and status = 'approved' order by created_at desc limit 1;
  if v_last is not null then perform public.queue_sync(v_last, 'edit', array['sheets', 'inventory']); end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, after)
  values (p_actor, 'deal.loan', 'deal', v_deal.id, jsonb_build_object('deal_no', v_deal.deal_no, 'status', p_status, 'on', v_deal.loan_released_on, 'institution', v_deal.institution));
  return jsonb_build_object('deal_id', v_deal.id, 'loan_status', v_deal.loan_status);
end;
$$;

create function public.update_settings(p_actor uuid, p_config jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_before jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin') then raise exception 'not_admin'; end if;
  if jsonb_typeof(p_config) is distinct from 'object' then raise exception 'settings_invalid'; end if;
  select config into v_before from public.app_settings where id = 1;
  insert into public.app_settings (id, config, updated_by, updated_at) values (1, p_config, p_actor, now())
  on conflict (id) do update set config = excluded.config, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_logs (actor_id, action, entity, before, after)
  values (p_actor, 'settings.update', 'settings', v_before, p_config);
end;
$$;

-- ======================= 8. Views for the lists =======================
create view public.deal_summaries with (security_invoker = true) as
select
  d.id, d.deal_no, d.buyer_name, d.buyer_address, d.buyer_contact, d.sale_type, d.institution, d.agreed_price,
  d.down_payment, d.amount_due, d.loan_amount, d.processing_fee, d.monthly_payment, d.years, d.opening_paid, d.trade_in_value, d.trade_in,
  d.lieu_amount, d.lieu_until, d.due_date, d.due_text, d.loan_status, d.loan_since, d.loan_released_on, d.status,
  d.cancelled_at, d.cancel_reason, d.refund_amount, d.created_by, d.created_at, d.terms,
  p.full_name as created_by_name,
  coalesce(a.paid, 0) as approved_paid, coalesce(a.payout, 0) as approved_payout, coalesce(a.n, 0) as approved_count,
  coalesce(pd.paid, 0) as pending_paid, coalesce(pd.n, 0) as pending_count,
  d.amount_due - d.opening_paid - coalesce(a.paid, 0) + coalesce(a.payout, 0) as balance,
  (select coalesce(jsonb_agg(jsonb_build_object('make_type', u.make_type, 'plate', u.plate_display, 'plate_no', u.plate_no, 'motor', u.motor_no,
                                              'chassis', u.chassis_no, 'color', u.color) order by u.position), '[]'::jsonb)
   from public.deal_units u where u.deal_id = d.id) as units,
  (select string_agg(r.receipt_no, ' ' order by r.created_at) from public.receipts r where r.deal_id = d.id) as receipt_nos
from public.deals d
join public.profiles p on p.id = d.created_by
left join lateral (select sum(amount) paid, sum(payout) payout, count(*) n from public.receipts where deal_id = d.id and status = 'approved') a on true
left join lateral (select sum(amount) paid, count(*) n from public.receipts where deal_id = d.id and status = 'pending') pd on true;

create view public.receipt_list with (security_invoker = true) as
select
  r.id, r.receipt_no, r.deal_id, d.deal_no, d.buyer_name, d.sale_type, r.receipt_date, r.kind, r.amount, r.payout, r.balance_after,
  r.status, r.submitted_by, sp.full_name as submitted_by_name, r.submitted_at, r.reviewed_by, rp.full_name as reviewed_by_name,
  r.reviewed_at, r.reject_reason, r.void_reason, r.remarks, r.notes, r.snapshot, r.drive_file_id, r.created_at,
  (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'method', x.method, 'label', x.label, 'amount', x.amount, 'reference', x.reference,
                                              'check_no', x.check_no, 'bank', x.bank, 'branch', x.branch,
                                              'proofs', (select count(*) from public.attachments a where a.payment_id = x.id)) order by x.position), '[]'::jsonb)
   from public.receipt_payments x where x.receipt_id = r.id) as payments,
  (select count(*) from public.attachments a where a.receipt_id = r.id and a.purpose = 'payout') as payout_proofs
from public.receipts r
join public.deals d on d.id = r.deal_id
join public.profiles sp on sp.id = r.submitted_by
left join public.profiles rp on rp.id = r.reviewed_by;

-- ======================= 9. Access =======================
alter table public.deals enable row level security;
alter table public.deal_units enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_payments enable row level security;
alter table public.attachments enable row level security;
alter table public.app_settings enable row level security;
alter table public.sync_jobs enable row level security;

create policy "read deals" on public.deals for select to authenticated using (true);
create policy "read deal units" on public.deal_units for select to authenticated using (true);
create policy "read receipts" on public.receipts for select to authenticated using (true);
create policy "read receipt payments" on public.receipt_payments for select to authenticated using (true);
create policy "read attachments" on public.attachments for select to authenticated using (true);
create policy "read settings" on public.app_settings for select to authenticated using (true);
create policy "admin reads sync jobs" on public.sync_jobs for select to authenticated using (public.is_admin());

-- The activity log is for the Admin and the Approver.
drop policy if exists "admin reads audit logs" on public.audit_logs;
create policy "admin and approver read audit logs" on public.audit_logs for select to authenticated using (public.is_admin_or_approver());
-- Every signed-in user may read the names of the people (for "filled in by").
create policy "read all profiles" on public.profiles for select to authenticated using (true);

revoke insert, update, delete, truncate on public.deals, public.deal_units, public.receipts, public.receipt_payments,
  public.attachments, public.app_settings, public.sync_jobs from anon, authenticated;
revoke all on public.deals, public.deal_units, public.receipts, public.receipt_payments, public.attachments,
  public.app_settings, public.sync_jobs, public.deal_summaries, public.receipt_list from anon;
revoke insert, update, delete, truncate on public.deal_summaries, public.receipt_list from authenticated;
grant select on public.deal_summaries, public.receipt_list to authenticated;
revoke usage, select, update on sequence public.deal_no_seq from public, anon, authenticated;

-- Only the server (service role) may run the writing functions.
revoke execute on function public.submit_receipt(uuid, jsonb, boolean), public.review_receipt(uuid, uuid, boolean, text),
  public.void_receipt(uuid, uuid, text), public.cancel_deal(uuid, uuid, text, numeric), public.set_loan_status(uuid, uuid, text, date),
  public.update_settings(uuid, jsonb), public.queue_sync(uuid, text, text[]), public.claim_sync_jobs(int, uuid)
  from public, anon, authenticated;
grant execute on function public.submit_receipt(uuid, jsonb, boolean), public.review_receipt(uuid, uuid, boolean, text),
  public.void_receipt(uuid, uuid, text), public.cancel_deal(uuid, uuid, text, numeric), public.set_loan_status(uuid, uuid, text, date),
  public.update_settings(uuid, jsonb), public.queue_sync(uuid, text, text[]), public.claim_sync_jobs(int, uuid)
  to service_role;

-- ======================= 10. Proof files =======================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Anyone signed in may upload into their own folder ("{user id}/...").
create policy "upload own proofs" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
-- Deals are shared, so any signed-in user may open a proof.
create policy "read proofs" on storage.objects for select to authenticated using (bucket_id = 'payment-proofs');
