-- Catalog-inspected current validator; disposable fixture only.
CREATE OR REPLACE FUNCTION public.validate_transaction_cleanup_objects_v1(p_operation_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE job public.transaction_deletion_jobs; object jsonb; stored storage.objects; safe jsonb:='[]';
BEGIN
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=p_actor_id AND role IN ('ADMIN','STAFF')) THEN
  RAISE EXCEPTION 'Management authorization required.' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT job FROM public.transaction_deletion_jobs WHERE id=p_operation_id;
 FOR object IN SELECT * FROM jsonb_array_elements(job.storage_objects) LOOP
  IF object->>'bucket' NOT IN ('trip-images','report-receipts') OR object->>'bucket' IS NULL
   OR object->>'path' IS NULL OR object->>'object_id' IS NULL OR object->>'metadata_fingerprint' IS NULL THEN
   RAISE EXCEPTION 'Cleanup manifest requires object identity/ownership review.' USING ERRCODE='55000'; END IF;
  IF EXISTS(SELECT FROM public.trip_images WHERE storage_path=object->>'path')
   OR EXISTS(SELECT FROM public.report_receipts WHERE storage_path=object->>'path')
   OR EXISTS(SELECT FROM public.driver_trip_updates WHERE position(object->>'path' in coalesce(pod_image_path,''))>0 OR position(object->>'path' in coalesce(pod_image_url,''))>0)
   OR EXISTS(SELECT FROM public.driver_trip_updates WHERE nullif(btrim(pod_image_url),'') IS NOT NULL)
   OR EXISTS(SELECT FROM public.documents WHERE position('%' in coalesce(file_path,''))>0)
   OR EXISTS(SELECT FROM public.pod_drive_files WHERE position('%' in coalesce(drive_link,''))>0)
   OR EXISTS(SELECT FROM public.documents WHERE position(object->>'path' in coalesce(file_path,''))>0)
   OR EXISTS(SELECT FROM public.pod_drive_files WHERE position(object->>'path' in coalesce(drive_link,''))>0) THEN
   RAISE EXCEPTION 'Cleanup object is referenced by retained data.' USING ERRCODE='55000'; END IF;
  SELECT * INTO stored FROM storage.objects WHERE bucket_id=object->>'bucket' AND name=object->>'path';
  IF FOUND THEN
   IF stored.id::text<>object->>'object_id' OR md5(coalesce(stored.metadata::text,'')) IS DISTINCT FROM object->>'metadata_fingerprint' OR (to_jsonb(stored)->>'version') IS DISTINCT FROM object->>'object_version' THEN
    RAISE EXCEPTION 'Storage object identity changed; cleanup is blocked.' USING ERRCODE='55000'; END IF;
   safe:=safe||jsonb_build_array(object);
  END IF; -- Already-removed objects make retries idempotent.
 END LOOP;
 RETURN safe;
END $function$

