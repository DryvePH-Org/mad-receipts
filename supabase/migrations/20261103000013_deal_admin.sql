-- Phase 10 and 11: list views, sync events, and the admin functions for voiding a receipt,
-- cancelling a deal and editing its details. All of them write an audit row.

-- ---- Sync events ----
-- A receipt can now have several sync events: its confirmation, a void, a deal cancellation,
-- or a details edit. Each event has its own jobs.
alter table public.sync_jobs
  add column event text not null default 'confirm'
  check (event in ('confirm', 'void', 'cancel', 'edit'));

alter table public.sync_jobs drop constraint sync_jobs_receipt_id_target_key;
alter table public.sync_jobs
  add constraint sync_jobs_receipt_target_event_key unique (receipt_id, target, event);

-- Queues (or re-queues) sync jobs for an event. Used by the admin functions below.
create function public.queue_sync(p_receipt_id uuid, p_event text, p_targets text[])
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.sync_jobs (receipt_id, target, event)
  select p_receipt_id, t, p_event from unnest(p_targets) as t
  on conflict (receipt_id, target, event)
  do update set status = 'pending', attempts = 0, last_error = null, next_run_at = now();
$$;

revoke execute on function public.queue_sync(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.queue_sync(uuid, text, text[]) to service_role;

-- ---- Views for the lists ----
-- security_invoker: the viewer's own access applies, so the same RLS as the tables.
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

create view public.receipt_list with (security_invoker = true) as
select
  r.id, r.deal_id, r.receipt_no, r.receipt_date, r.amount, r.payment_type, r.payment_method,
  r.balance_after, r.balance_due_date, r.status, r.void_reason, r.photo_path, r.created_at,
  d.plate_no, d.buyer_name, d.status as deal_status
from public.receipts r
join public.deals d on d.id = r.deal_id;

revoke all on public.deal_summaries, public.receipt_list from anon;
revoke insert, update, delete, truncate on public.deal_summaries, public.receipt_list from authenticated;
grant select on public.deal_summaries, public.receipt_list to authenticated;

create index deals_status_created_idx on public.deals (status, created_at desc);
create index receipts_created_at_idx on public.receipts (created_at desc);

-- ---- Salespeople check (used by update_deal_details) ----
create function public.check_salespeople(p_people jsonb)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_people) <> 'array' or jsonb_array_length(p_people) = 0 or jsonb_array_length(p_people) > 5 then
    raise exception 'invalid_salespeople';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_people) e
    where jsonb_typeof(e) <> 'object'
       or public.parse_percent(e ->> 'commission_percent') is null
       or (e ->> 'salesperson_id') !~ '^[0-9a-fA-F-]{36}$'
  ) then raise exception 'invalid_salespeople'; end if;
  if (select count(distinct (e ->> 'salesperson_id')::uuid) from jsonb_array_elements(p_people) e)
     <> jsonb_array_length(p_people) then raise exception 'invalid_salespeople'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_people) e
    where not exists (
      select 1 from public.salespeople s where s.id = (e ->> 'salesperson_id')::uuid and s.active
    )
  ) then raise exception 'invalid_salespeople'; end if;
end;
$$;

