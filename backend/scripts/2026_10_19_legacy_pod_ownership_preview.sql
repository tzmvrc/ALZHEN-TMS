-- Read-only preview. Not authorization to repair or delete any record.
WITH findings(update_id,trip_id,image_id,trip_stop_id,storage_object_id,storage_path,status,reason) AS (
 SELECT d.id,d.trip_id,i.id,i.trip_stop_id,o.id,d.pod_image_path,
 CASE WHEN issues.reason IS NULL THEN 'VERIFIED' ELSE 'BLOCKED' END,
 coalesce(issues.reason,'Exact receipt, stop, driver/uploader, assignment and private Storage metadata agree.')
 FROM public.driver_trip_updates d
 LEFT JOIN public.trip_images i ON i.storage_path=d.pod_image_path
 LEFT JOIN public.trip_stops s ON s.id=i.trip_stop_id
 LEFT JOIN public.pod_records p ON p.id=i.pod_record_id
 LEFT JOIN public.drivers dr ON dr.id=d.driver_id
 LEFT JOIN storage.objects o ON o.bucket_id='trip-images' AND o.name=i.storage_path
 LEFT JOIN storage.buckets b ON b.id=o.bucket_id
 CROSS JOIN LATERAL (SELECT CASE
  WHEN nullif(btrim(d.pod_image_url),'') IS NOT NULL THEN 'Legacy URL requires manual ownership review; it is not interpreted as a trusted Storage path.'
  WHEN nullif(btrim(d.pod_image_path),'') IS NULL THEN 'No canonical Storage path is recorded.'
  WHEN (SELECT count(*) FROM public.trip_images x WHERE x.storage_path=d.pod_image_path)<>1 THEN 'Receipt is missing or the path is shared by multiple receipt records.'
  WHEN i.trip_id IS DISTINCT FROM d.trip_id OR s.trip_id IS DISTINCT FROM d.trip_id THEN 'Receipt or stop does not belong to this parent trip.'
  WHEN i.kind IS DISTINCT FROM 'receipt' OR i.uploaded_by IS NULL OR i.uploaded_by IS DISTINCT FROM dr.profile_id THEN 'Authenticated receipt uploader and original driver do not match.'
  WHEN NOT EXISTS(SELECT FROM public.trip_truck_assignments a WHERE a.trip_id=d.trip_id AND a.driver_id=d.driver_id) THEN 'No matching driver/trip assignment establishes ownership.'
  WHEN i.pod_record_id IS NOT NULL AND (p.trip_id IS DISTINCT FROM i.trip_id OR p.trip_stop_id IS DISTINCT FROM i.trip_stop_id) THEN 'Linked POD belongs to another trip or stop.'
  WHEN o.id IS NULL OR b.public IS DISTINCT FROM false THEN 'Private Storage object is missing or bucket privacy cannot be verified.'
  WHEN o.owner_id IS NOT NULL AND o.owner_id IS DISTINCT FROM i.uploaded_by::text THEN 'Storage owner conflicts with the authenticated uploader.'
  WHEN o.metadata->>'mimetype' NOT IN ('image/jpeg','image/png','image/webp') OR o.metadata->>'mimetype' IS NULL THEN 'Storage MIME metadata is unsupported or missing; PDF retention needs separate review.'
  WHEN d.pod_image_path !~ ('^trips/'||d.trip_id||'/[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$') THEN 'Receipt path is outside the supported immutable upload namespace.'
  WHEN EXISTS(SELECT FROM public.driver_trip_updates x WHERE x.trip_id IS DISTINCT FROM d.trip_id AND nullif(btrim(x.pod_image_url),'') IS NOT NULL) THEN 'Unresolved URL-only driver history elsewhere requires shared-object review.'
  WHEN EXISTS(SELECT FROM public.driver_trip_updates x WHERE x.trip_id IS DISTINCT FROM d.trip_id AND (x.pod_image_path=d.pod_image_path OR position(d.pod_image_path in coalesce(x.pod_image_url,''))>0)) THEN 'Another trip driver history references this object.'
  WHEN EXISTS(SELECT FROM public.report_receipts x WHERE x.storage_path=d.pod_image_path)
    OR EXISTS(SELECT FROM public.documents x WHERE position(d.pod_image_path in coalesce(x.file_path,''))>0)
    OR EXISTS(SELECT FROM public.pod_drive_files x WHERE position(d.pod_image_path in coalesce(x.drive_link,''))>0) THEN 'Document, report or Drive reference requires retention review.'
 END AS reason) issues
 WHERE d.trip_id=ANY(ARRAY(SELECT id FROM public.trips)) AND (nullif(btrim(d.pod_image_path),'') IS NOT NULL OR nullif(btrim(d.pod_image_url),'') IS NOT NULL)
) SELECT * FROM findings ORDER BY trip_id,update_id;
