-- Parses a peso amount like '50000' or '50000.50' (no symbols or commas). NULL if malformed.
create function public.parse_money(p_text text)
returns numeric(12, 2)
language sql
immutable
set search_path = ''
as $$
  select case when btrim(p_text) ~ '^\d{1,10}(\.\d{1,2})?$' then btrim(p_text)::numeric(12, 2) end;
$$;

-- The only path that writes deals and receipts for a new payment.
-- Called by POST /api/confirm with the service role, after the plate was found in inventory.
-- Payment rules (section 2.2) are recomputed here; the client's numbers are never trusted.
-- Errors are raised with a short code as the message; the route maps them to plain language.
create function public.confirm_receipt(p_actor uuid, p_draft_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.receipt_drafts;
  v_deal public.deals;
  v_receipt public.receipts;
  v_new_deal boolean := false;
  v_first boolean;
  v_type text;
  v_balance_after numeric(12, 2);
  v_plate text := upper(regexp_replace(coalesce(p_payload ->> 'plate_no', ''), '[^A-Za-z0-9]', '', 'g'));
  v_receipt_no text := btrim(coalesce(p_payload ->> 'receipt_no', ''));
  v_amount numeric(12, 2) := public.parse_money(p_payload ->> 'amount');
  v_agreed_price numeric(12, 2) := public.parse_money(p_payload ->> 'agreed_price');
  v_reservation boolean := coalesce((p_payload ->> 'marked_reservation')::boolean, false);
begin
  -- 1. The draft belongs to the caller and has not been used.
  select * into v_draft from public.receipt_drafts where id = p_draft_id for update;
  if not found or v_draft.created_by is distinct from p_actor then
    raise exception 'draft_not_found';
  end if;
  if v_draft.status = 'consumed' then
    raise exception 'draft_already_confirmed';
  end if;
  -- 'failed' is allowed: staff type the details by hand when the AI could not read the photo.
  if v_draft.status not in ('ready', 'failed') then
    raise exception 'draft_not_ready';
  end if;

  if v_receipt_no !~ '^[A-Za-z0-9-]{1,20}$' then raise exception 'invalid_receipt_no'; end if;
  if v_plate = '' then raise exception 'missing_plate'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'invalid_amount'; end if;
  if exists (select 1 from public.receipts where receipt_no = v_receipt_no) then
    raise exception 'duplicate_receipt_no';
  end if;

  -- 2-3. Serialize all confirms for this plate, then find the open deal or create one.
  perform pg_advisory_xact_lock(hashtext('deal:' || v_plate));

  select * into v_deal from public.deals where plate_no = v_plate and status = 'open' for update;
  if not found then
    if nullif(btrim(p_payload ->> 'buyer_name'), '') is null then raise exception 'missing_buyer_name'; end if;
    if v_agreed_price is null or v_agreed_price <= 0 then raise exception 'invalid_agreed_price'; end if;

    insert into public.deals (
      plate_no, make_type, color, motor_no, chassis_no,
      buyer_name, buyer_address, buyer_contact,
      agreed_price, total_paid, balance, status, created_by
    ) values (
      v_plate,
      nullif(btrim(p_payload ->> 'make_type'), ''),
      nullif(btrim(p_payload ->> 'color'), ''),
      nullif(btrim(p_payload ->> 'motor_no'), ''),
      nullif(btrim(p_payload ->> 'chassis_no'), ''),
      btrim(p_payload ->> 'buyer_name'),
      nullif(btrim(p_payload ->> 'buyer_address'), ''),
      nullif(btrim(p_payload ->> 'buyer_contact'), ''),
      v_agreed_price, 0, v_agreed_price, 'open', p_actor
    )
    returning * into v_deal;
    v_new_deal := true;
  end if;

  -- Payment rules, section 2.2.
  v_first := not exists (
    select 1 from public.receipts where deal_id = v_deal.id and status = 'confirmed'
  );
  v_balance_after := v_deal.agreed_price - (v_deal.total_paid + v_amount);
  if v_balance_after < 0 then raise exception 'overpayment'; end if;
  v_type := case
    when v_balance_after = 0 then 'full'
    when v_first and v_reservation then 'earnest'
    else 'partial'
  end;

  -- 4. Insert the receipt (the unique index still guards against a race on receipt_no).
  insert into public.receipts (
    deal_id, receipt_no, receipt_date, amount, payment_type, paper_payment_type,
    payment_method, check_no, bank_branch, balance_after, balance_due_date,
    amount_words, balance_words, photo_path, extraction_raw, status, created_by
  ) values (
    v_deal.id,
    v_receipt_no,
    nullif(p_payload ->> 'receipt_date', '')::date,
    v_amount,
    v_type,
    nullif(p_payload ->> 'paper_payment_type', ''),
    nullif(p_payload ->> 'payment_method', ''),
    nullif(btrim(p_payload ->> 'check_no'), ''),
    nullif(btrim(p_payload ->> 'bank_branch'), ''),
    v_balance_after,
    nullif(p_payload ->> 'balance_due_date', '')::date,
    nullif(btrim(p_payload ->> 'amount_words'), ''),
    nullif(btrim(p_payload ->> 'balance_words'), ''),
    v_draft.photo_path,
    v_draft.extraction,
    'confirmed',
    p_actor
  )
  returning * into v_receipt;

  -- 5. Update the deal.
  update public.deals
  set total_paid = total_paid + v_amount,
      balance = v_balance_after,
      status = case when v_balance_after = 0 then 'completed' else 'open' end
  where id = v_deal.id
  returning * into v_deal;

  -- 6. (The photo is moved to receipts/{receipt_no}.jpg by the route; Storage files can't move in SQL.)
  -- 7. Use up the draft.
  update public.receipt_drafts set status = 'consumed' where id = p_draft_id;

  -- 8. Queue background sync.
  insert into public.sync_jobs (receipt_id, target)
  select v_receipt.id, target
  from unnest(array['drive', 'sheets', 'telegram', 'inventory']) as target;

  -- 9. Audit.
  insert into public.audit_logs (actor_id, action, entity, entity_id, after)
  values (
    p_actor, 'receipt.confirm', 'receipt', v_receipt.id,
    jsonb_build_object('receipt', to_jsonb(v_receipt), 'deal', to_jsonb(v_deal), 'new_deal', v_new_deal)
  );

  return jsonb_build_object(
    'receipt_id', v_receipt.id,
    'receipt_no', v_receipt.receipt_no,
    'payment_type', v_receipt.payment_type,
    'balance_after', v_receipt.balance_after,
    'deal_id', v_deal.id,
    'deal_status', v_deal.status,
    'total_paid', v_deal.total_paid,
    'agreed_price', v_deal.agreed_price,
    'new_deal', v_new_deal
  );
end;
$$;

-- Server only: the route checks inventory first, so clients must not call this directly.
revoke execute on function public.confirm_receipt(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_receipt(uuid, uuid, jsonb) to service_role;
