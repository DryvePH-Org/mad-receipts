-- Five roles: Super Admin (everything, including Settings, Users and Sync jobs), Admin (every module, edit and delete, no administration tools),
-- Buying (what Documentation was), Online Marketing (looks at Car status, Car documents and Repairs, changes nothing), Sales.
-- Approver becomes Admin and Documentation becomes Buying. Only ONE account becomes Super Admin: the email below.
-- If that is not the owner's login email, change it here before applying.

do $$
declare
  v_owner constant text := 'aaron.custodio@dryve.ph';
  v_id uuid;
begin
  alter table public.profiles drop constraint if exists profiles_role_check;
  update public.profiles set role = 'admin' where role in ('approver', 'admin');
  update public.profiles set role = 'buying' where role = 'documentation';
  alter table public.profiles add constraint profiles_role_check check (role in ('super_admin', 'admin', 'buying', 'marketing', 'sales'));

  select id into v_id from auth.users where lower(email) = lower(v_owner);
  if v_id is not null then
    update public.profiles set role = 'super_admin' where id = v_id;
  elsif exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'No account has the email % so nobody would be Super Admin. Change the email at the top of this file, then apply it again.', v_owner;
  end if;
end $$;

-- Admin work in the database is for both: an Admin and a Super Admin.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'super_admin')); $$;

create or replace function public.is_approver()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'super_admin')); $$;

create or replace function public.is_admin_or_approver()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'super_admin')); $$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin'); $$;

-- The sync jobs are an administration tool.
drop policy if exists "admin reads sync jobs" on public.sync_jobs;
create policy "super admin reads sync jobs" on public.sync_jobs for select to authenticated using (public.is_super_admin());

-- Settings follow the Super Admin role (or a module granted to one person).
create or replace function public.can_use_module(p_user uuid, p_module text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select (
      ((p_module = 'settings' and p.role = 'super_admin') or p_module = any (p.module_grants))
      and (p_module <> all (p.module_denies) or (p_module = 'settings' and p.role = 'super_admin'))
    )
    from public.profiles p where p.id = p_user
  ), false);
$$;
revoke all on function public.can_use_module(uuid, text) from public, anon, authenticated;
grant execute on function public.can_use_module(uuid, text) to service_role;

-- The functions that check "this person is an admin" (void, cancel, delete a transaction, ...) now accept an Admin and a Super Admin; the Approver check is the same check.
do $$
declare
  r record;
  def text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and (pg_get_functiondef(p.oid) like '%role = ''admin''%' or pg_get_functiondef(p.oid) like '%role = ''approver''%')
  loop
    def := replace(replace(pg_get_functiondef(r.oid), 'role = ''admin''', 'role in (''admin'', ''super_admin'')'), 'role = ''approver''', 'role in (''admin'', ''super_admin'')');
    execute def;
  end loop;
end $$;
