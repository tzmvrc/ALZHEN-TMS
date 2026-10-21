-- Authorized by the current architecture task; validate against the live schema before installation.
-- Deletes only a store call or a dependency-free stop when an Admin/Staff later
-- confirms through the app. Installation itself never deletes operational data.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE FUNCTION public.assert_no_incoming_record_rows_v1(p_relation regclass,p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE fk record; present boolean; key_att smallint; child_key text;
BEGIN
 SELECT attnum INTO STRICT key_att FROM pg_attribute WHERE attrelid=p_relation AND attname='id' AND NOT attisdropped;
 FOR fk IN SELECT c.*,a.attname AS child_key FROM pg_constraint c LEFT JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
  WHERE c.contype='f' AND c.confrelid=p_relation LOOP
  IF array_position(fk.confkey,key_att) IS NULL THEN RAISE EXCEPTION 'Unreviewed relationship prevents deletion' USING ERRCODE='55000'; END IF;
  SELECT attname INTO child_key FROM pg_attribute WHERE attrelid=fk.conrelid AND attnum=fk.conkey[array_position(fk.confkey,key_att)];
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)',fk.conrelid::regclass,child_key) INTO present USING p_id;
  IF present THEN RAISE EXCEPTION 'Dependent records prevent deletion' USING ERRCODE='55000'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assert_no_incoming_record_rows_v1(regclass,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.delete_store_call_record_v1(p_id uuid,p_actor uuid,p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE before_row public.store_calls%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO before_row FROM public.store_calls WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Store call not found' USING ERRCODE='P0002'; END IF;
 IF before_row.collaboration_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Record changed' USING ERRCODE='40001'; END IF;
 DELETE FROM public.admin_notifications WHERE store_call_id=p_id AND trip_id=before_row.trip_id;
 PERFORM public.assert_no_incoming_record_rows_v1('public.store_calls'::regclass,p_id);
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES(p_actor,'DELETE','store_calls',p_id,to_jsonb(before_row),jsonb_build_object('scope','store-call-only','trip_preserved',true));
 DELETE FROM public.store_calls WHERE id=p_id;
 RETURN jsonb_build_object('id',p_id,'trip_id',before_row.trip_id,'trip_stop_id',before_row.trip_stop_id);
END $$;
REVOKE ALL ON FUNCTION public.delete_store_call_record_v1(uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_store_call_record_v1(uuid,uuid,bigint) TO service_role;

-- Intentionally conservative: dependencies must be reviewed in their own workflows.
-- Removing the final EMPTY stop preserves its parent trip unconditionally.
CREATE FUNCTION public.delete_empty_trip_stop_v1(p_id uuid,p_trip uuid,p_actor uuid,p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE before_row public.trip_stops%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.trips WHERE id=p_trip FOR UPDATE;
 SELECT * INTO before_row FROM public.trip_stops WHERE id=p_id AND trip_id=p_trip FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Delivery stop not found' USING ERRCODE='P0002'; END IF;
 IF before_row.collaboration_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Record changed' USING ERRCODE='40001'; END IF;
 PERFORM public.assert_no_incoming_record_rows_v1('public.trip_stops'::regclass,p_id);
 -- No attachment cleanup is authorized by this empty-stop contract. Be conservative
 -- even for trip-wide attachments whose stop ownership is not established.
 IF EXISTS(SELECT 1 FROM public.trip_images WHERE trip_id=p_trip)
 OR EXISTS(SELECT 1 FROM public.report_receipts WHERE trip_id=p_trip)
 OR EXISTS(SELECT 1 FROM storage.objects WHERE
   bucket_id='trip-images' AND starts_with(name,'trips/'||p_trip||'/')
   OR bucket_id='report-receipts' AND starts_with(name,'operations/'||p_trip||'/'))
 THEN RAISE EXCEPTION 'Trip attachments or pending uploads require review before removing this stop' USING ERRCODE='55000'; END IF;

 IF EXISTS(SELECT 1 FROM public.flex_rows WHERE row_kind='SOURCE' AND source_entity_type='STOP' AND source_entity_id=p_id) THEN RAISE EXCEPTION 'Tracker records require review' USING ERRCODE='55000'; END IF;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data,new_data) VALUES(p_actor,'DELETE','trip_stops',p_id,to_jsonb(before_row),jsonb_build_object('scope','empty-stop-only','trip_preserved',true));
 DELETE FROM public.trip_stops WHERE id=p_id AND trip_id=p_trip;
 RETURN jsonb_build_object('id',p_id,'trip_id',p_trip,'trip_stop_id',p_id);
END $$;
REVOKE ALL ON FUNCTION public.delete_empty_trip_stop_v1(uuid,uuid,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_empty_trip_stop_v1(uuid,uuid,uuid,bigint) TO service_role;
COMMIT;
