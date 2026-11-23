-- Two kinds of encumbered case (to a bank, to a financing company); the plain "encumbered" stays for the cars that already have it
-- until Buying picks one. Repairs: a job the car can be displayed with (it stays sellable) or one it cannot.

alter table public.unit_folders drop constraint if exists unit_folders_case_type_check;
alter table public.unit_folders add constraint unit_folders_case_type_check
  check (case_type in ('clean', 'encumbered', 'encumbered_bank', 'encumbered_financing', 'repo_bank', 'company'));

-- Existing jobs keep what they did before: the car cannot be displayed while one is open.
alter table public.car_repairs add column if not exists can_display boolean not null default false;
