-- Removes everything the petty cash (PCF) merge added to MAD Receipts' database and puts back the two things it changed,
-- so the database is the same as with MAD Receipts' own migrations only (up to 20261106000018_module_access.sql).
--
-- WHAT IT DELETES: all petty cash tables and their data (funds, vouchers, replenishments, cash counts, categories,
-- liquidation forms, audit and email logs), the petty cash functions and types, and the two PCF columns of profiles
-- (pcf_role, is_active). Nothing of MAD Receipts (deals, receipts, documents, users, settings) is touched.
--
-- RUN IT ONCE, in the Supabase dashboard -> SQL Editor, after checking that nothing in PCF is still needed. To see what it
-- holds first, run this on its own (it only reads):
--   select (select count(*) from public.funds) funds, (select count(*) from public.vouchers) vouchers,
--          (select count(*) from public.replenishments) replenishments, (select count(*) from public.liquidations) liquidations;
-- (If the "liquidations" table does not exist in your database, leave that last column out.)
-- Then run, in a terminal in the project folder:
--   supabase migration repair --status reverted 20261106000019 20261106000020 --linked
-- so the migration list matches the files again. The "receipts" storage bucket is deleted in the dashboard
-- (Storage -> receipts -> Delete bucket): SQL is not allowed to delete storage buckets.

begin;

-- ---- profiles: the PCF columns, trigger and rules go; the access list goes back to MAD Receipts' own modules
drop trigger if exists profiles_audit on public.profiles;
alter table public.profiles drop constraint if exists profiles_full_name_safe_text;
alter table public.profiles drop constraint if exists profiles_module_values_check;
alter table public.profiles add constraint profiles_module_values_check check (
  module_grants <@ array['dashboard','new','deals','approvals','reminders','documents','upload','cash','activity','settings','users','sync']
  and module_denies <@ array['dashboard','new','deals','approvals','reminders','documents','upload','cash','activity','settings','users','sync']
);
alter table public.profiles drop column if exists pcf_role;
alter table public.profiles drop column if exists is_active;

-- ---- the receipts bucket's access rules (the bucket itself is deleted in the dashboard)
drop policy if exists receipts_read on storage.objects;
drop policy if exists receipts_insert on storage.objects;

-- ---- the petty cash tables (this removes their data, rules, triggers and indexes with them)
drop view if exists public.fund_balance_v;
drop table if exists
  public.liquidation_lines,
  public.liquidations,
  public.liquidation_field_rules,
  public.voucher_items,
  public.vouchers,
  public.cash_counts,
  public.replenishments,
  public.fund_custodians,
  public.fund_counters,
  public.funds,
  public.categories,
  public.notification_log,
  public.rate_limits,
  public.audit_log
  cascade;
drop sequence if exists public.replenishment_no_seq;

-- ---- the petty cash functions, whatever their arguments (set_updated_at is MAD's own and stays)
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'app_role', 'approve_voucher', 'assign_custodian_funds', 'can_access_fund', 'check_rate_limit', 'clean_ref_no',
        'close_replenishment', 'complete_liquidation', 'create_replenishment', 'create_voucher', 'create_voucher_lines',
        'liq_date', 'liq_money', 'liq_text', 'liquidation_missing', 'log_audit', 'next_pcv_number',
        'notification_recipients', 'protect_profile_columns', 'protect_voucher_columns', 'record_cash_count',
        'reject_voucher', 'release_voucher', 'require_fund_access', 'require_role', 'requires_pre_approval',
        'reset_liquidation_rules', 'return_liquidation', 'return_voucher', 'review_replenishment', 'save_liquidation',
        'set_fund_custodians', 'set_liquidation_line_receipt', 'set_liquidation_rule', 'start_liquidation',
        'submit_liquidation', 'submit_replenishment', 'submit_voucher', 'update_voucher_lines', 'void_voucher'
      )
  loop
    execute 'drop function ' || f.signature || ' cascade';
  end loop;
end $$;

-- ---- the petty cash types
drop type if exists public.voucher_status;
drop type if exists public.replenishment_status;
drop type if exists public.pcf_role;

-- ---- MAD Receipts' own timestamp helper, exactly as its first migration defined it (the merge rewrote it)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

commit;
