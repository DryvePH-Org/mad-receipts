-- A switched-off account stops working at once, without asking the sign-in server on every page.
-- The app now reads the signed session on its own server (it is checked against the project's public keys), which is faster but does not notice a ban until the session
-- is renewed (up to an hour). So the switch is also kept on the person's profile, which the app reads on every page anyway.
alter table public.profiles add column if not exists disabled boolean not null default false;

-- accounts that are switched off now are marked (the sign-in table is only there on the real database)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'banned_until') then
    update public.profiles p set disabled = true from auth.users u where u.id = p.id and u.banned_until is not null and u.banned_until > now();
  end if;
end $$;
