-- 24 Nov 2026, FILE 4b: run this RIGHT NOW (after file 4). Without it a Super Admin cannot delete a transaction (the rename had put back the old Admin-only check).

begin;

-- Fix after migration 60: delete_deal was made again with the old text, which only let an Admin delete a transaction, not a Super Admin (migration 49 had widened it
-- in the live database). The same widening is applied again to every function that still checks only role = 'admin'. Safe to run twice.
-- Run this RIGHT AFTER migration 60.

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

commit;
