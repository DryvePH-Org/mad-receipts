-- Approving and saving settings follow a person's modules, not only their role: an Admin can give one person the
-- Approvals or Settings module (Users page → Access). Hiding a module also takes the power away, and nobody can approve
-- their own receipt (that rule is unchanged).

-- Whether this person has the module: the role's own (only approving and settings matter here), or granted, and not hidden.
create or replace function public.can_use_module(p_user uuid, p_module text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select (
      ((p_module = 'approvals' and p.role = 'approver') or (p_module = 'settings' and p.role = 'admin') or p_module = any (p.module_grants))
      and (p_module <> all (p.module_denies) or (p_module = 'settings' and p.role = 'admin'))
    )
    from public.profiles p where p.id = p_user
  ), false);
$$;
revoke all on function public.can_use_module(uuid, text) from public, anon, authenticated;
grant execute on function public.can_use_module(uuid, text) to service_role;

create or replace function public.review_receipt(p_actor uuid, p_receipt_id uuid, p_approve boolean, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_receipt public.receipts; v_deal public.deals; v_paid numeric; v_payout numeric;
begin
  if not public.can_use_module(p_actor, 'approvals') then raise exception 'not_approver'; end if;
  perform pg_advisory_xact_lock(hashtext('submit_receipt'));
  select * into v_receipt from public.receipts where id = p_receipt_id for update;
  if not found then raise exception 'receipt_not_found'; end if;
  if v_receipt.status <> 'pending' then raise exception 'not_pending'; end if;
  if v_receipt.submitted_by = p_actor then raise exception 'own_receipt'; end if;
  select * into v_deal from public.deals where id = v_receipt.deal_id for update;
  if v_deal.status = 'cancelled' then raise exception 'deal_cancelled'; end if;

  if p_approve then
    select coalesce(sum(amount), 0), coalesce(sum(payout), 0) into v_paid, v_payout
    from public.receipts where deal_id = v_deal.id and status = 'approved';
    v_paid := v_paid + v_deal.opening_paid;
    if v_deal.amount_due >= 0 and v_deal.amount_due - (v_paid + v_receipt.amount) + (v_payout + v_receipt.payout) < 0 then
      raise exception 'overpayment';
    end if;
    update public.receipts set status = 'approved', reviewed_by = p_actor, reviewed_at = now()
    where id = v_receipt.id returning * into v_receipt;
    perform public.queue_sync(v_receipt.id, 'confirm', array['drive', 'sheets', 'telegram', 'inventory']);
  else
    if v_reason is null or char_length(v_reason) < 3 then raise exception 'reason_required'; end if;
    update public.receipts set status = 'rejected', reviewed_by = p_actor, reviewed_at = now(), reject_reason = v_reason
    where id = v_receipt.id returning * into v_receipt;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, after)
  values (p_actor, case when p_approve then 'receipt.approve' else 'receipt.reject' end, 'receipt', v_receipt.id,
          jsonb_build_object('receipt', to_jsonb(v_receipt) - 'snapshot', 'deal_no', v_deal.deal_no, 'reason', v_reason));
  return jsonb_build_object('receipt_id', v_receipt.id, 'receipt_no', v_receipt.receipt_no, 'status', v_receipt.status, 'deal_id', v_deal.id);
end;
$$;

create or replace function public.update_settings(p_actor uuid, p_config jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_before jsonb;
begin
  if not public.can_use_module(p_actor, 'settings') then raise exception 'not_admin'; end if;
  if jsonb_typeof(p_config) is distinct from 'object' then raise exception 'settings_invalid'; end if;
  select config into v_before from public.app_settings where id = 1;
  insert into public.app_settings (id, config, updated_by, updated_at) values (1, p_config, p_actor, now())
  on conflict (id) do update set config = excluded.config, updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_logs (actor_id, action, entity, before, after)
  values (p_actor, 'settings.update', 'settings', v_before, p_config);
end;
$$;
