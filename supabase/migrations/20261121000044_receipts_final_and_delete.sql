-- No approval step for a receipt: when Sales saves it, it is final at once. And an Admin can delete a whole transaction.
-- Safe to apply BEFORE the new code is pushed: the current code keeps working (a receipt is simply final when saved).
--
-- 1. A receipt is born approved (reviewed_by is the person who filled it in: nobody else looks at it any more).
-- 2. On save the updates that used to wait for the Approver are queued: the Drive audit copy, Telegram and the car's status in the database.
--    Google Sheets are no longer written ('sheets' is not queued). The folder link of Car documents is still queued by its own trigger.
-- 3. delete_deal: an Admin removes a deal with everything that hangs on it. It returns what the app must still clean up outside the database
--    (proof photos in storage, the Drive audit folders).

alter table public.receipts alter column status set default 'approved';

create or replace function public.receipts_final()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  new.status := 'approved';
  new.reviewed_by := new.submitted_by;
  new.reviewed_at := now();
  return new;
end;
$$;
drop trigger if exists receipts_final_trg on public.receipts;
create trigger receipts_final_trg before insert on public.receipts
  for each row execute function public.receipts_final();

create or replace function public.receipts_queue_sync()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform public.queue_sync(new.id, 'confirm', array['drive', 'telegram', 'inventory']);
  return new;
end;
$$;
drop trigger if exists receipts_queue_sync_trg on public.receipts;
create trigger receipts_queue_sync_trg after insert on public.receipts
  for each row execute function public.receipts_queue_sync();

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
  delete from public.deals where id = p_deal_id;                   -- its units go with it; a car folder just loses its link to the deal

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
