-- A sixth role: Documentation. She edits every tab of a car (IN documents, OUT documents, Sale and transfer) and focuses on the transfer of the originals.
-- Buying keeps the IN documents only; Sales and Online Marketing add the OUT documents. Nobody changes role by this file: the Super Admin sets Documentation on the Users page.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('super_admin', 'admin', 'buying', 'marketing', 'sales', 'documentation'));
