-- In lieu of documents is part of the money rules: the documents the buyer leaves with us stand in for part of what they must pay, so
-- the amount comes off the balance like a payment:
--   amount due = (down payment, or the price for cash) - trade-in + processing fee - in lieu of documents
--   price + fee = trade-in + loan + in lieu + received - payout + balance
-- It can never be more than the buyer owes. The deal keeps the amount due after it (deals.amount_due), so every balance, receipt check and
-- summary that already reads it follows. Deals made before this update keep the amount due they were made with.

create or replace function public.submit_receipt(p_actor uuid, p_payload jsonb, p_require_proofs boolean default true)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_deal public.deals;
  v_deal_id uuid := nullif(p_payload ->> 'deal_id', '')::uuid;
  v_new boolean := v_deal_id is null;
  v_no text := btrim(coalesce(p_payload ->> 'receipt_no', ''));
  v_date date := coalesce(nullif(p_payload ->> 'receipt_date', '')::date, public.manila_today());
  v_kind text := p_payload ->> 'kind';
  v_buyer jsonb := coalesce(p_payload -> 'buyer', '{}'::jsonb);
  v_trade jsonb := p_payload -> 'trade_in';
  v_lieu jsonb := p_payload -> 'lieu';
  v_due_in jsonb := coalesce(p_payload -> 'due', '{}'::jsonb);
  v_price numeric; v_sale text; v_dp numeric; v_fee numeric; v_tv numeric := 0;
  v_share numeric; v_loan numeric; v_due numeric; v_lieu_amt numeric := 0;
  v_opening numeric := 0; v_earlier_paid numeric := 0; v_earlier_payout numeric := 0;
  v_paid numeric := 0; v_payout numeric := 0; v_balance numeric;
  v_receipt public.receipts; v_payment_id uuid; v_pos int := 0;
  v_pay jsonb; v_att jsonb; v_unit jsonb; v_amt numeric; v_method text;
  v_date_text text; v_due_date date;
