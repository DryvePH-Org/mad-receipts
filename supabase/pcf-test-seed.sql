-- TEST PROJECT ONLY (ref ggwdtwmudicvzgpjejtu). Never run against the live project.
-- Petty cash test data for tests/pcf (npm run test:pcf-db): one fund, the categories, and one
-- @pcf.local user per petty cash role with a dev-only password.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'admin@pcf.local',
    extensions.crypt('Phase1-Dev-Passw0rd', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"PCF Admin"}'::jsonb, now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'custodian@pcf.local',
    extensions.crypt('Phase1-Dev-Passw0rd', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"PCF Custodian"}'::jsonb, now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'approver@pcf.local',
    extensions.crypt('Phase1-Dev-Passw0rd', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"PCF Approver"}'::jsonb, now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 'accounting@pcf.local',
    extensions.crypt('Phase1-Dev-Passw0rd', extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"PCF Accountant"}'::jsonb, now(), now(), '', '', '', ''
  )
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select v.provider_id, v.user_id, v.identity_data, 'email', now(), now(), now()
from (values
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001'::uuid,
    '{"sub":"00000000-0000-4000-8000-000000000001","email":"admin@pcf.local","email_verified":true,"phone_verified":false}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002'::uuid,
    '{"sub":"00000000-0000-4000-8000-000000000002","email":"custodian@pcf.local","email_verified":true,"phone_verified":false}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000003'::uuid,
    '{"sub":"00000000-0000-4000-8000-000000000003","email":"approver@pcf.local","email_verified":true,"phone_verified":false}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000004'::uuid,
    '{"sub":"00000000-0000-4000-8000-000000000004","email":"accounting@pcf.local","email_verified":true,"phone_verified":false}'::jsonb
  )
) as v(provider_id, user_id, identity_data)
where not exists (
  select 1 from auth.identities i
  where i.provider = 'email' and i.provider_id = v.provider_id
);

-- MAD creates each profile (role 'sales') when the user is created; petty cash adds the petty cash role.
update public.profiles p
set full_name = v.full_name, pcf_role = v.pcf_role::public.pcf_role, is_active = true
from (values
  ('00000000-0000-4000-8000-000000000001'::uuid, 'PCF Admin', 'admin'),
  ('00000000-0000-4000-8000-000000000002'::uuid, 'PCF Custodian', 'custodian'),
  ('00000000-0000-4000-8000-000000000003'::uuid, 'PCF Approver', 'approver'),
  ('00000000-0000-4000-8000-000000000004'::uuid, 'PCF Accountant', 'accounting')
) as v(id, full_name, pcf_role)
where p.id = v.id;

insert into public.funds (name, amount, per_txn_limit, low_balance_pct)
select 'Main Petty Cash', 10000.00, 1000.00, 25
where not exists (select 1 from public.funds where name = 'Main Petty Cash');

insert into public.fund_custodians (fund_id, custodian_id)
select id, '00000000-0000-4000-8000-000000000002' from public.funds where name = 'Main Petty Cash'
on conflict do nothing;

insert into public.categories (name)
values
  ('Office Supplies'),
  ('Transportation'),
  ('Meals'),
  ('Courier and Delivery'),
  ('Utilities'),
  ('Repairs and Maintenance'),
  ('Miscellaneous')
on conflict (name) do nothing;
