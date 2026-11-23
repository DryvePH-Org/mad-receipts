-- Without digital receipts, payments are tracked by what is uploaded on the car's page: an archive of payment papers (kept in the car's Drive
-- folder, never read by the scanner) and one payment status on the car's sale record, set by hand.

alter table public.car_transfers add column if not exists payment_status text check (payment_status in ('unpaid', 'partial', 'paid', 'loan_released'));
alter table public.car_transfers add column if not exists payment_status_at timestamptz;

alter table public.folder_files add column if not exists archive text check (archive in ('payment'));
alter table public.folder_files add column if not exists archive_tag text;
alter table public.folder_files add column if not exists archive_amount numeric(14, 2);
alter table public.folder_files add column if not exists archive_on date;
alter table public.folder_files add column if not exists archive_note text;
create index if not exists folder_files_archive on public.folder_files (plate_no) where archive is not null;
