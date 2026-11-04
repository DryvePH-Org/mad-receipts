-- How a deal is paid: cash, financing or trade-in.
--   price                      what the car is sold for (agreed_price)
--   - trade_in_value           credited for the car handed in
--   - loan_amount              paid by the financing company, not by the buyer
--   + processing_fee           paid by the buyer on top (financing)
--   = amount_due               what the BUYER owes MAD
--   balance = amount_due - total_paid; the deal is sold when the balance reaches zero.
-- opening_paid is money received before this deal's first receipt in the app (for example a
-- reservation paid before the app existed); it counts in total_paid.
-- Down payment for financing is simply price - loan_amount (not stored).

alter table public.deals
  add column transaction_type text not null default 'cash'
    check (transaction_type in ('cash', 'financing', 'trade_in')),
  add column trade_in_value numeric(12, 2) not null default 0 check (trade_in_value >= 0),
  add column trade_in_details text check (char_length(trade_in_details) <= 200),
  add column loan_amount numeric(12, 2) not null default 0 check (loan_amount >= 0),
  add column processing_fee numeric(12, 2) not null default 0 check (processing_fee >= 0),
  add column financier text check (char_length(financier) <= 100),
  add column opening_paid numeric(12, 2) not null default 0 check (opening_paid >= 0);

alter table public.deals
  add column amount_due numeric(12, 2)
    generated always as (agreed_price - trade_in_value - loan_amount + processing_fee) stored;

