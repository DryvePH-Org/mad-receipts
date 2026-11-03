-- confirm_receipt checks. Runs in a transaction and rolls back.
-- Run: docker exec -i supabase_db_AutomatedSalesInvoice psql -U postgres -q < supabase/tests/phase7_confirm_receipt.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'c1@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'c2@test.local');

-- Helper: a ready draft owned by staff c1.
create function pg_temp.draft(p_owner uuid default '00000000-0000-0000-0000-0000000000a1') returns uuid
language sql as $$
  insert into public.receipt_drafts (photo_path, status, created_by)
  values ('drafts/x/' || gen_random_uuid() || '.jpg', 'ready', p_owner) returning id;
$$;

-- A salesperson, required by confirm_receipt on the payment that completes a deal.
create temp table t_seller as
  with s as (insert into public.salespeople (name) values ('P7 Test Seller') returning id) select id from s;
create function pg_temp.seller() returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('salesperson_id', (select id from t_seller), 'commission_percent', '3'));
$$;

create function pg_temp.confirm(p_no text, p_plate text, p_amount text, p_price text default '500000',
  p_reservation boolean default false, p_people jsonb default null) returns jsonb
language sql as $$
  select public.confirm_receipt('00000000-0000-0000-0000-0000000000a1', pg_temp.draft(), jsonb_build_object(
    'receipt_no', p_no, 'plate_no', p_plate, 'amount', p_amount, 'agreed_price', p_price,
    'buyer_name', 'Jose Rizal', 'marked_reservation', p_reservation, 'receipt_date', '2026-11-02')
    || case when p_people is null then '{}'::jsonb else jsonb_build_object('salespeople', p_people) end);
$$;

create function pg_temp.expect_error(p_sql text, p_code text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: expected % from %', p_code, p_sql;
exception when others then
  if sqlerrm <> p_code and not (p_code = 'unique' and sqlstate = '23505') then
    raise exception 'FAIL: expected %, got % (%)', p_code, sqlerrm, sqlstate;
  end if;
  raise notice 'ok: % rejected with %', left(p_sql, 60), p_code;
end;
$$;

do $$
declare r jsonb; d public.deals;
begin
  -- Case 1: 50k earnest, then 450k → earnest, full.
  r := pg_temp.confirm('T1001', 'tst-4771', '50000', p_reservation => true);
  assert r ->> 'payment_type' = 'earnest' and (r ->> 'balance_after')::numeric = 450000 and r ->> 'deal_status' = 'open', r::text;
  assert (r ->> 'new_deal')::boolean;
  r := pg_temp.confirm('T1002', 'TST 4771', '450000', p_price => '999999', p_people => pg_temp.seller()); -- price ignored for an existing deal
  assert r ->> 'payment_type' = 'full' and (r ->> 'balance_after')::numeric = 0 and r ->> 'deal_status' = 'completed', r::text;
  assert not (r ->> 'new_deal')::boolean;
  select * into d from public.deals where id = (r ->> 'deal_id')::uuid;
  assert d.total_paid = 500000 and d.balance = 0 and d.plate_no = 'TST4771', 'case 1 deal totals';
  raise notice 'ok: case 1 earnest → full, deal completed';

  -- Case 2: 100k earnest, 100k, rest → earnest, partial, full.
  assert pg_temp.confirm('T2001', 'ABC123', '100000', p_reservation => true) ->> 'payment_type' = 'earnest';
  assert pg_temp.confirm('T2002', 'ABC123', '100000', p_reservation => true) ->> 'payment_type' = 'partial';
  r := pg_temp.confirm('T2003', 'ABC123', '300000', p_people => pg_temp.seller());
  assert r ->> 'payment_type' = 'full' and r ->> 'deal_status' = 'completed';
  raise notice 'ok: case 2 earnest → partial → full';

  -- Case 3: 250k on 500k, no earnest → partial, then full.
  assert pg_temp.confirm('T3001', 'XYZ789', '250000') ->> 'payment_type' = 'partial';
  assert pg_temp.confirm('T3002', 'XYZ789', '250000', p_people => pg_temp.seller()) ->> 'payment_type' = 'full';
  raise notice 'ok: case 3 partial → full';

  -- A completed deal frees the plate for a new deal.
  r := pg_temp.confirm('T1003', 'TST4771', '10000', p_price => '600000');
  assert (r ->> 'new_deal')::boolean and (r ->> 'agreed_price')::numeric = 600000;
  raise notice 'ok: new deal after completed one';

  -- Side effects: draft consumed, 4 sync jobs, 1 audit row per receipt.
  assert (select count(*) from public.sync_jobs j join public.receipts r on r.id = j.receipt_id where r.created_by = '00000000-0000-0000-0000-0000000000a1')
    = 4 * (select count(*) from public.receipts where created_by = '00000000-0000-0000-0000-0000000000a1');
  assert (select count(*) from public.audit_logs where action = 'receipt.confirm' and actor_id = '00000000-0000-0000-0000-0000000000a1')
    = (select count(*) from public.receipts where created_by = '00000000-0000-0000-0000-0000000000a1');
  assert not exists (select 1 from public.receipt_drafts where status = 'ready' and created_by = '00000000-0000-0000-0000-0000000000a1');
  raise notice 'ok: drafts consumed, sync jobs and audit rows written';
end $$;

select pg_temp.expect_error($$select pg_temp.confirm('T1001', 'QQQ111', '1000')$$, 'duplicate_receipt_no');
select pg_temp.expect_error($$select pg_temp.confirm('4001', 'TST4771', '590000.01')$$, 'overpayment');
select pg_temp.expect_error($$select pg_temp.confirm('4002', 'NEW1', '500001')$$, 'overpayment');
select pg_temp.expect_error($$select pg_temp.confirm('4003', 'NEW1', '0')$$, 'invalid_amount');
select pg_temp.expect_error($$select pg_temp.confirm('4004', 'NEW1', '50,000')$$, 'invalid_amount');
select pg_temp.expect_error($$select pg_temp.confirm('', 'NEW1', '1000')$$, 'invalid_receipt_no');
select pg_temp.expect_error($$select pg_temp.confirm('45/6', 'NEW1', '1000')$$, 'invalid_receipt_no');
select pg_temp.expect_error($$select pg_temp.confirm('4005', '--', '1000')$$, 'missing_plate');
select pg_temp.expect_error($$select pg_temp.confirm('4006', 'NEW1', '1000', p_price => '')$$, 'invalid_agreed_price');
-- Another user's draft.
select pg_temp.expect_error($$select public.confirm_receipt('00000000-0000-0000-0000-0000000000a1',
  pg_temp.draft('00000000-0000-0000-0000-0000000000a2'), '{"receipt_no":"5001","plate_no":"A1","amount":"1","agreed_price":"10","buyer_name":"x"}')$$,
  'draft_not_found');
-- A consumed draft cannot be used twice.
select pg_temp.expect_error($$select public.confirm_receipt('00000000-0000-0000-0000-0000000000a1',
  (select id from public.receipt_drafts where status = 'consumed' and created_by = '00000000-0000-0000-0000-0000000000a1' limit 1), '{"receipt_no":"5002","plate_no":"A1","amount":"1","agreed_price":"10","buyer_name":"x"}')$$,
  'draft_already_confirmed');

-- Clients (authenticated role) cannot call it directly.
set local role authenticated;
select pg_temp.expect_error($$select public.confirm_receipt('00000000-0000-0000-0000-0000000000a1',
  gen_random_uuid(), '{}')$$, 'permission denied for function confirm_receipt');
reset role;

rollback;
