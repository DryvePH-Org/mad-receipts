-- The car's activity history reads the audit log by plate (the plate is kept inside the entry): an index keeps it quick as the log grows.
create index if not exists audit_logs_plate_idx on public.audit_logs ((after ->> 'plate'), created_at desc) where after ? 'plate';
