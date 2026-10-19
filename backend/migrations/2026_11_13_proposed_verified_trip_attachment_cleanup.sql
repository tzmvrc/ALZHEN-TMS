
-- PROPOSAL ONLY. Requires separate explicit approval; never run during tests on Supabase.
-- No backfill, operational DML, browser grants, RLS, bucket or publication changes.
-- Reuses the installed transaction journal and whole-trip RPC; no force-delete switch.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF md5(replace(pg_get_functiondef('public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure),chr(13),'')) <> '91fd1eaf57d95d3f646b58d5d2d4bdd6'
 OR md5(replace(pg_get_functiondef('public.delete_whole_trips_v1(uuid[],uuid)'::regprocedure),chr(13),'')) <> '415806981c4151a4f5a6f657cdb3dca0'
 OR md5(replace(pg_get_functiondef('public.preview_whole_trip_deletion_v1(uuid[],uuid)'::regprocedure),chr(13),'')) <> 'f5ce5005b616f789a5026610d1531fe5' THEN
  RAISE EXCEPTION 'Deletion definitions differ from the reviewed live catalog. Stop and review.';
 END IF;
END $$;

-- A filename/path is never ownership evidence by itself. Require a single exact
-- receipt, its stop/POD, authenticated uploader/driver and assignment, and the
-- private Storage object's identity/metadata. URL-only history remains blocked.
CREATE FUNCTION public.inspect_legacy_pod_ownership_v1(p_trip_ids uuid[])
RETURNS TABLE(update_id uuid,trip_id uuid,image_id uuid,trip_stop_id uuid,storage_object_id uuid,storage_path text,status text,reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $inspect$
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
 WHERE d.trip_id=ANY(p_trip_ids) AND (nullif(btrim(d.pod_image_path),'') IS NOT NULL OR nullif(btrim(d.pod_image_url),'') IS NOT NULL)
$inspect$;
REVOKE ALL ON FUNCTION public.inspect_legacy_pod_ownership_v1(uuid[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.delete_transaction_with_cleanup_v1(p_trip_id uuid, p_stop_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_job public.transaction_deletion_jobs%ROWTYPE;
  v_trip jsonb; v_stop jsonb; v_last boolean; v_invalid boolean; v_table text;
  v_rows jsonb; v_snapshot jsonb := '{}'; v_objects jsonb := '[]';
  v_offloads uuid[]; v_backloads uuid[]; v_unloading uuid[]; v_loading uuid[];
  v_flex_ids uuid[];
  v_receipt record; v_image record; v_type text; v_id uuid; v_prefix text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor_id AND role IN ('ADMIN','STAFF')) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Only ADMIN or STAFF may delete transactions.';
  END IF;
  -- A short, bounded lock serializes ownership checks with report/item/flex
  -- writers (some logical flex references have no FK). No partial DB deletion.
  PERFORM set_config('lock_timeout','3s',true);
  LOCK TABLE public.trips,public.trip_stops,public.trip_line_items,
    public.trip_truck_assignments,public.trip_events,public.store_calls,
    public.documents,public.incidents,public.demurrages,public.billings,
    public.payables,public.receivables,public.pod_records,public.pod_drive_files,
    public.trip_images,public.offloads,public.offload_items,public.backloads,
    public.backload_items,public.loading_reports,public.unloading_reports,
    public.report_receipts,public.operations_report_conversions,
    public.flex_rows,public.flex_cells,public.driver_trip_updates IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_job FROM public.transaction_deletion_jobs WHERE transaction_id=coalesce(p_stop_id,p_trip_id);
  IF FOUND THEN
    IF v_job.trip_id<>p_trip_id OR v_job.trip_stop_id IS DISTINCT FROM p_stop_id THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Deletion identity does not match the original transaction.';
    END IF;
    RETURN to_jsonb(v_job);
  END IF;
  SELECT to_jsonb(t) INTO v_trip FROM public.trips t WHERE id=p_trip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Trip not found.'; END IF;
  IF p_stop_id IS NOT NULL THEN
    SELECT to_jsonb(s) INTO v_stop FROM public.trip_stops s WHERE id=p_stop_id AND trip_id=p_trip_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Transaction does not belong to this trip.'; END IF;
  ELSIF EXISTS(SELECT 1 FROM public.trip_stops WHERE trip_id=p_trip_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Select the exact delivery transaction; this trip has stops.';
  END IF;
  v_last := NOT EXISTS(SELECT 1 FROM public.trip_stops WHERE trip_id=p_trip_id AND id IS DISTINCT FROM p_stop_id);
  -- Trip-level legacy updates have no stop identity. Only resolve them when
  -- the parent itself is being removed, under the same transaction and locks.
  IF v_last AND EXISTS(SELECT FROM public.inspect_legacy_pod_ownership_v1(ARRAY[p_trip_id]) WHERE status='BLOCKED') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Legacy POD ownership/retention is unresolved; inspect the attachment review. Nothing was deleted.';
  END IF;
  IF EXISTS(SELECT FROM public.report_receipts WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id) AND upload_status='PENDING') THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='An image upload is incomplete; nothing was deleted.';
  END IF;
  IF NOT v_last AND EXISTS(SELECT FROM public.trip_images i JOIN public.driver_trip_updates d ON d.pod_image_path=i.storage_path WHERE i.trip_stop_id=p_stop_id AND d.trip_id=p_trip_id) THEN
   RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='This stop has retained driver POD history; use the reviewed whole-trip workflow or retain the stop.';
  END IF;
  IF v_last AND EXISTS(SELECT FROM storage.objects o CROSS JOIN unnest(ARRAY[p_trip_id]) selected_trip
 WHERE ((o.bucket_id='trip-images' AND left(o.name,length('trips/'||selected_trip||'/'))='trips/'||selected_trip||'/' AND NOT EXISTS(SELECT FROM public.trip_images i WHERE i.trip_id=selected_trip AND i.storage_path=o.name))
 OR (o.bucket_id='report-receipts' AND left(o.name,length('operations/'||selected_trip||'/'))='operations/'||selected_trip||'/' AND NOT EXISTS(SELECT FROM public.report_receipts r WHERE r.trip_id=selected_trip AND r.storage_path=o.name)))
 AND NOT EXISTS(SELECT FROM public.transaction_deletion_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.storage_objects) manifest WHERE j.trip_id=selected_trip AND manifest->>'bucket'=o.bucket_id AND manifest->>'path'=o.name AND manifest->>'object_id'=o.id::text AND manifest->>'metadata_fingerprint'=md5(coalesce(o.metadata::text,'')) AND manifest->>'object_version' IS NOT DISTINCT FROM to_jsonb(o)->>'version')) THEN RAISE EXCEPTION 'Unregistered Storage objects require ownership review; nothing was deleted.' USING ERRCODE='55000'; END IF;
  FOREACH v_table IN ARRAY ARRAY['trip_line_items','trip_events','store_calls','documents','incidents','demurrages','pod_records','pod_drive_files','offloads','backloads','unloading_reports','report_receipts'] LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I t WHERE (t.trip_stop_id=$2 AND t.trip_id IS DISTINCT FROM $1) OR (t.trip_id=$1 AND t.trip_stop_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.trip_stops s WHERE s.id=t.trip_stop_id AND s.trip_id=$1)))',v_table) INTO v_invalid USING p_trip_id,p_stop_id;
    IF v_invalid THEN RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='A child record has inconsistent trip/stop ownership; review it before deletion.'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.operations_report_conversions WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id OR trip_stop_id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Conversion history protects this transaction or its shared trip reports.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.billings WHERE trip_id=p_trip_id)
    OR EXISTS(SELECT 1 FROM public.payables WHERE trip_id=p_trip_id)
    OR EXISTS(SELECT 1 FROM public.receivables WHERE trip_id=p_trip_id) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Trip has billing, payable or receivable records; financial ownership must be reviewed before deletion.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.documents WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id) AND nullif(btrim(file_path),'') IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.pod_drive_files WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id OR pod_record_id IN (SELECT id FROM public.pod_records WHERE trip_id=p_trip_id AND trip_stop_id=p_stop_id))) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Document or Drive attachments require an ownership/retention review; nothing was deleted.';
  END IF;
  SELECT coalesce(array_agg(id),'{}') INTO v_offloads FROM public.offloads WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id);
  SELECT coalesce(array_agg(id),'{}') INTO v_backloads FROM public.backloads WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id);
  SELECT coalesce(array_agg(id),'{}') INTO v_unloading FROM public.unloading_reports WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id);
  SELECT coalesce(array_agg(id),'{}') INTO v_loading FROM public.loading_reports WHERE trip_id=p_trip_id AND v_last;
  -- A retained report's source items must never be removed by a stop cascade.
  IF EXISTS(SELECT 1 FROM public.offload_items WHERE trip_line_item_id IN (SELECT id FROM public.trip_line_items WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id)) AND NOT(offload_id=ANY(v_offloads)))
    OR EXISTS(SELECT 1 FROM public.backload_items WHERE trip_line_item_id IN (SELECT id FROM public.trip_line_items WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id)) AND NOT(backload_id=ANY(v_backloads))) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='A retained report references this transaction line item.';
  END IF;
  FOR v_receipt IN SELECT * FROM public.report_receipts WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id) LOOP
    IF v_receipt.offload_id=ANY(v_offloads) THEN v_type:='offload'; v_id:=v_receipt.offload_id;
    ELSIF v_receipt.backload_id=ANY(v_backloads) THEN v_type:='backload'; v_id:=v_receipt.backload_id;
    ELSIF v_receipt.unloading_report_id=ANY(v_unloading) THEN v_type:='unloading'; v_id:=v_receipt.unloading_report_id;
    ELSIF v_receipt.loading_report_id=ANY(v_loading) THEN v_type:='loading'; v_id:=v_receipt.loading_report_id;
    ELSE RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='A receipt belongs to a retained/shared report.';
    END IF;
    v_prefix:='operations/'||p_trip_id||'/'||v_type||'/'||v_id||'/';
    IF v_receipt.storage_path IS NULL OR left(v_receipt.storage_path,length(v_prefix))<>v_prefix OR substring(v_receipt.storage_path from length(v_prefix)+1) !~ '^[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$' THEN
      RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Receipt storage ownership requires review.';
    END IF;
    v_objects:=v_objects||jsonb_build_array(jsonb_build_object('bucket','report-receipts','path',v_receipt.storage_path));
  END LOOP;
  IF v_last THEN
    FOR v_image IN SELECT * FROM public.trip_images WHERE trip_id=p_trip_id LOOP
      v_prefix:='trips/'||p_trip_id||'/';
      IF v_image.storage_path IS NULL OR left(v_image.storage_path,length(v_prefix))<>v_prefix OR substring(v_image.storage_path from length(v_prefix)+1) !~ '^[a-f0-9-]{36}\.(jpg|jpeg|png|webp)$' THEN
        RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Trip image ownership requires review.';
      END IF;
      v_objects:=v_objects||jsonb_build_array(jsonb_build_object('bucket','trip-images','path',v_image.storage_path));
    END LOOP;
  END IF;
  IF EXISTS(SELECT 1 FROM public.documents d CROSS JOIN jsonb_array_elements(v_objects) o WHERE position(o->>'path' in coalesce(d.file_path,''))>0) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='An image is referenced by a retained document.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.trip_images i CROSS JOIN jsonb_array_elements(v_objects) o WHERE i.storage_path=o->>'path' AND (i.trip_id<>p_trip_id OR NOT v_last))
    OR EXISTS(SELECT 1 FROM public.report_receipts r CROSS JOIN jsonb_array_elements(v_objects) o WHERE r.storage_path=o->>'path' AND NOT(r.trip_id=p_trip_id AND (v_last OR r.trip_stop_id=p_stop_id))) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='An image is also referenced by retained business data.';
  END IF;
  -- Protect exact objects also referenced by legacy driver history, including
  -- another trip. Never guess that a legacy URL/path is exclusively owned.
  IF EXISTS(SELECT FROM public.driver_trip_updates d CROSS JOIN jsonb_array_elements(v_objects) o
    WHERE (position(o->>'path' in coalesce(d.pod_image_path,''))>0
       OR position(o->>'path' in coalesce(d.pod_image_url,''))>0)
     AND NOT(v_last AND d.trip_id=p_trip_id AND EXISTS(SELECT FROM public.inspect_legacy_pod_ownership_v1(ARRAY[p_trip_id]) verified WHERE verified.update_id=d.id AND verified.status='VERIFIED'))) THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='An image is referenced by retained driver history; ownership review is required.';
  END IF;
  -- Capture immutable Storage object IDs, not just names, before removing relations.
  SELECT coalesce(jsonb_agg(DISTINCT object || jsonb_build_object('object_id',s.id,'metadata_fingerprint',md5(coalesce(s.metadata::text,'')),'object_version',to_jsonb(s)->>'version')),'[]') INTO v_objects
   FROM jsonb_array_elements(v_objects) object LEFT JOIN storage.objects s ON s.bucket_id=object->>'bucket' AND s.name=object->>'path';
  IF EXISTS(SELECT FROM jsonb_array_elements(v_objects) object WHERE object->>'object_id' IS NULL) THEN
   RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='Storage object identity cannot be verified; nothing was deleted.';
  END IF;
  v_snapshot:=jsonb_build_object('trip',v_trip,'stop',v_stop,'parent_deleted',v_last,'actor_profile_id',p_actor_id,'legacy_pod_ownership',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.inspect_legacy_pod_ownership_v1(ARRAY[p_trip_id]) r));
  -- Fixed allowlist only, never a client-supplied relation or predicate.
  FOREACH v_table IN ARRAY ARRAY['trip_line_items','trip_events','store_calls','documents','incidents','demurrages','pod_records','offloads','backloads','unloading_reports','report_receipts'] LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) FROM public.%I t WHERE trip_id=$1 AND ($3 OR trip_stop_id=$2)',v_table) INTO v_rows USING p_trip_id,p_stop_id,v_last;
    v_snapshot:=v_snapshot||jsonb_build_object(v_table,v_rows);
  END LOOP;
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO v_rows FROM public.offload_items t WHERE offload_id=ANY(v_offloads);
  v_snapshot:=v_snapshot||jsonb_build_object('offload_items',v_rows);
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO v_rows FROM public.backload_items t WHERE backload_id=ANY(v_backloads);
  v_snapshot:=v_snapshot||jsonb_build_object('backload_items',v_rows);
  SELECT coalesce(array_agg(id),'{}') INTO v_flex_ids FROM public.flex_rows WHERE row_kind='SOURCE' AND (
    (source_entity_type='STOP' AND source_entity_id=p_stop_id)
    OR (source_entity_type='TRIP' AND source_entity_id=p_trip_id AND v_last)
    OR (source_entity_type='LINE_ITEM' AND source_entity_id IN (SELECT id FROM public.trip_line_items WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id)))
    OR (source_entity_type='STORE_CALL' AND source_entity_id IN (SELECT id FROM public.store_calls WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id)))
    OR (source_entity_type='ASSIGNMENT' AND v_last AND source_entity_id IN (SELECT id FROM public.trip_truck_assignments WHERE trip_id=p_trip_id))
  );
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO v_rows FROM public.flex_rows t WHERE id=ANY(v_flex_ids);
  v_snapshot:=v_snapshot||jsonb_build_object('flex_rows',v_rows);
  SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') INTO v_rows FROM public.flex_cells c WHERE row_id=ANY(v_flex_ids);
  v_snapshot:=v_snapshot||jsonb_build_object('flex_cells',v_rows);
  IF v_last THEN
    SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO v_rows FROM public.trip_truck_assignments t WHERE trip_id=p_trip_id;
    v_snapshot:=v_snapshot||jsonb_build_object('assignments',v_rows);
    SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO v_rows FROM public.trip_images t WHERE trip_id=p_trip_id;
    v_snapshot:=v_snapshot||jsonb_build_object('trip_images',v_rows);
    SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO v_rows FROM public.loading_reports t WHERE trip_id=p_trip_id;
    v_snapshot:=v_snapshot||jsonb_build_object('loading_reports',v_rows);
  END IF;
  IF v_last THEN
    SELECT coalesce(jsonb_agg(id ORDER BY id),'[]'::jsonb) INTO v_rows FROM public.driver_trip_updates WHERE trip_id=p_trip_id;
    v_snapshot:=v_snapshot||jsonb_build_object('driver_update_cleanup',jsonb_build_object('ids',v_rows,'count',jsonb_array_length(v_rows)));
  END IF;
  INSERT INTO public.transaction_deletion_jobs(transaction_id,trip_id,trip_stop_id,requested_by,state,storage_objects,snapshot,completed_at)
    VALUES(coalesce(p_stop_id,p_trip_id),p_trip_id,p_stop_id,p_actor_id,CASE WHEN jsonb_array_length(v_objects)=0 THEN 'COMPLETE' ELSE 'PENDING_STORAGE' END,v_objects,v_snapshot,CASE WHEN jsonb_array_length(v_objects)=0 THEN now() END) RETURNING * INTO v_job;
  DELETE FROM public.report_receipts WHERE trip_id=p_trip_id AND (v_last OR trip_stop_id=p_stop_id);
  DELETE FROM public.offloads WHERE id=ANY(v_offloads);
  DELETE FROM public.backloads WHERE id=ANY(v_backloads);
  DELETE FROM public.unloading_reports WHERE id=ANY(v_unloading);
  DELETE FROM public.loading_reports WHERE id=ANY(v_loading);
  DELETE FROM public.flex_rows WHERE id=ANY(v_flex_ids);
  FOREACH v_table IN ARRAY ARRAY['incidents','demurrages','pod_records','documents','store_calls','trip_events','trip_line_items'] LOOP
    EXECUTE format('DELETE FROM public.%I WHERE trip_id=$1 AND ($3 OR trip_stop_id=$2)',v_table) USING p_trip_id,p_stop_id,v_last;
  END LOOP;
  DELETE FROM public.trip_stops WHERE id=p_stop_id AND trip_id=p_trip_id;
  IF v_last THEN
    -- Explicit eligible cleanup, not FK CASCADE. Any later failure restores
    -- updates, stops, reports and the private audit/Storage journal together.
    DELETE FROM public.driver_trip_updates WHERE trip_id=p_trip_id;
    DELETE FROM public.trips WHERE id=p_trip_id;
  END IF;
  RETURN to_jsonb(v_job);
