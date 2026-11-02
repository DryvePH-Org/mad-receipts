-- Photos are compressed to JPEG in the browser before upload (long edge 1600 px),
-- so anything bigger or of another type is a mistake.
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg']
where id = 'receipt-photos';
