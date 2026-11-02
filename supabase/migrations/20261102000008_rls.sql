-- Row level security on every table.
alter table public.profiles enable row level security;
alter table public.receipt_drafts enable row level security;
alter table public.deals enable row level security;
alter table public.receipts enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.audit_logs enable row level security;

-- profiles: see your own; admin sees all. Writes go through the service role only.
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "admin reads profiles" on public.profiles
  for select to authenticated using (public.is_admin());

-- receipt_drafts: staff insert and read their own; admin reads all.
create policy "insert own drafts" on public.receipt_drafts
  for insert to authenticated with check (created_by = auth.uid() and status = 'extracting');
create policy "read own drafts" on public.receipt_drafts
  for select to authenticated using (created_by = auth.uid());
create policy "admin reads drafts" on public.receipt_drafts
  for select to authenticated using (public.is_admin());

-- deals / receipts: any logged-in user can read. No client writes:
-- only confirm_receipt (Phase 7) and admin RPCs (Phase 11) write here.
create policy "read deals" on public.deals
  for select to authenticated using (true);
create policy "read receipts" on public.receipts
  for select to authenticated using (true);

-- sync_jobs / audit_logs: admin read only.
create policy "admin reads sync jobs" on public.sync_jobs
  for select to authenticated using (public.is_admin());
create policy "admin reads audit logs" on public.audit_logs
  for select to authenticated using (public.is_admin());

-- Defense in depth: strip write privileges the API roles do not need.
revoke insert, update, delete, truncate on
  public.profiles, public.deals, public.receipts, public.sync_jobs, public.audit_logs
  from anon, authenticated;
revoke update, delete, truncate on public.receipt_drafts from anon, authenticated;
revoke all on
  public.profiles, public.receipt_drafts, public.deals, public.receipts,
  public.sync_jobs, public.audit_logs
  from anon;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
