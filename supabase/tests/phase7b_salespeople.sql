-- Salespeople rules in confirm_receipt. Runs in a transaction and rolls back.
-- Run: docker exec -i supabase_db_AutomatedSalesInvoice psql -U postgres -q < supabase/tests/phase7b_salespeople.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'p7b-staff@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'p7b-other@example.test');

create temp table t_sp as
  with s as (
    insert into public.salespeople (name, aliases, active) values
      ('B David', '{Dave,Dabid}', true), ('B Ella', '{}', true), ('B Gone', '{}', false)
    returning id, name
  ) select id, name from s;

create function pg_temp.sp(p_name text) returns uuid language sql as $$ select id from t_sp where name = p_name $$;
create function pg_temp.person(p_name text, p_percent text) returns jsonb language sql as $$
  select jsonb_build_object('salesperson_id', pg_temp.sp(p_name), 'commission_percent', p_percent) $$;

create function pg_temp.draft() returns uuid language sql as $$
  insert into public.receipt_drafts (photo_path, status, created_by)
  values ('drafts/x/' || gen_random_uuid() || '.jpg', 'ready', '00000000-0000-0000-0000-0000000000b1') returning id;
$$;

create function pg_temp.confirm(p_no text, p_plate text, p_amount text, p_people jsonb default null) returns jsonb
language sql as $$
  select public.confirm_receipt('00000000-0000-0000-0000-0000000000b1', pg_temp.draft(), jsonb_build_object(
    'receipt_no', p_no, 'plate_no', p_plate, 'amount', p_amount, 'agreed_price', '500000',
    'buyer_name', 'Buyer', 'marked_reservation', true)
    || case when p_people is null then '{}'::jsonb else jsonb_build_object('salespeople', p_people) end);
$$;

