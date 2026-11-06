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
