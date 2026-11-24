-- 24 Nov 2026, FILE 10: run this BEFORE pushing the new-owner papers code. It only lets the archive hold a second kind of paper (the papers handed to the buyer); nothing else changes.

begin;

-- The papers handed to the new owner when a transfer is done (OR, CR, PNP clearance, macro-etching) are kept as digital copies in the car's Drive folder,
-- in the same archive as the payment papers (folder_files.archive), told apart by the kind: 'transfer'. They are never on the IN checklist and the scanner
-- does not read them. This only widens what the archive column accepts. Run it BEFORE pushing the code that uploads them.

do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.folder_files'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%archive%' loop
    execute format('alter table public.folder_files drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.folder_files add constraint folder_files_archive_check check (archive is null or archive in ('payment', 'transfer'));

commit;