END;
$function$;

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
END $preview$;
REVOKE ALL ON FUNCTION public.preview_whole_trip_deletion_v1(uuid[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_whole_trip_deletion_v1(uuid[],uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.delete_whole_trips_v1(p_trip_ids uuid[],p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.delete_whole_trips_v1(uuid[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_whole_trips_v1(uuid[],uuid) TO service_role;

-- Called only by the protected cleanup service AFTER relational commit. No mutation.
CREATE FUNCTION public.validate_transaction_cleanup_objects_v1(p_operation_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $cleanup$
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
END $cleanup$;
REVOKE ALL ON FUNCTION public.validate_transaction_cleanup_objects_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_transaction_cleanup_objects_v1(uuid,uuid) TO service_role;

-- Tombstones prevent normal business writes from reattaching an object queued for
-- deletion. Retained COMPLETE journals also prevent path reuse after cleanup.
CREATE FUNCTION public.guard_deleted_trip_attachment_reference_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $guard$
DECLARE record jsonb:=to_jsonb(NEW); object jsonb;
BEGIN
 FOR object IN SELECT value FROM public.transaction_deletion_jobs j CROSS JOIN LATERAL jsonb_array_elements(j.storage_objects) WHERE jsonb_array_length(j.storage_objects)>0 LOOP
  IF nullif(btrim(record->>'pod_image_url'),'') IS NOT NULL
   OR position('%' in coalesce(record->>'file_path',''))>0
   OR position('%' in coalesce(record->>'drive_link',''))>0
   OR record->>'storage_path'=object->>'path'
   OR position(object->>'path' in coalesce(record->>'pod_image_path',''))>0
   OR position(object->>'path' in coalesce(record->>'pod_image_url',''))>0
   OR position(object->>'path' in coalesce(record->>'file_path',''))>0
   OR position(object->>'path' in coalesce(record->>'drive_link',''))>0 THEN
   RAISE EXCEPTION 'Attachment belongs to a committed deletion journal and cannot be reused.' USING ERRCODE='55000';
  END IF;
 END LOOP;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION public.guard_deleted_trip_attachment_reference_v1() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['trip_images','report_receipts','driver_trip_updates','documents','pod_drive_files'] LOOP
  EXECUTE format('CREATE TRIGGER deleted_trip_attachment_reference_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_deleted_trip_attachment_reference_v1()',relation);
 END LOOP;
END $$;
COMMIT;
-- Read-only verification: pg_get_functiondef/ACL for the five RPC/helpers, triggers,
-- and SELECT inspect_legacy_pod_ownership_v1(ARRAY[<approved trip UUID>]). No deletes.
-- Rollback (separate approval): disable deletion in runtime, restore the three
-- catalog-captured original RPCs, drop only the five new triggers and the new
-- inspect_legacy_pod_ownership_v1, validate_transaction_cleanup_objects_v1 and
-- guard_deleted_trip_attachment_reference_v1 functions. Preserve all journal rows and Storage objects. Never
-- roll back a journal to resurrect relational data after physical Storage deletion.
-- Installation performs no data repair; ambiguous ownership continues to block.
