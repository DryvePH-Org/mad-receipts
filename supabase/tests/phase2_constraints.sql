-- Phase 2 checks. Runs in a transaction and rolls back, so it leaves no data.
-- Run: docker exec -i supabase_db_<project> psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/phase2_constraints.sql
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'staff1@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'staff2@test.local');

do $$
declare
  d1 uuid;
begin
  -- New auth user gets a staff profile.
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-000000000001') = 'staff',
    'profile not auto-created as staff';

  insert into public.deals (plate_no, buyer_name, agreed_price, balance, created_by)
  values ('NKF4771', 'Buyer A', 500000, 500000, '00000000-0000-0000-0000-000000000001')
  returning id into d1;

  -- Second open deal for the same plate must fail.
  begin
    insert into public.deals (plate_no, buyer_name, agreed_price, balance, created_by)
    values ('NKF4771', 'Buyer B', 500000, 500000, '00000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: second open deal for same plate was allowed';
  exception when unique_violation then
    raise notice 'ok: second open deal for same plate rejected';
  end;

  -- A cancelled deal for the same plate is fine.
  insert into public.deals (plate_no, buyer_name, agreed_price, balance, status, created_by)
  values ('NKF4771', 'Buyer C', 500000, 500000, 'cancelled', '00000000-0000-0000-0000-000000000001');
  raise notice 'ok: cancelled deal for same plate allowed';

  insert into public.receipts (deal_id, receipt_no, amount, payment_type, balance_after, created_by)
  values (d1, '2556', 50000, 'earnest', 450000, '00000000-0000-0000-0000-000000000001');

  -- Duplicate receipt_no must fail.
  begin
    insert into public.receipts (deal_id, receipt_no, amount, payment_type, balance_after, created_by)
    values (d1, '2556', 1000, 'partial', 449000, '00000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: duplicate receipt_no was allowed';
  exception when unique_violation then
    raise notice 'ok: duplicate receipt_no rejected';
  end;

  -- Unnormalized plate must fail.
  begin
    insert into public.deals (plate_no, buyer_name, agreed_price, balance, created_by)
    values ('nkf-4771', 'Buyer D', 500000, 500000, '00000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: unnormalized plate was allowed';
  exception when check_violation then
    raise notice 'ok: unnormalized plate rejected';
  end;
end $$;

-- RLS, acting as staff1.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

do $$
begin
  assert (select count(*) from public.deals) = 2, 'staff cannot read deals';

  begin
    insert into public.deals (plate_no, buyer_name, agreed_price, balance, created_by)
    values ('ABC123', 'X', 1, 1, '00000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: client insert into deals was allowed';
  exception when insufficient_privilege then
    raise notice 'ok: client insert into deals blocked';
  end;

  begin
    update public.receipts set amount = 1;
    raise exception 'FAIL: client update of receipts was allowed';
  exception when insufficient_privilege then
    raise notice 'ok: client update of receipts blocked';
  end;

  begin
    update public.profiles set role = 'admin';
    raise exception 'FAIL: staff could change own role';
  exception when insufficient_privilege then
    raise notice 'ok: staff cannot change role';
  end;

  insert into public.receipt_drafts (photo_path) values ('drafts/00000000-0000-0000-0000-000000000001/a.jpg');
  assert (select count(*) from public.receipt_drafts) = 1, 'staff cannot read own draft';
  raise notice 'ok: staff inserts and reads own draft';

  assert (select count(*) from public.audit_logs) = 0 and (select count(*) from public.sync_jobs) = 0;
  assert not public.is_admin();
end $$;

-- Switch to staff2: must not see staff1's draft.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.receipt_drafts) = 0, 'FAIL: staff2 can see staff1 draft';
  raise notice 'ok: staff2 cannot see staff1 draft';
end $$;

-- Promote staff2 to admin (as postgres), then admin sees everything.
reset role;
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$
begin
  assert public.is_admin(), 'is_admin false for admin';
  assert (select count(*) from public.receipt_drafts) = 1, 'admin cannot see drafts';
  assert (select count(*) from public.profiles) = 2, 'admin cannot see profiles';
  raise notice 'ok: admin reads all drafts and profiles';
end $$;

rollback;
