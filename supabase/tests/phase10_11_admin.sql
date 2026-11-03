-- Phase 10/11: list views, sync events, void_receipt, cancel_deal, update_deal_details.
-- Runs in a transaction and rolls back.
-- Run: docker exec -i supabase_db_AutomatedSalesInvoice psql -U postgres -q < supabase/tests/phase10_11_admin.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'p11-staff@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'p11-admin@example.test');

create temp table t_sp as
  with s as (
    insert into public.salespeople (name, active) values ('C David', true), ('C Ella', true), ('C Gone', false)
    returning id, name
  ) select id, name from s;
create function pg_temp.sp(p_name text) returns uuid language sql as $$ select id from t_sp where name = p_name $$;
create function pg_temp.person(p_name text, p_percent text) returns jsonb language sql as $$
  select jsonb_build_object('salesperson_id', pg_temp.sp(p_name), 'commission_percent', p_percent) $$;
create function pg_temp.david() returns jsonb language sql as $$ select jsonb_build_array(pg_temp.person('C David', '3')) $$;

create function pg_temp.draft() returns uuid language sql as $$
  insert into public.receipt_drafts (photo_path, status, created_by)
  values ('drafts/x/' || gen_random_uuid() || '.jpg', 'ready', '00000000-0000-0000-0000-0000000000c1') returning id;
$$;

create function pg_temp.confirm(p_no text, p_plate text, p_amount text, p_people jsonb default null,
  p_due text default null, p_reservation boolean default false) returns jsonb
language sql as $$
  select public.confirm_receipt('00000000-0000-0000-0000-0000000000c1', pg_temp.draft(), jsonb_build_object(
    'receipt_no', p_no, 'plate_no', p_plate, 'amount', p_amount, 'agreed_price', '500000',
    'buyer_name', 'Buyer ' || p_plate, 'marked_reservation', p_reservation, 'balance_due_date', p_due)
    || case when p_people is null then '{}'::jsonb else jsonb_build_object('salespeople', p_people) end);
$$;

create function pg_temp.receipt_id(p_no text) returns uuid language sql as $$ select id from public.receipts where receipt_no = p_no $$;
create function pg_temp.deal_of(p_plate text) returns public.deals language sql as $$
  select d from public.deals d where plate_no = p_plate order by created_at desc limit 1 $$;
create function pg_temp.void(p_no text, p_reason text default 'wrong amount') returns jsonb language sql as $$
  select public.void_receipt('00000000-0000-0000-0000-0000000000c2', pg_temp.receipt_id(p_no), p_reason) $$;

