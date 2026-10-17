-- PROPOSAL ONLY. Same private bucket and 5 MB cap; no object moves or deletion.
BEGIN;
SET LOCAL lock_timeout = '3s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='trip-images' AND public=false AND file_size_limit=5242880
  AND allowed_mime_types @> ARRAY['image/jpeg','image/png','image/webp']::text[]
  AND allowed_mime_types <@ ARRAY['image/jpeg','image/png','image/webp']::text[])
 THEN RAISE EXCEPTION 'Unexpected trip-images configuration. Reinspect before approval.'; END IF;
END $$;
ALTER TABLE public.trip_images
 ADD COLUMN mime_type text CHECK(mime_type IN ('image/jpeg','image/png','image/webp','application/pdf')),
 ADD COLUMN file_sha256 text CHECK(file_sha256 ~ '^[a-f0-9]{64}$');
CREATE UNIQUE INDEX trip_receipt_content_once_idx ON public.trip_images(trip_id,trip_stop_id,file_sha256)
 WHERE kind='receipt' AND file_sha256 IS NOT NULL;
UPDATE storage.buckets SET allowed_mime_types=ARRAY(SELECT DISTINCT mime FROM unnest(allowed_mime_types||ARRAY['application/pdf']::text[]) mime ORDER BY mime)
 WHERE id='trip-images';
COMMIT;
-- No policy/grant/publication changes. Backend upload still checks actor/stop,
-- size, MIME/signature and content hash. PDF renderer/OCR must be installed and
-- bounded before enabling intake; this SQL alone does not activate PDF support.
-- Recovery: disable PDF intake; remove application/pdf from bucket allowlist only
-- after dependency review. Keep existing PDF originals/metadata and signed access.
