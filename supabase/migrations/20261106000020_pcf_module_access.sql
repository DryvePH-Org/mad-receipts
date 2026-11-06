-- Per-person access covers the petty cash modules too: an Admin can hide any of them from one person.
-- (They cannot be granted on their own: they come with the petty cash role, profiles.pcf_role.)
alter table public.profiles drop constraint if exists profiles_module_values_check;
alter table public.profiles add constraint profiles_module_values_check check (
  module_grants <@ array['dashboard','new','deals','approvals','reminders','documents','upload','cash','activity','settings','users','sync',
    'pcf','pcf-vouchers','pcf-approvals','pcf-replenishments','pcf-cash-count','pcf-reports','pcf-audit','pcf-funds','pcf-categories','pcf-notifications']
  and module_denies <@ array['dashboard','new','deals','approvals','reminders','documents','upload','cash','activity','settings','users','sync',
    'pcf','pcf-vouchers','pcf-approvals','pcf-replenishments','pcf-cash-count','pcf-reports','pcf-audit','pcf-funds','pcf-categories','pcf-notifications']
);