-- ---- Void a receipt ----
-- Only the latest confirmed receipt of a deal can be voided (void from the latest backward), and
-- not the only one: cancel the deal instead. Recomputes the deal; the unit status follows from it.
create function public.void_receipt(p_actor uuid, p_receipt_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_receipt public.receipts;
  v_deal public.deals;
  v_before jsonb;
  v_latest uuid;
  v_plate text;
begin
  if char_length(v_reason) < 3 then raise exception 'reason_required'; end if;

  select d.plate_no into v_plate
  from public.receipts r join public.deals d on d.id = r.deal_id
  where r.id = p_receipt_id;
  if v_plate is null then raise exception 'receipt_not_found'; end if;

  perform pg_advisory_xact_lock(hashtext('deal:' || v_plate));

  select * into v_receipt from public.receipts where id = p_receipt_id for update;
  if v_receipt.status = 'voided' then raise exception 'already_voided'; end if;

  select * into v_deal from public.deals where id = v_receipt.deal_id for update;
  if v_deal.status = 'cancelled' then raise exception 'deal_cancelled'; end if;

  select id into v_latest
  from public.receipts
  where deal_id = v_deal.id and status = 'confirmed'
  order by created_at desc, id desc
  limit 1;
  if v_latest is distinct from v_receipt.id then raise exception 'not_latest'; end if;

  if (select count(*) from public.receipts where deal_id = v_deal.id and status = 'confirmed') = 1 then
    raise exception 'only_receipt';
  end if;

  -- A completed deal reopens; its plate must not already have another open deal.
  if v_deal.status = 'completed'
     and exists (select 1 from public.deals where plate_no = v_deal.plate_no and status = 'open') then
    raise exception 'plate_has_open_deal';
  end if;

  v_before := jsonb_build_object('receipt', to_jsonb(v_receipt), 'deal', to_jsonb(v_deal));

  update public.receipts set status = 'voided', void_reason = v_reason
  where id = v_receipt.id
  returning * into v_receipt;

  update public.deals
  set total_paid = total_paid - v_receipt.amount,
      balance = balance + v_receipt.amount,
      status = 'open'
  where id = v_deal.id
  returning * into v_deal;

  perform public.queue_sync(v_receipt.id, 'void', array['sheets', 'telegram', 'inventory']);

  insert into public.audit_logs (actor_id, action, entity, entity_id, before, after)
  values (
    p_actor, 'receipt.void', 'receipt', v_receipt.id, v_before,
    jsonb_build_object('receipt', to_jsonb(v_receipt), 'deal', to_jsonb(v_deal))
  );

  return jsonb_build_object(
    'receipt_id', v_receipt.id,
    'receipt_no', v_receipt.receipt_no,
    'deal_id', v_deal.id,
    'deal_status', v_deal.status,
    'total_paid', v_deal.total_paid,
    'balance', v_deal.balance
  );
end;
$$;

-- ---- Cancel a deal ----
-- Buyer backed out: the deal is cancelled, the money is marked forfeited or not, the unit goes
-- back to Available. Only open deals; to cancel a sold deal, void its latest receipt first.
create function public.cancel_deal(p_actor uuid, p_deal_id uuid, p_reason text, p_forfeit boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_deal public.deals;
  v_before jsonb;
  v_anchor uuid;
  v_plate text;
begin
  if char_length(v_reason) < 3 then raise exception 'reason_required'; end if;

  select plate_no into v_plate from public.deals where id = p_deal_id;
  if v_plate is null then raise exception 'deal_not_found'; end if;

  perform pg_advisory_xact_lock(hashtext('deal:' || v_plate));

  select * into v_deal from public.deals where id = p_deal_id for update;
  if v_deal.status <> 'open' then raise exception 'deal_not_open'; end if;

  select id into v_anchor
  from public.receipts
  where deal_id = v_deal.id and status = 'confirmed'
  order by created_at desc, id desc
  limit 1;

  v_before := to_jsonb(v_deal);

  update public.deals
  set status = 'cancelled', cancel_reason = v_reason, forfeited = coalesce(p_forfeit, false)
  where id = v_deal.id
  returning * into v_deal;

  if v_anchor is not null then
    perform public.queue_sync(v_anchor, 'cancel', array['sheets', 'telegram', 'inventory']);
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, before, after)
  values (p_actor, 'deal.cancel', 'deal', v_deal.id, v_before, to_jsonb(v_deal));

  return jsonb_build_object('deal_id', v_deal.id, 'deal_status', v_deal.status, 'forfeited', v_deal.forfeited);
end;
$$;

-- ---- Edit a deal's details ----
-- p_patch may contain: buyer_name, buyer_address, buyer_contact, make_type, color, motor_no,
-- chassis_no. Keys that are absent are left alone; blank text clears optional fields.
-- p_salespeople, when a non-empty list, replaces the deal's salespeople.
create function public.update_deal_details(p_actor uuid, p_deal_id uuid, p_patch jsonb, p_salespeople jsonb)
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
begin
  select plate_no into v_plate from public.deals where id = p_deal_id;
  if v_plate is null then raise exception 'deal_not_found'; end if;

  if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'invalid_details'; end if;
  if exists (select 1 from jsonb_object_keys(p_patch) k
             where k not in ('buyer_name', 'buyer_address', 'buyer_contact', 'make_type', 'color', 'motor_no', 'chassis_no')) then
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

  perform pg_advisory_xact_lock(hashtext('deal:' || v_plate));
  select * into v_deal from public.deals where id = p_deal_id for update;

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
    chassis_no = case when p_patch ? 'chassis_no' then nullif(btrim(p_patch ->> 'chassis_no'), '') else chassis_no end
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

revoke execute on function public.void_receipt(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.cancel_deal(uuid, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.update_deal_details(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.check_salespeople(jsonb) from public, anon, authenticated;
grant execute on function public.void_receipt(uuid, uuid, text) to service_role;
grant execute on function public.cancel_deal(uuid, uuid, text, boolean) to service_role;
grant execute on function public.update_deal_details(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.check_salespeople(jsonb) to service_role;
