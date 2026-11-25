-- 25 Nov 2026: the number of a transaction (deal) is its FIRST RECEIPT's number, not D1001... Run this in the MAD Supabase project BEFORE entering the November ARs.
-- It adds a small trigger and renames existing deals (none are live) after their first receipt. Same text as supabase/migrations/20261125000070_transaction_number_is_receipt_number.sql.

begin;

-- The number of a transaction (a deal) is the receipt number, not a number the app makes up (D1001...). A receipt number is never used twice, so it names the
-- transaction on its own: the FIRST receipt of a deal gives the deal its number, and the later receipts of the same deal leave it as it is.
-- A deal that already has a number of the old kind (D1001) is renamed to its first receipt's number too (only when that number is free).
-- Run this BEFORE entering the November ARs. Nothing is lost: the old number is kept in the deal's history (audit_logs 'deal.renumbered').

create function public.deal_number_from_first_receipt() returns trigger language plpgsql security definer set search_path = '' as $$
declare no text := btrim(new.receipt_no); old_no text;
begin
  select deal_no into old_no from public.deals where id = new.deal_id;
  if old_no ~ '^D[0-9]+$' and no <> '' and not exists (select 1 from public.deals d2 where d2.deal_no = no and d2.id <> new.deal_id) then
    update public.deals set deal_no = no where id = new.deal_id;
    insert into public.audit_logs (actor_id, action, entity, entity_id, after) values (new.submitted_by, 'deal.renumbered', 'deal', null, jsonb_build_object('deal_id', new.deal_id, 'was', old_no, 'now', no));
  end if;
  return new;
end $$;
create trigger receipts_name_the_deal after insert on public.receipts for each row execute function public.deal_number_from_first_receipt();

-- deals that already exist: the first receipt of each names it
update public.deals d set deal_no = f.receipt_no
from (select distinct on (r.deal_id) r.deal_id, btrim(r.receipt_no) as receipt_no from public.receipts r order by r.deal_id, r.created_at) f
where d.id = f.deal_id and d.deal_no ~ '^D[0-9]+$' and f.receipt_no <> ''
  and not exists (select 1 from public.deals d2 where d2.deal_no = f.receipt_no and d2.id <> d.id);

commit;
