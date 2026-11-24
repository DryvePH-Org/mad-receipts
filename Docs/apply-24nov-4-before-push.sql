-- 24 Nov 2026, FOURTH file: run this BEFORE pushing the step 3 code. It renames the sale record table to car_sales (nothing is lost) and keeps the old name working as a view,
-- so the code that is running now is not affected. Same text as supabase/migrations/20261124000060_car_sales.sql.

begin;

-- Step 3b of the clean database (Docs/DATABASE_PLAN.md): the sale and its transfer are ONE record per sale, so the table is called what it holds:
-- car_transfers becomes car_sales. Nothing is copied or lost (a rename). The two functions that name the table are made again with the new name.
-- A view called car_transfers stays for now, so the code that is still running before the new code is deployed keeps working; migration 61 removes it.
-- Run this BEFORE pushing the new code.

alter table public.car_transfers rename to car_sales;

-- the constraints and indexes named after the old table take the new name
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.car_sales'::regclass and conname like 'car\_transfers%' loop
    execute format('alter table public.car_sales rename constraint %I to %I', c.conname, replace(c.conname, 'car_transfers', 'car_sales'));
  end loop;
  for c in select indexname from pg_indexes where schemaname = 'public' and tablename = 'car_sales' and indexname like 'car\_transfers%' loop
    execute format('alter index public.%I rename to %I', c.indexname, replace(c.indexname, 'car_transfers', 'car_sales'));
  end loop;
end $$;

-- a sale waiting for its car is linked the moment the car is added
drop trigger if exists car_transfers_link on public.docs_units;
drop function if exists public.car_transfers_link();
create function public.car_sales_link() returns trigger language plpgsql set search_path = '' as $$
begin
  update public.car_sales set unit_id = new.id where unit_id is null and plate_no = new.plate_no;
  return new;
end $$;
create trigger car_sales_link after insert on public.docs_units for each row execute function public.car_sales_link();

create or replace function public.delete_deal(p_actor uuid, p_deal_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_deal public.deals;
  v_paths jsonb; v_audit jsonb; v_plates jsonb; v_numbers jsonb; v_amount numeric;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin') then raise exception 'not_admin'; end if;
  perform pg_advisory_xact_lock(hashtext('submit_receipt'));
  select * into v_deal from public.deals where id = p_deal_id for update;
  if not found then raise exception 'deal_not_found'; end if;

  select coalesce(jsonb_agg(a.storage_path), '[]'::jsonb) into v_paths
    from public.attachments a join public.receipts r on r.id = a.receipt_id where r.deal_id = p_deal_id;
  select coalesce(jsonb_agg(r.drive_file_id) filter (where r.drive_file_id is not null), '[]'::jsonb),
         coalesce(jsonb_agg(r.receipt_no order by r.created_at), '[]'::jsonb), coalesce(sum(r.amount), 0)
    into v_audit, v_numbers, v_amount from public.receipts r where r.deal_id = p_deal_id;
  select coalesce(jsonb_agg(plate_no order by position), '[]'::jsonb) into v_plates from public.deal_units where deal_id = p_deal_id;

  delete from public.sync_jobs where receipt_id in (select id from public.receipts where deal_id = p_deal_id);
  delete from public.receipts where deal_id = p_deal_id;           -- its payments and proof records go with it
  delete from public.car_sales where deal_id = p_deal_id and source_key like 'deal|' || p_deal_id::text || '|%';   -- the sale records this deal made
  delete from public.deals where id = p_deal_id;                   -- its units go with it; a car folder or an older sale record just loses its link to the deal

  insert into public.audit_logs (actor_id, action, entity, entity_id, after)
  values (p_actor, 'deal.delete', 'deal', null,
          jsonb_build_object('deal_no', v_deal.deal_no, 'buyer', v_deal.buyer_name, 'price', v_deal.agreed_price, 'received', v_amount,
                             'receipts', v_numbers, 'plates', v_plates));
  return jsonb_build_object('deal_no', v_deal.deal_no, 'buyer', v_deal.buyer_name, 'storage_paths', v_paths, 'audit_folders', v_audit,
                            'plates', v_plates, 'receipt_nos', v_numbers);
end;
$$;
revoke execute on function public.delete_deal(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_deal(uuid, uuid) to service_role;

-- the old name, for the code that has not been replaced yet (a plain view: reading, adding, changing and deleting work through it)
create view public.car_transfers as select * from public.car_sales;
revoke all on public.car_transfers from anon, authenticated;

commit;
