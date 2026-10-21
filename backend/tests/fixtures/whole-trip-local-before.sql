CREATE OR REPLACE FUNCTION public.delete_whole_trips_v1(p_trip_ids uuid[], p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE trip uuid; stop uuid; had_stops boolean; jobs jsonb; audit jsonb; job jsonb; legacy_evidence jsonb;
BEGIN
 IF NOT EXISTS(SELECT FROM public.profiles WHERE id=p_actor_id AND role='ADMIN') THEN
  RAISE EXCEPTION 'Only ADMIN may permanently delete whole trips.' USING ERRCODE='42501'; END IF;
 IF p_trip_ids IS NULL OR cardinality(p_trip_ids) NOT BETWEEN 1 AND 20 OR array_position(p_trip_ids,NULL) IS NOT NULL THEN
  RAISE EXCEPTION 'Select one to twenty physical trip IDs.' USING ERRCODE='22023'; END IF;
 -- Match the existing RPC's lock ordering. No independent stop delete requests:
 -- any error in any trip rolls back ALL calls and their audit/cleanup jobs.
 PERFORM set_config('lock_timeout','3s',true);
 LOCK TABLE public.trips,public.trip_stops,public.trip_line_items,
    public.trip_truck_assignments,public.trip_events,public.store_calls,
    public.documents,public.incidents,public.demurrages,public.billings,
    public.payables,public.receivables,public.pod_records,public.pod_drive_files,
    public.trip_images,public.offloads,public.offload_items,public.backloads,
    public.backload_items,public.loading_reports,public.unloading_reports,
    public.report_receipts,public.operations_report_conversions,
    public.flex_rows,public.flex_cells,public.driver_trip_updates IN SHARE ROW EXCLUSIVE MODE;
 IF EXISTS(SELECT FROM public.inspect_legacy_pod_ownership_v1(p_trip_ids) WHERE status='BLOCKED') THEN
  RAISE EXCEPTION 'Legacy POD ownership/retention is unresolved; inspect the attachment review. Nothing was deleted.' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT FROM storage.objects o CROSS JOIN unnest(p_trip_ids) selected_trip
 WHERE ((o.bucket_id='trip-images' AND left(o.name,length('trips/'||selected_trip||'/'))='trips/'||selected_trip||'/' AND NOT EXISTS(SELECT FROM public.trip_images i WHERE i.trip_id=selected_trip AND i.storage_path=o.name))
 OR (o.bucket_id='report-receipts' AND left(o.name,length('operations/'||selected_trip||'/'))='operations/'||selected_trip||'/' AND NOT EXISTS(SELECT FROM public.report_receipts r WHERE r.trip_id=selected_trip AND r.storage_path=o.name)))
 AND NOT EXISTS(SELECT FROM public.transaction_deletion_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.storage_objects) manifest WHERE j.trip_id=selected_trip AND manifest->>'bucket'=o.bucket_id AND manifest->>'path'=o.name AND manifest->>'object_id'=o.id::text AND manifest->>'metadata_fingerprint'=md5(coalesce(o.metadata::text,'')) AND manifest->>'object_version' IS NOT DISTINCT FROM to_jsonb(o)->>'version')) THEN RAISE EXCEPTION 'Unregistered Storage objects require ownership review; nothing was deleted.' USING ERRCODE='55000'; END IF;
 -- Independent legacy image/POD FKs do not enforce composite ownership.
 IF EXISTS(SELECT FROM public.trip_images i LEFT JOIN public.pod_records p ON p.id=i.pod_record_id
   LEFT JOIN public.trip_stops s ON s.id=i.trip_stop_id
   WHERE (i.trip_id=ANY(p_trip_ids) OR p.trip_id=ANY(p_trip_ids) OR s.trip_id=ANY(p_trip_ids))
     AND ((i.trip_stop_id IS NOT NULL AND s.trip_id IS DISTINCT FROM i.trip_id)
       OR (i.pod_record_id IS NOT NULL AND (p.trip_id IS DISTINCT FROM i.trip_id OR p.trip_stop_id IS DISTINCT FROM i.trip_stop_id)))) THEN
   RAISE EXCEPTION 'Image trip/stop/POD ownership is inconsistent; nothing was deleted.' USING ERRCODE='55000';
 END IF;
 FOR trip IN SELECT DISTINCT id FROM unnest(p_trip_ids) id ORDER BY id LOOP
  IF NOT EXISTS(SELECT FROM public.trips WHERE id=trip) THEN
   IF NOT EXISTS(SELECT FROM public.transaction_deletion_jobs WHERE trip_id=trip) THEN
    RAISE EXCEPTION 'Trip does not exist and no matching deletion operation is recorded.' USING ERRCODE='P0002';
   END IF;
   CONTINUE;
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO legacy_evidence FROM public.inspect_legacy_pod_ownership_v1(ARRAY[trip]) r;
  audit:=public.preview_whole_trip_deletion_v1(ARRAY[trip],p_actor_id);
  audit:=jsonb_build_object('actor_id',p_actor_id,'trip_ids',to_jsonb(p_trip_ids),
    'trip_id',trip,'dispatch_number',audit->'trips'->0->'dispatch_number',
    'affected_counts',audit->'counts','legacy_pod_ownership',legacy_evidence,'deleted_at',transaction_timestamp(),'result','DATABASE_COMMITTED');
  -- The shared transaction RPC resolves eligible driver updates on the last
  -- stop and records their IDs in its private cleanup journal.
  -- Ownership was checked with all original stops/PODs intact. Remove only the
  -- verified attachment-bearing history now; retain evidence in every trip journal.
  -- Later failure in any trip rolls these removals back with the entire batch.
  DELETE FROM public.driver_trip_updates WHERE trip_id=trip AND id IN (SELECT (r->>'update_id')::uuid FROM jsonb_array_elements(legacy_evidence) r);
  had_stops:=false;
  FOR stop IN SELECT id FROM public.trip_stops WHERE trip_id=trip ORDER BY id LOOP
   had_stops:=true;
   job:=public.delete_transaction_with_cleanup_v1(trip,stop,p_actor_id);
   UPDATE public.transaction_deletion_jobs SET snapshot=snapshot||jsonb_build_object('whole_trip_deletion',audit)
    WHERE id=(job->>'id')::uuid AND NOT(snapshot ? 'whole_trip_deletion');
  END LOOP;
  IF NOT had_stops THEN
   job:=public.delete_transaction_with_cleanup_v1(trip,NULL,p_actor_id);
   UPDATE public.transaction_deletion_jobs SET snapshot=snapshot||jsonb_build_object('whole_trip_deletion',audit)
    WHERE id=(job->>'id')::uuid AND NOT(snapshot ? 'whole_trip_deletion');
  END IF;
  IF EXISTS(SELECT FROM public.trips WHERE id=trip) THEN RAISE EXCEPTION 'Parent deletion was not confirmed.' USING ERRCODE='55000'; END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',j.id,'trip_id',j.trip_id,'trip_stop_id',j.trip_stop_id,'state',j.state) ORDER BY j.created_at,j.id),'[]') INTO jobs FROM public.transaction_deletion_jobs j WHERE j.trip_id=ANY(p_trip_ids);
 RETURN jobs;
END $function$

