CREATE OR REPLACE FUNCTION public.preview_whole_trip_deletion_v1(p_trip_ids uuid[], p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE trips_json jsonb; counts jsonb:='{}'; blockers jsonb:='[]'; relation text; n bigint; flex_ids uuid[];
BEGIN
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=p_actor_id AND role='ADMIN') THEN
  RAISE EXCEPTION 'Only ADMIN may preview whole-trip deletion.' USING ERRCODE='42501'; END IF;
 IF p_trip_ids IS NULL OR cardinality(p_trip_ids) NOT BETWEEN 1 AND 20 OR array_position(p_trip_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Select one to twenty physical trip IDs.' USING ERRCODE='22023'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',id,'dispatch_number',dispatch_number) ORDER BY id)
 INTO trips_json FROM public.trips WHERE id=ANY(p_trip_ids);
 IF coalesce(jsonb_array_length(trips_json),0)<>(SELECT count(DISTINCT id) FROM unnest(p_trip_ids) id) THEN
  RAISE EXCEPTION 'One or more selected trips no longer exists.' USING ERRCODE='P0002'; END IF;
 FOREACH relation IN ARRAY ARRAY['trip_stops','trip_line_items','trip_truck_assignments',
   'pod_records','trip_images','offloads','backloads','loading_reports','unloading_reports',
   'report_receipts','billings','payables','receivables','documents','pod_drive_files',
   'operations_report_conversions','incidents','store_calls','demurrages','trip_events','driver_trip_updates'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I WHERE trip_id=ANY($1)',relation) INTO n USING p_trip_ids;
  counts:=counts||jsonb_build_object(relation,n);
 END LOOP;
 SELECT count(*) INTO n FROM public.offload_items i JOIN public.offloads r ON r.id=i.offload_id WHERE r.trip_id=ANY(p_trip_ids);
 counts:=counts||jsonb_build_object('offload_items',n);
 SELECT count(*) INTO n FROM public.backload_items i JOIN public.backloads r ON r.id=i.backload_id WHERE r.trip_id=ANY(p_trip_ids);
 counts:=counts||jsonb_build_object('backload_items',n);
 SELECT count(*) INTO n FROM public.trip_tracking_locations l JOIN public.trip_truck_assignments a ON a.id=l.assignment_id WHERE a.trip_id=ANY(p_trip_ids);
 counts:=counts||jsonb_build_object('tracking_locations',n);
 SELECT count(*) INTO n FROM public.trip_route_cache c JOIN public.trip_truck_assignments a ON a.id=c.assignment_id WHERE a.trip_id=ANY(p_trip_ids);
 counts:=counts||jsonb_build_object('cached_routes',n);
 SELECT coalesce(array_agg(f.id),'{}') INTO flex_ids FROM public.flex_rows f WHERE row_kind='SOURCE' AND (
  (source_entity_type='TRIP' AND source_entity_id=ANY(p_trip_ids)) OR
  (source_entity_type='STOP' AND source_entity_id IN (SELECT id FROM public.trip_stops WHERE trip_id=ANY(p_trip_ids))) OR
  (source_entity_type='LINE_ITEM' AND source_entity_id IN (SELECT id FROM public.trip_line_items WHERE trip_id=ANY(p_trip_ids))) OR
  (source_entity_type='STORE_CALL' AND source_entity_id IN (SELECT id FROM public.store_calls WHERE trip_id=ANY(p_trip_ids))) OR
  (source_entity_type='ASSIGNMENT' AND source_entity_id IN (SELECT id FROM public.trip_truck_assignments WHERE trip_id=ANY(p_trip_ids))));
 counts:=counts||jsonb_build_object('source_flex_rows',cardinality(flex_ids));
 SELECT count(*) INTO n FROM public.flex_cells WHERE row_id=ANY(flex_ids);
 counts:=counts||jsonb_build_object('source_flex_cells',n);
 SELECT count(*) INTO n FROM public.pod_review_events WHERE trip_id=ANY(p_trip_ids);
 counts:=counts||jsonb_build_object('pod_review_events_retained',n);
 IF (counts->>'billings')::bigint+(counts->>'payables')::bigint+(counts->>'receivables')::bigint>0 THEN
  blockers:=blockers||jsonb_build_array('Billing, payable or receivable records require accounting retention review.'); END IF;
 IF (counts->>'operations_report_conversions')::bigint>0 THEN
  blockers:=blockers||jsonb_build_array('Protected report conversion history prevents deletion.'); END IF;
 IF EXISTS(SELECT FROM public.documents WHERE trip_id=ANY(p_trip_ids) AND nullif(btrim(file_path),'') IS NOT NULL)
    OR (counts->>'pod_drive_files')::bigint>0 THEN
  blockers:=blockers||jsonb_build_array('Document or Drive attachments require an ownership/retention review.'); END IF;
 IF EXISTS(SELECT FROM public.inspect_legacy_pod_ownership_v1(p_trip_ids) WHERE status='BLOCKED') THEN
  blockers:=blockers||jsonb_build_array('Legacy POD ownership or retention is unresolved. Review the exact attachment findings below.'); END IF;
 IF EXISTS(SELECT FROM public.report_receipts WHERE trip_id=ANY(p_trip_ids) AND upload_status='PENDING') THEN
  blockers:=blockers||jsonb_build_array('An image upload is incomplete. Recover the original upload before deleting this trip.'); END IF;
 counts:=counts||jsonb_build_object('legacy_pod_references',(SELECT count(DISTINCT update_id) FROM public.inspect_legacy_pod_ownership_v1(p_trip_ids)),
  'storage_objects',(SELECT count(*) FROM (SELECT 'trip-images' AS bucket,storage_path FROM public.trip_images WHERE trip_id=ANY(p_trip_ids) UNION SELECT 'report-receipts',storage_path FROM public.report_receipts WHERE trip_id=ANY(p_trip_ids)) objects),
  'pending_uploads',(SELECT count(*) FROM public.report_receipts WHERE trip_id=ANY(p_trip_ids) AND upload_status='PENDING'));
 IF EXISTS(SELECT FROM storage.objects o CROSS JOIN unnest(p_trip_ids) selected_trip
 WHERE ((o.bucket_id='trip-images' AND left(o.name,length('trips/'||selected_trip||'/'))='trips/'||selected_trip||'/' AND NOT EXISTS(SELECT FROM public.trip_images i WHERE i.trip_id=selected_trip AND i.storage_path=o.name))
 OR (o.bucket_id='report-receipts' AND left(o.name,length('operations/'||selected_trip||'/'))='operations/'||selected_trip||'/' AND NOT EXISTS(SELECT FROM public.report_receipts r WHERE r.trip_id=selected_trip AND r.storage_path=o.name)))
 AND NOT EXISTS(SELECT FROM public.transaction_deletion_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.storage_objects) manifest WHERE j.trip_id=selected_trip AND manifest->>'bucket'=o.bucket_id AND manifest->>'path'=o.name AND manifest->>'object_id'=o.id::text AND manifest->>'metadata_fingerprint'=md5(coalesce(o.metadata::text,'')) AND manifest->>'object_version' IS NOT DISTINCT FROM to_jsonb(o)->>'version')) THEN blockers:=blockers||jsonb_build_array('Unregistered Storage objects in a selected trip namespace require ownership review.'); END IF;
 IF EXISTS(SELECT FROM public.trip_images i WHERE i.trip_id=ANY(p_trip_ids) AND NOT EXISTS(SELECT FROM storage.objects o WHERE o.bucket_id='trip-images' AND o.name=i.storage_path)) THEN blockers:=blockers||jsonb_build_array('A receipt upload is incomplete or its private object is missing.'); END IF;
 -- Exact Storage paths and all ownership/retention guards are rechecked under
 -- locks during deletion. Preview never authorizes deletion on its own.
 RETURN jsonb_build_object('trips',trips_json,'counts',counts,'blockers',blockers,'attachment_review',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.inspect_legacy_pod_ownership_v1(p_trip_ids) r));
END $function$