create function pg_temp.expect_error(p_sql text, p_code text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: expected % from %', p_code, left(p_sql, 80);
exception when others then
  if sqlerrm <> p_code then raise exception 'FAIL: expected %, got % from %', p_code, sqlerrm, left(p_sql, 80); end if;
  raise notice 'ok: rejected with %', p_code;
end;
$$;

do $$
declare r jsonb; d uuid;
begin
  -- Optional on the first receipt: a reservation without salespeople is fine.
  r := pg_temp.confirm('B1001', 'BSP001', '50000');
  assert r ->> 'deal_status' = 'open';
  d := (r ->> 'deal_id')::uuid;
  assert not exists (select 1 from public.deal_salespeople where deal_id = d);
  raise notice 'ok: salespeople optional while the deal is open';

  -- Said on a later receipt: saved on the deal, each with their own percent (no need to total 100).
  r := pg_temp.confirm('B1002', 'BSP001', '100000',
    jsonb_build_array(pg_temp.person('B David', '3'), pg_temp.person('B Ella', '1.5')));
  assert (select count(*) from public.deal_salespeople where deal_id = d) = 2;
  assert (select commission_percent from public.deal_salespeople where deal_id = d and salesperson_id = pg_temp.sp('B Ella')) = 1.5;
  raise notice 'ok: salespeople saved with their own percent';

  -- Not repeated on the final receipt: the earlier ones count, so the deal can be sold.
  r := pg_temp.confirm('B1003', 'BSP001', '350000');
  assert r ->> 'deal_status' = 'completed';
  assert (select count(*) from public.deal_salespeople where deal_id = d) = 2;
  raise notice 'ok: earlier salespeople satisfy the sold rule';

  -- Said again: replaces the list.
  r := pg_temp.confirm('B2001', 'BSP002', '50000', jsonb_build_array(pg_temp.person('B David', '2')));
  d := (r ->> 'deal_id')::uuid;
  r := pg_temp.confirm('B2002', 'BSP002', '100000', jsonb_build_array(pg_temp.person('B Ella', '4')));
  assert (select count(*) from public.deal_salespeople where deal_id = d) = 1;
  assert (select salesperson_id from public.deal_salespeople where deal_id = d) = pg_temp.sp('B Ella');
  raise notice 'ok: a new list replaces the old one';

  -- Salespeople are in the audit row.
  assert (select (after -> 'salespeople' -> 0 ->> 'name') from public.audit_logs
          where action = 'receipt.confirm' and after -> 'receipt' ->> 'receipt_no' = 'B2002') = 'B Ella';
  raise notice 'ok: audit row lists the salespeople';

  -- JSON null and an empty list both mean "no change".
  r := pg_temp.confirm('B2003', 'BSP002', '1000', 'null'::jsonb);
  r := pg_temp.confirm('B2004', 'BSP002', '1000', '[]'::jsonb);
  assert (select count(*) from public.deal_salespeople where deal_id = d) = 1;
  raise notice 'ok: null or empty keeps the existing salespeople';
end $$;

-- Selling needs a salesperson, and the whole confirm is undone when it is missing.
select pg_temp.expect_error($$select pg_temp.confirm('B3001', 'BSP003', '500000')$$, 'salesperson_required');
do $$
begin
  assert not exists (select 1 from public.receipts where receipt_no = 'B3001'), 'receipt saved despite the error';
  assert not exists (select 1 from public.deals where plate_no = 'BSP003'), 'deal saved despite the error';
  raise notice 'ok: nothing saved when the sold rule fails';
end $$;
select pg_temp.confirm('B3002', 'BSP003', '500000', jsonb_build_array(pg_temp.person('B David', '0')));

-- Bad salespeople input.
select pg_temp.expect_error($$select pg_temp.confirm('B4001', 'BSP004', '1000', jsonb_build_array(pg_temp.person('B David', '101')))$$, 'invalid_salespeople');
select pg_temp.expect_error($$select pg_temp.confirm('B4002', 'BSP004', '1000', jsonb_build_array(pg_temp.person('B David', '-1')))$$, 'invalid_salespeople');
select pg_temp.expect_error($$select pg_temp.confirm('B4003', 'BSP004', '1000', jsonb_build_array(pg_temp.person('B David', '3%')))$$, 'invalid_salespeople');
select pg_temp.expect_error($$select pg_temp.confirm('B4004', 'BSP004', '1000', jsonb_build_array(pg_temp.person('B David', '3'), pg_temp.person('B David', '4')))$$, 'invalid_salespeople');
select pg_temp.expect_error($$select pg_temp.confirm('B4005', 'BSP004', '1000', jsonb_build_array(pg_temp.person('B Gone', '3')))$$, 'invalid_salespeople');
select pg_temp.expect_error($$select pg_temp.confirm('B4006', 'BSP004', '1000', jsonb_build_array(jsonb_build_object('salesperson_id', gen_random_uuid(), 'commission_percent', '3')))$$, 'invalid_salespeople');
select pg_temp.expect_error($$select pg_temp.confirm('B4007', 'BSP004', '1000', jsonb_build_array(jsonb_build_object('commission_percent', '3')))$$, 'invalid_salespeople');
select pg_temp.expect_error($$select pg_temp.confirm('B4008', 'BSP004', '1000', '"David"'::jsonb)$$, 'invalid_salespeople');
select pg_temp.expect_error($$select pg_temp.confirm('B4009', 'BSP004', '1000', (select jsonb_agg(pg_temp.person('B David', '1')) from generate_series(1, 6)))$$, 'invalid_salespeople');

-- Clients can read salespeople but cannot write anything.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.salespeople where name like 'B %') = 3, 'staff cannot read salespeople';
  begin insert into public.salespeople (name) values ('Hacker'); raise exception 'FAIL: client added a salesperson';
  exception when insufficient_privilege then raise notice 'ok: client cannot add salespeople'; end;
  begin update public.salespeople set active = false; raise exception 'FAIL: client changed salespeople';
  exception when insufficient_privilege then raise notice 'ok: client cannot change salespeople'; end;
  begin insert into public.deal_salespeople (deal_id, salesperson_id, commission_percent)
        select id, pg_temp.sp('B David'), 5 from public.deals limit 1; raise exception 'FAIL: client wrote deal salespeople';
  exception when insufficient_privilege then raise notice 'ok: client cannot write deal salespeople'; end;
end $$;
reset role;

-- Names are unique ignoring case and spaces.
do $$
begin
  begin insert into public.salespeople (name) values ('  b david '); raise exception 'FAIL: duplicate name allowed';
  exception when unique_violation then raise notice 'ok: duplicate name rejected'; end;
end $$;

rollback;
