-- One row per file of a car's folder. The page looks at the Drive folder every minute and a photo is also recorded when it is uploaded:
-- if both happen together a photo must never be listed twice. Duplicates already there are removed first (the earliest row is kept).
delete from public.folder_files a
  using public.folder_files b
  where a.plate_no = b.plate_no and a.drive_file_id = b.drive_file_id
    and (a.created_at > b.created_at or (a.created_at = b.created_at and a.id > b.id));
create unique index if not exists folder_files_plate_drive_uidx on public.folder_files (plate_no, drive_file_id);
