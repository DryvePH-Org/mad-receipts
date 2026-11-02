-- Private bucket for receipt photos.
-- Layout: drafts/{userId}/{uuid}.jpg, then receipts/{receipt_no}.jpg after confirm.
insert into storage.buckets (id, name, public)
values ('receipt-photos', 'receipt-photos', false);

-- Staff may upload only into their own drafts folder.
create policy "upload own draft photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipt-photos'
    and (storage.foldername(name))[1] = 'drafts'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Staff may read only their own draft photos.
create policy "read own draft photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipt-photos'
    and (storage.foldername(name))[1] = 'drafts'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Confirmed receipt photos are readable by any logged-in user (deals are shared).
create policy "read confirmed receipt photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipt-photos'
    and (storage.foldername(name))[1] = 'receipts'
  );

-- Admins may read everything in the bucket.
create policy "admin reads all photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'receipt-photos' and public.is_admin());
