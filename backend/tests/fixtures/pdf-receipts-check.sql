-- After pdf-receipts-schema.sql and the exact approved PDF migration, locally only.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM storage.buckets WHERE id='trip-images' AND NOT public AND file_size_limit=5242880 AND allowed_mime_types @> ARRAY['application/pdf','image/jpeg','image/png','image/webp']) THEN RAISE EXCEPTION 'bucket contract'; END IF;
 IF EXISTS(SELECT FROM trip_images WHERE mime_type IS NOT NULL OR file_sha256 IS NOT NULL) THEN RAISE EXCEPTION 'historical metadata changed'; END IF;
 INSERT INTO trip_images VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','receipt','application/pdf',repeat('a',64));
 BEGIN
  INSERT INTO trip_images VALUES('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000020','receipt','application/pdf',repeat('a',64));
  RAISE EXCEPTION 'duplicate content accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 INSERT INTO trip_images VALUES('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000021','receipt','application/pdf',repeat('a',64));
 BEGIN
  UPDATE trip_images SET mime_type='text/html' WHERE id='00000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'unsupported MIME accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE trip_images SET file_sha256='invalid' WHERE id='00000000-0000-4000-8000-000000000001';
  RAISE EXCEPTION 'invalid hash accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT 'PDF metadata, duplicate content and sibling isolation assertions passed' AS result;
