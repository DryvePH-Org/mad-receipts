-- The "Car status" module can be given to or hidden from a person like any other module, so its id is allowed in the access lists.
alter table public.profiles drop constraint if exists profiles_module_values_check;
alter table public.profiles add constraint profiles_module_values_check check (
  module_grants <@ array['dashboard','cars','new','deals','approvals','reminders','documents','upload','cash','activity','settings','users','sync']
  and module_denies <@ array['dashboard','cars','new','deals','approvals','reminders','documents','upload','cash','activity','settings','users','sync']
);