create function pg_temp.expect_error(p_sql text, p_code text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: expected % from %', p_code, left(p_sql, 90);
exception when others then
  if sqlerrm <> p_code then raise exception 'FAIL: expected %, got % from %', p_code, sqlerrm, left(p_sql, 90); end if;
  raise notice 'ok: rejected with %', p_code;
end;
$$;

-- ===== Void =====
do $$
declare d public.deals; r jsonb;
begin
  perform pg_temp.confirm('V1', 'VPL001', '100000', pg_temp.david(), '2026-11-10', true);
  perform pg_temp.confirm('V2', 'VPL001', '100000', null, '2026-11-20');
  perform pg_temp.confirm('V3', 'VPL001', '300000'); -- completes the deal (David is on it)
  d := pg_temp.deal_of('VPL001');
  assert d.status = 'completed' and d.total_paid = 500000 and d.balance = 0;

  -- The latest receipt of a sold deal: void it and the deal reopens, totals recomputed.
  r := pg_temp.void('V3');
  d := pg_temp.deal_of('VPL001');
  assert d.status = 'open' and d.total_paid = 200000 and d.balance = 300000, 'deal not recomputed: ' || d::text;
  assert (select status from public.receipts where receipt_no = 'V3') = 'voided';
  assert (select void_reason from public.receipts where receipt_no = 'V3') = 'wrong amount';
  raise notice 'ok: voiding the latest receipt reopens the sold deal';

  -- Sync jobs for the void event; the confirm jobs are untouched and coexist.
  assert (select count(*) from public.sync_jobs where receipt_id = pg_temp.receipt_id('V3') and event = 'void'
          and target in ('sheets', 'telegram', 'inventory') and status = 'pending') = 3;
  assert not exists (select 1 from public.sync_jobs where receipt_id = pg_temp.receipt_id('V3') and event = 'void' and target = 'drive');
  assert (select count(*) from public.sync_jobs where receipt_id = pg_temp.receipt_id('V3') and event = 'confirm') = 4;
  raise notice 'ok: void queues sheets, telegram and inventory jobs next to the confirm jobs';

  -- Audit row has before and after.
  assert (select (before -> 'deal' ->> 'status') = 'completed' and (after -> 'deal' ->> 'status') = 'open'
          from public.audit_logs where action = 'receipt.void' and entity_id = pg_temp.receipt_id('V3'));
  raise notice 'ok: void is audited with before and after';

  -- The next receipt up is now the latest, and the earlier one is not.
  perform pg_temp.void('V2', 'duplicate');
  assert (pg_temp.deal_of('VPL001')).total_paid = 100000;
  assert (select next_due_date from public.deal_summaries where plate_no = 'VPL001') = '2026-11-10', 'next due date should come from the remaining receipt';
  raise notice 'ok: voiding backward works and the next due date follows the latest remaining receipt';
end $$;

select pg_temp.expect_error($$select pg_temp.void('V1')$$, 'only_receipt');
select pg_temp.expect_error($$select pg_temp.void('V3')$$, 'already_voided');
select pg_temp.expect_error($$select pg_temp.void('V1', ' ')$$, 'reason_required');
select pg_temp.expect_error($$select pg_temp.void('V1', 'ab')$$, 'reason_required');
select pg_temp.expect_error($$select public.void_receipt('00000000-0000-0000-0000-0000000000c2', gen_random_uuid(), 'because')$$, 'receipt_not_found');

do $$
begin
  -- Not the latest receipt.
  perform pg_temp.confirm('N1', 'VPL002', '100000', pg_temp.david(), null, true);
  perform pg_temp.confirm('N2', 'VPL002', '100000');
end $$;
select pg_temp.expect_error($$select pg_temp.void('N1')$$, 'not_latest');

-- A cancelled deal's receipts cannot be voided.
do $$
begin
  perform pg_temp.confirm('C1', 'VPL003', '100000', pg_temp.david(), null, true);
  perform pg_temp.confirm('C2', 'VPL003', '50000');
  perform public.cancel_deal('00000000-0000-0000-0000-0000000000c2', (pg_temp.deal_of('VPL003')).id, 'buyer backed out', true);
end $$;
select pg_temp.expect_error($$select pg_temp.void('C2')$$, 'deal_cancelled');

-- A sold deal can't reopen while the plate has another open deal.
do $$
begin
  perform pg_temp.confirm('P1', 'VPL004', '100000', pg_temp.david(), null, true);
  perform pg_temp.confirm('P2', 'VPL004', '400000');            -- sold
  perform pg_temp.confirm('P3', 'VPL004', '100000', pg_temp.david(), null, true); -- a new open deal on the same plate
end $$;
select pg_temp.expect_error($$select pg_temp.void('P2')$$, 'plate_has_open_deal');

-- ===== Cancel =====
do $$
declare d public.deals; r jsonb;
begin
  d := pg_temp.deal_of('VPL003');
  assert d.status = 'cancelled' and d.cancel_reason = 'buyer backed out' and d.forfeited;
  assert (select count(*) from public.sync_jobs where event = 'cancel' and target in ('sheets', 'telegram', 'inventory')
          and receipt_id = pg_temp.receipt_id('C2') and status = 'pending') = 3;
  assert (select (after ->> 'status') = 'cancelled' and (before ->> 'status') = 'open'
          from public.audit_logs where action = 'deal.cancel' and entity_id = d.id);
  raise notice 'ok: cancel marks the deal, forfeits the money, queues jobs and audits';

  -- The plate is free for a new deal.
  perform pg_temp.confirm('C3', 'VPL003', '100000', null, null, true);
  assert (select count(*) from public.deals where plate_no = 'VPL003' and status = 'open') = 1;
  raise notice 'ok: a cancelled deal frees the plate';

  -- Not forfeited.
  perform pg_temp.confirm('F1', 'VPL005', '100000', pg_temp.david(), null, true);
  perform public.cancel_deal('00000000-0000-0000-0000-0000000000c2', (pg_temp.deal_of('VPL005')).id, 'changed mind', false);
  assert not (pg_temp.deal_of('VPL005')).forfeited;
end $$;

select pg_temp.expect_error($$select public.cancel_deal('00000000-0000-0000-0000-0000000000c2', (pg_temp.deal_of('VPL003')).id, 'twice', false)$$, 'deal_not_open');
select pg_temp.expect_error($$select public.cancel_deal('00000000-0000-0000-0000-0000000000c2', (pg_temp.deal_of('VPL001')).id, 'ab', false)$$, 'reason_required');
select pg_temp.expect_error($$select public.cancel_deal('00000000-0000-0000-0000-0000000000c2', gen_random_uuid(), 'missing', false)$$, 'deal_not_found');
do $$
begin
  perform pg_temp.confirm('S1', 'VPL006', '500000', pg_temp.david());  -- sold in one payment
end $$;
select pg_temp.expect_error($$select public.cancel_deal('00000000-0000-0000-0000-0000000000c2', (pg_temp.deal_of('VPL006')).id, 'too late', false)$$, 'deal_not_open');

-- ===== Edit details =====
do $$
declare d public.deals; id uuid;
begin
  perform pg_temp.confirm('E1', 'VPL007', '100000', pg_temp.david(), null, true);
  d := pg_temp.deal_of('VPL007'); id := d.id;

  perform public.update_deal_details('00000000-0000-0000-0000-0000000000c2', id,
    '{"buyer_name": "  Jose P. Rizal ", "color": "Blue", "buyer_address": ""}'::jsonb, null);
  d := pg_temp.deal_of('VPL007');
  assert d.buyer_name = 'Jose P. Rizal' and d.color = 'Blue' and d.buyer_address is null, 'details not saved';
  assert d.agreed_price = 500000 and d.plate_no = 'VPL007', 'price and plate must not change';
  raise notice 'ok: details updated, blanks cleared, keys left out are unchanged';

  assert (select (before -> 'deal' ->> 'buyer_name') = 'Buyer VPL007' and (after -> 'deal' ->> 'buyer_name') = 'Jose P. Rizal'
          from public.audit_logs where action = 'deal.update' and entity_id = id);
  assert (select count(*) from public.sync_jobs where event = 'edit' and receipt_id = pg_temp.receipt_id('E1') and target in ('sheets', 'inventory')) = 2;
  raise notice 'ok: edit is audited with before and after and queues sheets and inventory';

  -- Salespeople replaced, with their own percents.
  perform public.update_deal_details('00000000-0000-0000-0000-0000000000c2', id, '{}'::jsonb,
    jsonb_build_array(pg_temp.person('C Ella', '2.5'), pg_temp.person('C David', '1')));
  assert (select count(*) from public.deal_salespeople where deal_id = id) = 2;
  assert (select commission_percent from public.deal_salespeople where deal_id = id and salesperson_id = pg_temp.sp('C Ella')) = 2.5;
  -- An empty list leaves them alone.
  perform public.update_deal_details('00000000-0000-0000-0000-0000000000c2', id, '{}'::jsonb, '[]'::jsonb);
  assert (select count(*) from public.deal_salespeople where deal_id = id) = 2;
  raise notice 'ok: salespeople replaced, an empty list changes nothing';
end $$;

select pg_temp.expect_error($$select public.update_deal_details('00000000-0000-0000-0000-0000000000c2', (pg_temp.deal_of('VPL007')).id, '{"plate_no": "HACK"}'::jsonb, null)$$, 'invalid_details');
select pg_temp.expect_error($$select public.update_deal_details('00000000-0000-0000-0000-0000000000c2', (pg_temp.deal_of('VPL007')).id, '{"agreed_price": "1"}'::jsonb, null)$$, 'invalid_details');
select pg_temp.expect_error($$select public.update_deal_details('00000000-0000-0000-0000-0000000000c2', (pg_temp.deal_of('VPL007')).id, '{"buyer_name": "  "}'::jsonb, null)$$, 'missing_buyer_name');
select pg_temp.expect_error($$select public.update_deal_details('00000000-0000-0000-0000-0000000000c2', (pg_temp.deal_of('VPL007')).id, jsonb_build_object('color', repeat('x', 51)), null)$$, 'invalid_details');
select pg_temp.expect_error($$select public.update_deal_details('00000000-0000-0000-0000-0000000000c2', (pg_temp.deal_of('VPL007')).id, '[]'::jsonb, null)$$, 'invalid_details');
select pg_temp.expect_error($$select public.update_deal_details('00000000-0000-0000-0000-0000000000c2', (pg_temp.deal_of('VPL007')).id, '{}'::jsonb, jsonb_build_array(pg_temp.person('C Gone', '3')))$$, 'invalid_salespeople');
select pg_temp.expect_error($$select public.update_deal_details('00000000-0000-0000-0000-0000000000c2', (pg_temp.deal_of('VPL007')).id, '{}'::jsonb, jsonb_build_array(pg_temp.person('C David', '101')))$$, 'invalid_salespeople');
select pg_temp.expect_error($$select public.update_deal_details('00000000-0000-0000-0000-0000000000c2', gen_random_uuid(), '{}'::jsonb, null)$$, 'deal_not_found');

-- ===== queue_sync resets a stuck job =====
do $$
declare rid uuid := pg_temp.receipt_id('E1');
begin
  update public.sync_jobs set status = 'failed', attempts = 5, last_error = 'boom' where receipt_id = rid and target = 'sheets' and event = 'edit';
  perform public.queue_sync(rid, 'edit', array['sheets']);
  assert (select status = 'pending' and attempts = 0 and last_error is null from public.sync_jobs
          where receipt_id = rid and target = 'sheets' and event = 'edit');
  raise notice 'ok: queue_sync resets a failed job';
end $$;

-- ===== Views =====
do $$
declare s record;
begin
  -- Open deal: next due date from its latest receipt. Sold deal: none. Receipt count counts confirmed only.
  perform pg_temp.confirm('W1', 'VPL008', '100000', pg_temp.david(), '2026-12-01', true);
  select * into s from public.deal_summaries where plate_no = 'VPL008';
  assert s.next_due_date = '2026-12-01' and s.last_receipt_no = 'W1' and s.receipt_count = 1;
  select * into s from public.deal_summaries where plate_no = 'VPL006';
  assert s.next_due_date is null and s.status = 'completed', 'sold deals have no due date';
  select * into s from public.deal_summaries where plate_no = 'VPL001';
  assert s.receipt_count = 1, 'voided receipts are not counted';
  assert (select count(*) from public.receipt_list where plate_no = 'VPL001') = 3, 'receipt_list includes voided receipts';
  assert (select buyer_name from public.receipt_list where receipt_no = 'W1') = 'Buyer VPL008';
  raise notice 'ok: deal_summaries and receipt_list';
end $$;

-- ===== Access =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.deal_summaries where plate_no like 'VPL%') >= 8, 'staff cannot read deal_summaries';
  assert (select count(*) from public.receipt_list where plate_no like 'VPL%') >= 8, 'staff cannot read receipt_list';
  begin insert into public.deal_summaries (id) values (gen_random_uuid()); raise exception 'FAIL: wrote to a view';
  exception when insufficient_privilege or others then
    if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: views are read only';
  end;
  begin perform public.void_receipt('00000000-0000-0000-0000-0000000000c1', gen_random_uuid(), 'hack'); raise exception 'FAIL: client voided';
  exception when insufficient_privilege then raise notice 'ok: client cannot call void_receipt'; end;
  begin perform public.cancel_deal('00000000-0000-0000-0000-0000000000c1', gen_random_uuid(), 'hack', true); raise exception 'FAIL: client cancelled';
  exception when insufficient_privilege then raise notice 'ok: client cannot call cancel_deal'; end;
  begin perform public.update_deal_details('00000000-0000-0000-0000-0000000000c1', gen_random_uuid(), '{}'::jsonb, null); raise exception 'FAIL: client edited';
  exception when insufficient_privilege then raise notice 'ok: client cannot call update_deal_details'; end;
  begin perform public.queue_sync(gen_random_uuid(), 'void', array['sheets']); raise exception 'FAIL: client queued';
  exception when insufficient_privilege then raise notice 'ok: client cannot call queue_sync'; end;
end $$;
reset role;
set local role anon;
do $$
begin
  begin perform count(*) from public.deal_summaries; raise exception 'FAIL: anon read deal_summaries';
  exception when insufficient_privilege then raise notice 'ok: anon cannot read deal_summaries'; end;
end $$;
reset role;

rollback;
