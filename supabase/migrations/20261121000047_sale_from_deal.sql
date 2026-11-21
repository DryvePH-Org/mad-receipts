-- A sale made in the app (its first receipt) is a record of the sale list too (code). Two database parts:
-- 1. a sale can be "cancelled" (its deal was cancelled): it leaves the open work but stays on record;
-- 2. deleting a transaction (delete_deal, migration 44) also deletes the sale record that deal created. A record that was already
--    there (from the sold list) only loses its link to the deal.

alter table public.car_transfers drop constraint if exists car_transfers_stage_check;
alter table public.car_transfers add constraint car_transfers_stage_check check (stage in ('in_process', 'transferred', 'released', 'delivered', 'unknown', 'cancelled'));

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
  delete from public.car_transfers where deal_id = p_deal_id and source_key like 'deal|' || p_deal_id::text || '|%';   -- the sale records this deal made
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
