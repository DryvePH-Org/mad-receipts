-- Saved copies of the Docs Bible (one CSV a day, in the layout of the old Google Sheet). Private: only the server reads or writes it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('docs-backups', 'docs-backups', false, 20971520, array['text/csv'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
