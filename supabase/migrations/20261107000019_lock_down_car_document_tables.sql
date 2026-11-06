-- Car documents (unit_folders, folder_files): take away the table permissions nobody needs.
--
-- Row-level security was already on and only signed-in people may READ (policies "read unit folders" and
-- "read folder files"), so nothing could be seen or changed by a stranger. But the tables still carried the broad
-- default permissions Supabase gives every new table (the other tables had them removed in migration 15).
-- This removes them so a second layer protects the data: signed-in users may only read, the signed-out role may do
-- nothing, and writing is done by the server with its own key, exactly as the app already does.
revoke all on public.unit_folders, public.folder_files from anon, authenticated;
grant select on public.unit_folders, public.folder_files to authenticated;