begin
  if not exists (select 1 from public.profiles where id = p_actor) then raise exception 'not_signed_in'; end if;
  if v_no = '' then raise exception 'receipt_no_required'; end if;
  if v_kind is null or v_kind not in ('earnest', 'partial', 'full') then raise exception 'kind_invalid'; end if;
  if jsonb_typeof(p_payload -> 'payments') is distinct from 'array' then raise exception 'payment_required'; end if;

  perform pg_advisory_xact_lock(hashtext('submit_receipt'));

  if v_new then
    -- ---- terms of a new deal ----
    if btrim(coalesce(v_buyer ->> 'name', '')) = '' then raise exception 'buyer_required'; end if;
    if jsonb_typeof(p_payload -> 'units') is distinct from 'array' or jsonb_array_length(p_payload -> 'units') = 0 then
      raise exception 'unit_required';
    end if;
    v_price := public.to_num(p_payload ->> 'price');
    v_sale := p_payload ->> 'sale_type';
    if v_price is null or v_price <= 0 then raise exception 'price_required'; end if;
    if v_sale is null or v_sale not in ('cash', 'financing') then raise exception 'sale_type_invalid'; end if;
    v_dp := case when v_sale = 'financing' then public.to_num(p_payload ->> 'down_payment') end;
    v_fee := case when v_sale = 'financing' then coalesce(public.to_num(p_payload ->> 'processing_fee'), 0) else 0 end;
    if v_trade is not null and jsonb_typeof(v_trade) = 'object' then v_tv := coalesce(public.to_num(v_trade ->> 'value'), 0); end if;
    if v_tv < 0 then raise exception 'trade_in_invalid'; end if;
    v_opening := coalesce(public.to_num(p_payload ->> 'earlier'), 0);
    if v_opening < 0 then raise exception 'earlier_invalid'; end if;
    if v_sale = 'financing' then
      if btrim(coalesce(p_payload ->> 'institution', '')) = '' then raise exception 'institution_required'; end if;
      if v_dp is null or v_dp <= 0 then raise exception 'down_payment_required'; end if;
      if v_dp > v_price then raise exception 'down_payment_too_high'; end if;
    end if;
    select m.share, m.loan, m.due into v_share, v_loan, v_due from public.deal_math(v_price, v_sale, v_dp, v_tv, v_fee) m;
    -- In lieu of documents: the buyer leaves documents in place of paying that part now, so it comes off what the buyer must pay.
    v_lieu_amt := case when v_lieu is not null and jsonb_typeof(v_lieu) = 'object' then coalesce(public.to_num(v_lieu ->> 'amount'), 0) else 0 end;
    if v_lieu_amt < 0 then raise exception 'lieu_invalid'; end if;
    if v_lieu_amt > greatest(v_due, 0) then raise exception 'lieu_too_high'; end if;
    v_due := v_due - v_lieu_amt;
    if v_sale = 'financing' and v_tv > v_share then raise exception 'trade_in_exceeds_down_payment'; end if;
    v_date_text := nullif(btrim(coalesce(v_due_in ->> 'date', '')), '');
    v_due_date := case when v_due_in ->> 'mode' = 'date' then v_date_text::date end;

    insert into public.deals (
      buyer_name, buyer_address, buyer_contact, sale_type, institution, agreed_price, down_payment, loan_amount,
      processing_fee, monthly_payment, years, opening_paid, trade_in_value, trade_in, amount_due, lieu_amount, lieu_until,
      due_date, due_text, loan_status, loan_since, terms, created_by
    ) values (
      btrim(v_buyer ->> 'name'), nullif(btrim(coalesce(v_buyer ->> 'address', '')), ''), nullif(btrim(coalesce(v_buyer ->> 'contact', '')), ''),
      v_sale, case when v_sale = 'financing' then btrim(p_payload ->> 'institution') end, v_price, v_dp, v_loan,
      v_fee, public.to_num(p_payload ->> 'monthly'), nullif(btrim(coalesce(p_payload ->> 'years', '')), '')::numeric,
      v_opening, v_tv, case when v_tv > 0 then v_trade end, v_due,
      case when v_lieu is not null and jsonb_typeof(v_lieu) = 'object' then coalesce(public.to_num(v_lieu ->> 'amount'), 0) else 0 end,
      case when v_lieu is not null and jsonb_typeof(v_lieu) = 'object' then nullif(v_lieu ->> 'until', '')::date end,
      v_due_date, case when v_due_in ->> 'mode' = 'text' then nullif(btrim(coalesce(v_due_in ->> 'text', '')), '') end,
      case when v_loan > 0 then 'waiting' else 'none' end, case when v_loan > 0 then public.manila_today() end,
      coalesce(p_payload -> 'terms', '{}'::jsonb), p_actor
    ) returning * into v_deal;

    v_pos := 0;
    for v_unit in select * from jsonb_array_elements(p_payload -> 'units') loop
      v_pos := v_pos + 1;
      if btrim(coalesce(v_unit ->> 'make_type', '')) = '' then raise exception 'make_type_required'; end if;
      if public.normalize_plate(v_unit ->> 'plate') = '' then raise exception 'plate_required'; end if;
      begin
        insert into public.deal_units (deal_id, position, make_type, plate_no, plate_display, motor_no, chassis_no, color)
        values (v_deal.id, v_pos, btrim(v_unit ->> 'make_type'), public.normalize_plate(v_unit ->> 'plate'),
                btrim(v_unit ->> 'plate'), nullif(btrim(coalesce(v_unit ->> 'motor', '')), ''),
                nullif(btrim(coalesce(v_unit ->> 'chassis', '')), ''), nullif(btrim(coalesce(v_unit ->> 'color', '')), ''));
      exception when unique_violation then raise exception 'plate_in_use';
      end;
    end loop;
  else
    select * into v_deal from public.deals where id = v_deal_id for update;
    if not found then raise exception 'deal_not_found'; end if;
    if v_deal.status = 'cancelled' then raise exception 'deal_cancelled'; end if;
    v_due := v_deal.amount_due;
    v_opening := v_deal.opening_paid;
    v_tv := v_deal.trade_in_value;
    select coalesce(sum(amount), 0), coalesce(sum(payout), 0) into v_earlier_paid, v_earlier_payout
    from public.receipts where deal_id = v_deal.id and status in ('pending', 'approved');
  end if;
  v_earlier_paid := v_earlier_paid + v_opening;

  -- ---- this receipt's payments ----
  for v_pay in select * from jsonb_array_elements(p_payload -> 'payments') loop
    v_amt := public.to_num(v_pay ->> 'amount');
    v_method := v_pay ->> 'method';
    if v_amt is null or v_amt <= 0 then raise exception 'payment_amount_invalid'; end if;
    if v_method is null or v_method not in ('cash', 'check', 'wallet') then raise exception 'payment_method_invalid'; end if;
    if v_method = 'wallet' and btrim(coalesce(v_pay ->> 'label', '')) = '' then raise exception 'payment_name_required'; end if;
    if p_require_proofs and coalesce(jsonb_array_length(v_pay -> 'attachments'), 0) = 0 then raise exception 'proof_required'; end if;
    v_paid := v_paid + v_amt;
  end loop;

  if jsonb_typeof(p_payload -> 'payout') = 'object' then v_payout := coalesce(public.to_num(p_payload -> 'payout' ->> 'amount'), 0); end if;
  if v_payout > 0 and v_due >= 0 then raise exception 'payout_not_allowed'; end if;
  if v_payout > 0 and p_require_proofs and coalesce(jsonb_array_length(p_payload -> 'payout' -> 'attachments'), 0) = 0 then
    raise exception 'payout_proof_required';
  end if;
  if v_paid = 0 and v_payout = 0 and v_due > 0 then raise exception 'payment_required'; end if;

  v_balance := v_due - (v_earlier_paid + v_paid) + (v_earlier_payout + v_payout);
  if v_due >= 0 and v_balance < 0 then raise exception 'overpayment'; end if;
  if v_due < 0 and v_balance > 0 then raise exception 'payout_too_high'; end if;

  begin
    insert into public.receipts (deal_id, receipt_no, receipt_date, kind, amount, payout, balance_after, submitted_by, remarks, notes, snapshot)
    values (v_deal.id, v_no, v_date, v_kind, v_paid, v_payout, v_balance, p_actor,
            nullif(btrim(coalesce(p_payload ->> 'remarks', '')), ''), p_payload -> 'notes', coalesce(p_payload -> 'snapshot', '{}'::jsonb))
    returning * into v_receipt;
  exception when unique_violation then raise exception 'receipt_no_taken';
  end;

  v_pos := 0;
  for v_pay in select * from jsonb_array_elements(p_payload -> 'payments') loop
    v_pos := v_pos + 1;
    insert into public.receipt_payments (receipt_id, position, method, label, amount, reference, check_no, bank, branch)
    values (v_receipt.id, v_pos, v_pay ->> 'method',
            case when v_pay ->> 'method' = 'cash' then 'Cash' when v_pay ->> 'method' = 'check' then 'Check' else btrim(v_pay ->> 'label') end,
            public.to_num(v_pay ->> 'amount'), nullif(btrim(coalesce(v_pay ->> 'reference', '')), ''),
            nullif(btrim(coalesce(v_pay ->> 'check_no', '')), ''), nullif(btrim(coalesce(v_pay ->> 'bank', '')), ''),
            nullif(btrim(coalesce(v_pay ->> 'branch', '')), ''))
    returning id into v_payment_id;
    for v_att in select * from jsonb_array_elements(coalesce(v_pay -> 'attachments', '[]'::jsonb)) loop
      if split_part(v_att ->> 'path', '/', 1) <> p_actor::text then raise exception 'bad_attachment'; end if;
      insert into public.attachments (receipt_id, payment_id, purpose, storage_path, filename, mime_type, size_bytes, uploaded_by)
      values (v_receipt.id, v_payment_id, 'payment', v_att ->> 'path', coalesce(v_att ->> 'filename', 'proof'), v_att ->> 'mime',
              nullif(v_att ->> 'size', '')::int, p_actor);
    end loop;
  end loop;
  if v_payout > 0 then
    for v_att in select * from jsonb_array_elements(coalesce(p_payload -> 'payout' -> 'attachments', '[]'::jsonb)) loop
      if split_part(v_att ->> 'path', '/', 1) <> p_actor::text then raise exception 'bad_attachment'; end if;
      insert into public.attachments (receipt_id, purpose, storage_path, filename, mime_type, size_bytes, uploaded_by)
      values (v_receipt.id, 'payout', v_att ->> 'path', coalesce(v_att ->> 'filename', 'proof'), v_att ->> 'mime',
              nullif(v_att ->> 'size', '')::int, p_actor);
    end loop;
  end if;

  insert into public.audit_logs (actor_id, action, entity, entity_id, after)
  values (p_actor, 'receipt.submit', 'receipt', v_receipt.id,
          jsonb_build_object('receipt', to_jsonb(v_receipt) - 'snapshot', 'deal_no', v_deal.deal_no, 'new_deal', v_new));

  return jsonb_build_object('deal_id', v_deal.id, 'deal_no', v_deal.deal_no, 'receipt_id', v_receipt.id,
                            'receipt_no', v_receipt.receipt_no, 'balance_after', v_balance, 'new_deal', v_new);
end;
$$;
