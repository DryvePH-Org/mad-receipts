-- Per-person module access: on top of what the role includes, the Admin can add a few modules for one person
-- (module_grants) or hide modules from one person (module_denies). Hiding wins. The app works out the final list;
-- only the server (service role) writes these columns, like the rest of profiles.
alter table public.profiles
  add column if not exists module_grants text[] not null default '{}',
  add column if not exists module_denies text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_module_values_check;
alter table public.profiles add constraint profiles_module_values_check check (
  module_grants <@ array['dashboard','new','deals','approvals','reminders','documents','upload','cash','activity','settings','users','sync']
  and module_denies <@ array['dashboard','new','deals','approvals','reminders','documents','upload','cash','activity','settings','users','sync']
);
-- Car documents (unit_folders, folder_files): take away the table permissions nobody needs.
--
-- Row-level security was already on and only signed-in people may READ (policies "read unit folders" and
-- "read folder files"), so nothing could be seen or changed by a stranger. But the tables still carried the broad
-- default permissions Supabase gives every new table (the other tables had them removed in migration 15).
-- This removes them so a second layer protects the data: signed-in users may only read, the signed-out role may do
-- nothing, and writing is done by the server with its own key, exactly as the app already does.
revoke all on public.unit_folders, public.folder_files from anon, authenticated;
grant select on public.unit_folders, public.folder_files to authenticated;
-- Lets the Admin's "Delete all transactions" start the deal numbers again at D1001.
-- Only the server (service role) may call it, and the app only does so after every deal is deleted.
create or replace function public.reset_deal_numbers()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.deals) then
    raise exception 'deals_exist';
  end if;
  perform setval('public.deal_no_seq', 1001, false);
end;
$$;
revoke all on function public.reset_deal_numbers() from public, anon, authenticated;
grant execute on function public.reset_deal_numbers() to service_role;
