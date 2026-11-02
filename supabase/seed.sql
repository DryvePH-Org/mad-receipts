-- LOCAL DEVELOPMENT ONLY (runs on `supabase start` / `supabase db reset`, never on the hosted project).
-- Test accounts, both with password: testpass123
--   admin@test.local  (admin)
--   staff@test.local  (staff)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('testpass123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', full_name),
  now(), now(), '', '', '', ''
from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'admin@test.local', 'Test Admin'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'staff@test.local', 'Test Staff')
) as t (id, email, full_name);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
from auth.users where email in ('admin@test.local', 'staff@test.local');

update public.profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000001';
