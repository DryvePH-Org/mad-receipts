-- The documents flow now also updates the MAD Pricelist (INVENTORY 2026): its sync record is a fourth kind.
alter table public.unit_sheet_sync drop constraint if exists unit_sheet_sync_kind_check;
alter table public.unit_sheet_sync add constraint unit_sheet_sync_kind_check check (kind in ('checklist', 'submitted', 'received', 'pricelist'));