-- The two old money rules were written for price only; replace them.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.deals'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ~ 'total_paid <= agreed_price'
           or pg_get_constraintdef(oid) ~ 'balance = \(agreed_price - total_paid\)')
  loop
    execute format('alter table public.deals drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.deals
  add constraint deals_amount_due_positive check (amount_due > 0),
  add constraint deals_paid_within_due check (total_paid <= amount_due),
  add constraint deals_balance_is_due_minus_paid check (balance = amount_due - total_paid),
  add constraint deals_opening_within_paid check (opening_paid <= total_paid),
  add constraint deals_terms_match_type check (
    case transaction_type
      when 'cash' then trade_in_value = 0 and loan_amount = 0 and processing_fee = 0
      when 'financing' then loan_amount > 0 and loan_amount < agreed_price and trade_in_value = 0
      when 'trade_in' then trade_in_value > 0 and trade_in_value < agreed_price and loan_amount = 0 and processing_fee = 0
    end
  );

-- Reads the deal terms out of a payload. Missing keys are treated as zero/empty.
create function public.deal_terms_from_payload(p_payload jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_type text := coalesce(nullif(btrim(p_payload ->> 'transaction_type'), ''), 'cash');
  v_trade numeric(12, 2) := coalesce(public.parse_money(p_payload ->> 'trade_in_value'), 0);
  v_loan numeric(12, 2) := coalesce(public.parse_money(p_payload ->> 'loan_amount'), 0);
  v_fee numeric(12, 2) := coalesce(public.parse_money(p_payload ->> 'processing_fee'), 0);
begin
  if v_type not in ('cash', 'financing', 'trade_in') then raise exception 'invalid_terms'; end if;
  if char_length(coalesce(p_payload ->> 'financier', '')) > 100
     or char_length(coalesce(p_payload ->> 'trade_in_details', '')) > 200 then
    raise exception 'invalid_terms';
  end if;
  -- Only what belongs to the chosen type counts; the rest is ignored.
  return jsonb_build_object(
    'transaction_type', v_type,
    'trade_in_value', case when v_type = 'trade_in' then v_trade else 0 end,
    'trade_in_details', case when v_type = 'trade_in' then nullif(btrim(p_payload ->> 'trade_in_details'), '') end,
    'loan_amount', case when v_type = 'financing' then v_loan else 0 end,
    'processing_fee', case when v_type = 'financing' then v_fee else 0 end,
    'financier', case when v_type = 'financing' then nullif(btrim(p_payload ->> 'financier'), '') end
  );
end;
$$;

revoke execute on function public.deal_terms_from_payload(jsonb) from public, anon, authenticated;
grant execute on function public.deal_terms_from_payload(jsonb) to service_role;

-- ---- confirm_receipt with deal terms ----
-- payload may carry: transaction_type, trade_in_value, trade_in_details, loan_amount,
-- processing_fee, financier, and paid_before (new deals only).
-- On a NEW deal they set the terms. On an existing deal, when the payload names a transaction_type
-- the terms are updated first (for example a cash reservation that later becomes financing).
create or replace function public.confirm_receipt(p_actor uuid, p_draft_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.receipt_drafts;
  v_deal public.deals;
  v_receipt public.receipts;
  v_new_deal boolean := false;
  v_first boolean;
  v_type text;
  v_balance_after numeric(12, 2);
  v_due numeric(12, 2);
  v_terms jsonb;
  v_terms_changed boolean := false;
  v_plate text := upper(regexp_replace(coalesce(p_payload ->> 'plate_no', ''), '[^A-Za-z0-9]', '', 'g'));
  v_receipt_no text := btrim(coalesce(p_payload ->> 'receipt_no', ''));
  v_amount numeric(12, 2) := public.parse_money(p_payload ->> 'amount');
  v_agreed_price numeric(12, 2) := public.parse_money(p_payload ->> 'agreed_price');
  v_paid_before numeric(12, 2) := coalesce(public.parse_money(p_payload ->> 'paid_before'), 0);
  v_reservation boolean := coalesce((p_payload ->> 'marked_reservation')::boolean, false);
  v_people jsonb := p_payload -> 'salespeople';
  v_people_audit jsonb;
  v_before_deal jsonb;
begin
  select * into v_draft from public.receipt_drafts where id = p_draft_id for update;
  if not found or v_draft.created_by is distinct from p_actor then
    raise exception 'draft_not_found';
  end if;
  if v_draft.status = 'consumed' then
    raise exception 'draft_already_confirmed';
  end if;
  if v_draft.status not in ('ready', 'failed') then
    raise exception 'draft_not_ready';
  end if;

  if v_receipt_no !~ '^[A-Za-z0-9-]{1,20}$' then raise exception 'invalid_receipt_no'; end if;
  if v_plate = '' then raise exception 'missing_plate'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'invalid_amount'; end if;
  if exists (select 1 from public.receipts where receipt_no = v_receipt_no) then
    raise exception 'duplicate_receipt_no';
  end if;
  if v_paid_before < 0 then raise exception 'invalid_terms'; end if;

  if v_people is not null and jsonb_typeof(v_people) not in ('array', 'null') then raise exception 'invalid_salespeople'; end if;
  if jsonb_typeof(v_people) = 'array' and jsonb_array_length(v_people) > 0 then
    if jsonb_array_length(v_people) > 5 then raise exception 'invalid_salespeople'; end if;
    if exists (
      select 1 from jsonb_array_elements(v_people) e
      where jsonb_typeof(e) <> 'object'
         or public.parse_percent(e ->> 'commission_percent') is null
         or (e ->> 'salesperson_id') !~ '^[0-9a-fA-F-]{36}$'
    ) then raise exception 'invalid_salespeople'; end if;
    if (select count(distinct (e ->> 'salesperson_id')::uuid) from jsonb_array_elements(v_people) e)
       <> jsonb_array_length(v_people) then raise exception 'invalid_salespeople'; end if;
    if exists (
      select 1 from jsonb_array_elements(v_people) e
      where not exists (
        select 1 from public.salespeople s where s.id = (e ->> 'salesperson_id')::uuid and s.active
      )
    ) then raise exception 'invalid_salespeople'; end if;
  end if;

  v_terms := public.deal_terms_from_payload(p_payload);

  perform pg_advisory_xact_lock(hashtext('deal:' || v_plate));

  select * into v_deal from public.deals where plate_no = v_plate and status = 'open' for update;
  if not found then
    if nullif(btrim(p_payload ->> 'buyer_name'), '') is null then raise exception 'missing_buyer_name'; end if;
    if v_agreed_price is null or v_agreed_price <= 0 then raise exception 'invalid_agreed_price'; end if;
    if v_agreed_price - (v_terms ->> 'trade_in_value')::numeric - (v_terms ->> 'loan_amount')::numeric
       + (v_terms ->> 'processing_fee')::numeric <= 0 then raise exception 'invalid_terms'; end if;
    if (v_terms ->> 'transaction_type') = 'financing'
       and ((v_terms ->> 'loan_amount')::numeric <= 0 or (v_terms ->> 'loan_amount')::numeric >= v_agreed_price) then
      raise exception 'invalid_terms';
    end if;
    if (v_terms ->> 'transaction_type') = 'trade_in'
       and ((v_terms ->> 'trade_in_value')::numeric <= 0 or (v_terms ->> 'trade_in_value')::numeric >= v_agreed_price) then
      raise exception 'invalid_terms';
    end if;

    insert into public.deals (
      plate_no, make_type, color, motor_no, chassis_no,
      buyer_name, buyer_address, buyer_contact,
      agreed_price, transaction_type, trade_in_value, trade_in_details, loan_amount, processing_fee, financier,
      opening_paid, total_paid, balance, status, created_by
    ) values (
      v_plate,
      nullif(btrim(p_payload ->> 'make_type'), ''),
      nullif(btrim(p_payload ->> 'color'), ''),
      nullif(btrim(p_payload ->> 'motor_no'), ''),
      nullif(btrim(p_payload ->> 'chassis_no'), ''),
      btrim(p_payload ->> 'buyer_name'),
      nullif(btrim(p_payload ->> 'buyer_address'), ''),
      nullif(btrim(p_payload ->> 'buyer_contact'), ''),
      v_agreed_price,
      v_terms ->> 'transaction_type',
      (v_terms ->> 'trade_in_value')::numeric,
      v_terms ->> 'trade_in_details',
      (v_terms ->> 'loan_amount')::numeric,
      (v_terms ->> 'processing_fee')::numeric,
      v_terms ->> 'financier',
      v_paid_before,
      v_paid_before,
      v_agreed_price - (v_terms ->> 'trade_in_value')::numeric - (v_terms ->> 'loan_amount')::numeric
        + (v_terms ->> 'processing_fee')::numeric - v_paid_before,
      'open', p_actor
    )
    returning * into v_deal;
    v_new_deal := true;
  elsif p_payload ? 'transaction_type' then
    -- An existing deal: apply new terms when they differ from what is saved.
    if (v_terms ->> 'transaction_type') is distinct from v_deal.transaction_type
       or (v_terms ->> 'trade_in_value')::numeric is distinct from v_deal.trade_in_value
       or (v_terms ->> 'loan_amount')::numeric is distinct from v_deal.loan_amount
       or (v_terms ->> 'processing_fee')::numeric is distinct from v_deal.processing_fee
       or coalesce(v_terms ->> 'financier', '') is distinct from coalesce(v_deal.financier, '')
       or coalesce(v_terms ->> 'trade_in_details', '') is distinct from coalesce(v_deal.trade_in_details, '') then
      v_due := v_deal.agreed_price - (v_terms ->> 'trade_in_value')::numeric - (v_terms ->> 'loan_amount')::numeric
               + (v_terms ->> 'processing_fee')::numeric;
      if v_due <= 0 then raise exception 'invalid_terms'; end if;
      if v_due < v_deal.total_paid then raise exception 'overpayment'; end if;
      if (v_terms ->> 'transaction_type') = 'financing'
         and ((v_terms ->> 'loan_amount')::numeric <= 0 or (v_terms ->> 'loan_amount')::numeric >= v_deal.agreed_price) then
        raise exception 'invalid_terms';
      end if;
      if (v_terms ->> 'transaction_type') = 'trade_in'
         and ((v_terms ->> 'trade_in_value')::numeric <= 0 or (v_terms ->> 'trade_in_value')::numeric >= v_deal.agreed_price) then
        raise exception 'invalid_terms';
      end if;
      v_before_deal := to_jsonb(v_deal);
      v_terms_changed := true;
      update public.deals set
        transaction_type = v_terms ->> 'transaction_type',
        trade_in_value = (v_terms ->> 'trade_in_value')::numeric,
        trade_in_details = v_terms ->> 'trade_in_details',
        loan_amount = (v_terms ->> 'loan_amount')::numeric,
        processing_fee = (v_terms ->> 'processing_fee')::numeric,
        financier = v_terms ->> 'financier',
        balance = agreed_price - (v_terms ->> 'trade_in_value')::numeric - (v_terms ->> 'loan_amount')::numeric
                  + (v_terms ->> 'processing_fee')::numeric - total_paid
      where id = v_deal.id
      returning * into v_deal;
    end if;
  end if;

  v_first := not exists (
    select 1 from public.receipts where deal_id = v_deal.id and status = 'confirmed'
  );
  v_due := v_deal.amount_due;
  v_balance_after := v_due - (v_deal.total_paid + v_amount);
  if v_balance_after < 0 then raise exception 'overpayment'; end if;
  v_type := case
    when v_balance_after = 0 then 'full'
    when v_first and v_reservation then 'earnest'
    else 'partial'
  end;

  insert into public.receipts (
    deal_id, receipt_no, receipt_date, amount, payment_type, paper_payment_type,
    payment_method, check_no, bank_branch, balance_after, balance_due_date,
    amount_words, balance_words, photo_path, extraction_raw, status, created_by
  ) values (
    v_deal.id,
    v_receipt_no,
    nullif(p_payload ->> 'receipt_date', '')::date,
    v_amount,
    v_type,
    nullif(p_payload ->> 'paper_payment_type', ''),
    nullif(p_payload ->> 'payment_method', ''),
    nullif(btrim(p_payload ->> 'check_no'), ''),
    nullif(btrim(p_payload ->> 'bank_branch'), ''),
    v_balance_after,
    nullif(p_payload ->> 'balance_due_date', '')::date,
    nullif(btrim(p_payload ->> 'amount_words'), ''),
    nullif(btrim(p_payload ->> 'balance_words'), ''),
    v_draft.photo_path,
    v_draft.extraction,
    'confirmed',
    p_actor
  )
  returning * into v_receipt;

  update public.deals
  set total_paid = total_paid + v_amount,
      balance = v_balance_after,
      status = case when v_balance_after = 0 then 'completed' else 'open' end
  where id = v_deal.id
  returning * into v_deal;

  if jsonb_typeof(v_people) = 'array' and jsonb_array_length(v_people) > 0 then
    delete from public.deal_salespeople where deal_id = v_deal.id;
    insert into public.deal_salespeople (deal_id, salesperson_id, commission_percent)
    select v_deal.id, (e ->> 'salesperson_id')::uuid, public.parse_percent(e ->> 'commission_percent')
    from jsonb_array_elements(v_people) e;
  end if;

  if v_deal.status = 'completed'
     and not exists (select 1 from public.deal_salespeople where deal_id = v_deal.id) then
    raise exception 'salesperson_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'commission_percent', ds.commission_percent) order by s.name), '[]'::jsonb)
  into v_people_audit
  from public.deal_salespeople ds join public.salespeople s on s.id = ds.salesperson_id
  where ds.deal_id = v_deal.id;

  update public.receipt_drafts set status = 'consumed' where id = p_draft_id;

  insert into public.sync_jobs (receipt_id, target)
  select v_receipt.id, target
  from unnest(array['drive', 'sheets', 'telegram', 'inventory']) as target;

  insert into public.audit_logs (actor_id, action, entity, entity_id, before, after)
  values (
    p_actor, 'receipt.confirm', 'receipt', v_receipt.id,
    case when v_terms_changed then jsonb_build_object('deal', v_before_deal) end,
    jsonb_build_object(
      'receipt', to_jsonb(v_receipt), 'deal', to_jsonb(v_deal), 'new_deal', v_new_deal,
      'salespeople', v_people_audit, 'terms_changed', v_terms_changed
    )
  );

  return jsonb_build_object(
    'receipt_id', v_receipt.id,
    'receipt_no', v_receipt.receipt_no,
    'payment_type', v_receipt.payment_type,
    'balance_after', v_receipt.balance_after,
    'deal_id', v_deal.id,
    'deal_status', v_deal.status,
    'total_paid', v_deal.total_paid,
    'agreed_price', v_deal.agreed_price,
    'amount_due', v_deal.amount_due,
    'new_deal', v_new_deal
  );
end;
$$;

revoke execute on function public.confirm_receipt(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_receipt(uuid, uuid, jsonb) to service_role;

-- ---- update_deal_details with deal terms (open deals only) ----
create or replace function public.update_deal_details(p_actor uuid, p_deal_id uuid, p_patch jsonb, p_salespeople jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal public.deals;
  v_after_deal public.deals;
  v_plate text;
  v_anchor uuid;
  v_before jsonb;
  v_before_people jsonb;
  v_after_people jsonb;
  v_replace boolean := jsonb_typeof(p_salespeople) = 'array' and jsonb_array_length(p_salespeople) > 0;
  v_name text;
  v_terms jsonb;
  v_terms_given boolean;
  v_due numeric(12, 2);
begin
  select plate_no into v_plate from public.deals where id = p_deal_id;
  if v_plate is null then raise exception 'deal_not_found'; end if;

  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'invalid_details'; end if;
  if exists (select 1 from jsonb_object_keys(p_patch) k
             where k not in ('buyer_name', 'buyer_address', 'buyer_contact', 'make_type', 'color', 'motor_no', 'chassis_no',
                             'transaction_type', 'trade_in_value', 'trade_in_details', 'loan_amount', 'processing_fee', 'financier')) then
    raise exception 'invalid_details';
  end if;
  if p_patch ? 'buyer_name' then
    v_name := btrim(coalesce(p_patch ->> 'buyer_name', ''));
    if v_name = '' then raise exception 'missing_buyer_name'; end if;
  end if;
  if char_length(coalesce(p_patch ->> 'buyer_name', '')) > 200
     or char_length(coalesce(p_patch ->> 'buyer_address', '')) > 300
     or char_length(coalesce(p_patch ->> 'buyer_contact', '')) > 50
     or char_length(coalesce(p_patch ->> 'make_type', '')) > 100
     or char_length(coalesce(p_patch ->> 'color', '')) > 50
     or char_length(coalesce(p_patch ->> 'motor_no', '')) > 50
     or char_length(coalesce(p_patch ->> 'chassis_no', '')) > 50 then
    raise exception 'invalid_details';
  end if;
  if v_replace then perform public.check_salespeople(p_salespeople); end if;
  v_terms_given := p_patch ? 'transaction_type';

  perform pg_advisory_xact_lock(hashtext('deal:' || v_plate));
  select * into v_deal from public.deals where id = p_deal_id for update;

  if v_terms_given then
    if v_deal.status <> 'open' then raise exception 'deal_not_open'; end if;
    v_terms := public.deal_terms_from_payload(p_patch);
    v_due := v_deal.agreed_price - (v_terms ->> 'trade_in_value')::numeric - (v_terms ->> 'loan_amount')::numeric
             + (v_terms ->> 'processing_fee')::numeric;
    if v_due <= 0 then raise exception 'invalid_terms'; end if;
    if v_due < v_deal.total_paid then raise exception 'overpayment'; end if;
    if v_due = v_deal.total_paid then raise exception 'terms_would_complete'; end if;
    if (v_terms ->> 'transaction_type') = 'financing'
       and ((v_terms ->> 'loan_amount')::numeric <= 0 or (v_terms ->> 'loan_amount')::numeric >= v_deal.agreed_price) then
      raise exception 'invalid_terms';
    end if;
    if (v_terms ->> 'transaction_type') = 'trade_in'
       and ((v_terms ->> 'trade_in_value')::numeric <= 0 or (v_terms ->> 'trade_in_value')::numeric >= v_deal.agreed_price) then
      raise exception 'invalid_terms';
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'commission_percent', ds.commission_percent) order by s.name), '[]'::jsonb)
  into v_before_people
  from public.deal_salespeople ds join public.salespeople s on s.id = ds.salesperson_id
  where ds.deal_id = v_deal.id;
  v_before := jsonb_build_object('deal', to_jsonb(v_deal), 'salespeople', v_before_people);

  update public.deals set
    buyer_name = case when p_patch ? 'buyer_name' then v_name else buyer_name end,
    buyer_address = case when p_patch ? 'buyer_address' then nullif(btrim(p_patch ->> 'buyer_address'), '') else buyer_address end,
    buyer_contact = case when p_patch ? 'buyer_contact' then nullif(btrim(p_patch ->> 'buyer_contact'), '') else buyer_contact end,
    make_type = case when p_patch ? 'make_type' then nullif(btrim(p_patch ->> 'make_type'), '') else make_type end,
    color = case when p_patch ? 'color' then nullif(btrim(p_patch ->> 'color'), '') else color end,
    motor_no = case when p_patch ? 'motor_no' then nullif(btrim(p_patch ->> 'motor_no'), '') else motor_no end,
    chassis_no = case when p_patch ? 'chassis_no' then nullif(btrim(p_patch ->> 'chassis_no'), '') else chassis_no end,
    transaction_type = case when v_terms_given then v_terms ->> 'transaction_type' else transaction_type end,
    trade_in_value = case when v_terms_given then (v_terms ->> 'trade_in_value')::numeric else trade_in_value end,
    trade_in_details = case when v_terms_given then v_terms ->> 'trade_in_details' else trade_in_details end,
    loan_amount = case when v_terms_given then (v_terms ->> 'loan_amount')::numeric else loan_amount end,
    processing_fee = case when v_terms_given then (v_terms ->> 'processing_fee')::numeric else processing_fee end,
    financier = case when v_terms_given then v_terms ->> 'financier' else financier end,
    balance = case when v_terms_given then v_due - total_paid else balance end
  where id = v_deal.id
  returning * into v_after_deal;

  if v_replace then
    delete from public.deal_salespeople where deal_id = v_deal.id;
    insert into public.deal_salespeople (deal_id, salesperson_id, commission_percent)
    select v_deal.id, (e ->> 'salesperson_id')::uuid, public.parse_percent(e ->> 'commission_percent')
    from jsonb_array_elements(p_salespeople) e;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'commission_percent', ds.commission_percent) order by s.name), '[]'::jsonb)
  into v_after_people
  from public.deal_salespeople ds join public.salespeople s on s.id = ds.salesperson_id
  where ds.deal_id = v_deal.id;

  select id into v_anchor
  from public.receipts
  where deal_id = v_deal.id and status = 'confirmed'
  order by created_at desc, id desc
  limit 1;
  if v_anchor is not null then
    perform public.queue_sync(v_anchor, 'edit', array['sheets', 'inventory']);
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, before, after)
  values (
    p_actor, 'deal.update', 'deal', v_deal.id, v_before,
    jsonb_build_object('deal', to_jsonb(v_after_deal), 'salespeople', v_after_people)
  );

  return jsonb_build_object('deal_id', v_deal.id);
end;
$$;

revoke execute on function public.update_deal_details(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.update_deal_details(uuid, uuid, jsonb, jsonb) to service_role;

-- ---- The deals view must be re-created to pick up the new columns ----
drop view public.deal_summaries;
create view public.deal_summaries with (security_invoker = true) as
select
  d.*,
  lr.receipt_no as last_receipt_no,
  lr.receipt_date as last_receipt_date,
  case when d.status = 'open' then lr.balance_due_date end as next_due_date,
  coalesce(rc.receipt_count, 0)::int as receipt_count
from public.deals d
left join lateral (
  select r.receipt_no, r.receipt_date, r.balance_due_date
  from public.receipts r
  where r.deal_id = d.id and r.status = 'confirmed'
  order by r.created_at desc, r.id desc
  limit 1
) lr on true
left join lateral (
  select count(*) as receipt_count
  from public.receipts r
  where r.deal_id = d.id and r.status = 'confirmed'
) rc on true;

revoke all on public.deal_summaries from anon;
revoke insert, update, delete, truncate on public.deal_summaries from authenticated;
grant select on public.deal_summaries to authenticated;
