-- PROPOSAL ONLY: approval required before live installation.
-- Fix only final-stop receipt relational delete ordering. No data backfill,
-- Storage deletion, ownership bypass, RLS/policy/publication or schema changes.
-- Installation replaces one RPC definition inside a transaction; no live DML runs.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $preflight$
BEGIN
 IF md5(replace((SELECT prosrc FROM pg_proc WHERE oid='public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)'::regprocedure),chr(13),'')) <> '3b7a9b77fe3cfdfd41e250f6c6a0ce72'
 OR md5(replace((SELECT prosrc FROM pg_proc WHERE oid='public.delete_whole_trips_v1(uuid[],uuid)'::regprocedure),chr(13),'')) <> '74396b2b4b01b1e08229fe38df4b0d11'
 OR md5(replace((SELECT prosrc FROM pg_proc WHERE oid='public.guard_deleted_trip_attachment_reference_v1()'::regprocedure),chr(13),'')) <> '45a0f8317873669590654e2e29f30c8e'
 THEN RAISE EXCEPTION 'Deletion definitions differ from reviewed Phase 2D.3. Stop and review.'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgname='deleted_trip_attachment_reference_guard' AND NOT tgisinternal AND tgenabled='O') <> 5
 THEN RAISE EXCEPTION 'Expected five active attachment guards. Stop and review.'; END IF;
END $preflight$;

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
  -- Immutable manifests and complete image snapshots were captured above under
  -- the same ownership/retention locks. Remove final-parent image relations now,
  -- before POD/stop ON DELETE SET NULL can trigger their journal reuse guard.
  -- Storage bytes remain untouched until the existing post-commit validator runs.
  -- Earlier stops keep their image relations exactly as before.
  IF v_last THEN DELETE FROM public.trip_images WHERE trip_id=p_trip_id; END IF;
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

-- CREATE OR REPLACE preserves ownership and privileges. Assert browser denial.
DO $permissions$
BEGIN
 IF has_function_privilege('anon','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.delete_transaction_with_cleanup_v1(uuid,uuid,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Unexpected RPC execution privileges. Installation rolled back.'; END IF;
END $permissions$;
COMMIT;
-- Verification: inspect RPC body/ACL and unchanged operational counts, read-only.
-- Rollback requires separate approval: suspend deletion and restore only the prior
-- transaction RPC definition captured from Phase 2D.3; preserve all cleanup journals
-- and Storage objects. Never replay the full old migration or resurrect deleted
-- data from a journal after physical Storage cleanup.
