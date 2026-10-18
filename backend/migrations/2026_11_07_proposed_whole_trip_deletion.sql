-- PROPOSAL ONLY. Reapproval of this revised file is required.
-- No operational deletion during installation. No RLS/publication/browser grants.
BEGIN;
SET LOCAL lock_timeout='3s';
-- Separate driver-update parent-FK proposal must be approved/applied first.
DO $$ BEGIN
 IF md5(replace(pg_get_functiondef('public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure),chr(13),''))<>'91fd1eaf57d95d3f646b58d5d2d4bdd6' THEN
  RAISE EXCEPTION 'Compatible last-stop cleanup RPC is missing; install the separately approved driver-parent proposal first.';
 END IF;
 IF NOT EXISTS(SELECT FROM pg_constraint WHERE conrelid='public.driver_trip_updates'::regclass
   AND conname='whole_trip_driver_update_parent_fk' AND contype='f' AND confrelid='public.trips'::regclass AND confdeltype='r'
   AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.driver_trip_updates'::regclass AND attname='trip_id')]::smallint[]
   AND confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.trips'::regclass AND attname='id')]::smallint[]) THEN
  RAISE EXCEPTION 'Driver update parent protection is missing; apply only its separately approved proposal first.';
 END IF;
END $$;
-- A narrow SECURITY DEFINER read avoids granting service_role direct SELECT
-- on private POD, Drive and backload-item tables. Only Admin through backend.
CREATE OR REPLACE FUNCTION public.preview_whole_trip_deletion_v1(p_trip_ids uuid[],p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $preview$
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
 IF EXISTS(SELECT FROM public.driver_trip_updates WHERE trip_id=ANY(p_trip_ids) AND (nullif(btrim(pod_image_path),'') IS NOT NULL OR nullif(btrim(pod_image_url),'') IS NOT NULL)) THEN
  blockers:=blockers||jsonb_build_array('Legacy driver POD attachments require ownership/retention review.'); END IF;
 -- Exact Storage paths and all ownership/retention guards are rechecked under
 -- locks during deletion. Preview never authorizes deletion on its own.
 RETURN jsonb_build_object('trips',trips_json,'counts',counts,'blockers',blockers);
END $preview$;
REVOKE ALL ON FUNCTION public.preview_whole_trip_deletion_v1(uuid[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_whole_trip_deletion_v1(uuid[],uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_whole_trips_v1(p_trip_ids uuid[],p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE trip uuid; stop uuid; had_stops boolean; jobs jsonb; audit jsonb; job jsonb;
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
 IF EXISTS(SELECT FROM public.driver_trip_updates WHERE trip_id=ANY(p_trip_ids) AND (nullif(btrim(pod_image_path),'') IS NOT NULL OR nullif(btrim(pod_image_url),'') IS NOT NULL)) THEN
  RAISE EXCEPTION 'Legacy driver POD attachments require ownership/retention review; nothing was deleted.' USING ERRCODE='55000'; END IF;
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
  audit:=public.preview_whole_trip_deletion_v1(ARRAY[trip],p_actor_id);
  audit:=jsonb_build_object('actor_id',p_actor_id,'trip_ids',to_jsonb(p_trip_ids),
    'trip_id',trip,'dispatch_number',audit->'trips'->0->'dispatch_number',
    'affected_counts',audit->'counts','deleted_at',transaction_timestamp(),'result','DATABASE_COMMITTED');
  -- The shared transaction RPC resolves eligible driver updates on the last
  -- stop and records their IDs in its private cleanup journal.
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
END $$;
REVOKE ALL ON FUNCTION public.delete_whole_trips_v1(uuid[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_whole_trips_v1(uuid[],uuid) TO service_role;
COMMIT;
-- Recovery: WHOLE_TRIP_DELETE_ENABLED=false and backend restart. Do not remove
-- existing cleanup jobs/private recovery snapshots. Schema rollback needs separate
-- approval: drop the two NEW functions (no CASCADE).
-- Compatible transaction RPC from the driver-parent proposal is required;
-- its existing ACL/search_path and stop-level ADMIN/STAFF behavior are preserved.
-- DB errors roll back all trips/jobs. Storage cleanup starts only AFTER commit;
-- SQL rollback cannot recover already deleted files. Retain backups accordingly.
