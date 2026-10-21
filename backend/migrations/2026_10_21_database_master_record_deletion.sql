-- Additive RPC only. Keeps all existing foreign keys, RLS, triggers and records.
-- Recovery: disable the application's deletion action, then revoke service_role EXECUTE.
-- No table, constraint, data backfill or Storage change is needed.
BEGIN;
SET LOCAL lock_timeout = '3s';
CREATE FUNCTION public.delete_master_data_record_v1(p_resource text,p_id uuid,p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE target regclass; before_row jsonb; fk record; child_key text; id_att smallint; dependent boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role IN ('ADMIN','STAFF')) THEN
  RAISE EXCEPTION 'Access denied' USING ERRCODE='42501';
 END IF;
 target:=CASE p_resource WHEN 'warehouses' THEN 'public.warehouses'::regclass
  WHEN 'trucks' THEN 'public.trucks'::regclass WHEN 'drivers' THEN 'public.drivers'::regclass
  WHEN 'trucking-companies' THEN 'public.trucking_companies'::regclass WHEN 'customers' THEN 'public.customers'::regclass
  WHEN 'stores' THEN 'public.customer_stores'::regclass WHEN 'store-contacts' THEN 'public.store_contacts'::regclass
  WHEN 'products' THEN 'public.products'::regclass ELSE NULL END;
 IF target IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'Invalid master record' USING ERRCODE='22023'; END IF;
 -- FOR UPDATE prevents a concurrent reference acquiring a key-share lock after the checks.
 EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE id=$1 FOR UPDATE',target) INTO before_row USING p_id;
 IF before_row IS NULL THEN RAISE EXCEPTION 'Record not found' USING ERRCODE='P0002'; END IF;
 IF p_resource='products' AND nullif(before_row->>'photo_path','') IS NOT NULL THEN
  RAISE EXCEPTION 'Remove the product photo through Manage photo before deleting this record' USING ERRCODE='55000';
 END IF;
 SELECT attnum INTO STRICT id_att FROM pg_attribute WHERE attrelid=target AND attname='id' AND NOT attisdropped;
 FOR fk IN SELECT * FROM pg_constraint WHERE contype='f' AND confrelid=target ORDER BY conrelid,conname LOOP
  -- Only existing, single-column SET NULL relationships may clear references.
  IF cardinality(fk.conkey)<>1 OR cardinality(fk.confkey)<>1 OR fk.confkey[1]<>id_att THEN
   RAISE EXCEPTION 'An unreviewed relationship prevents deletion' USING ERRCODE='55000';
  END IF;
  SELECT attname INTO STRICT child_key FROM pg_attribute WHERE attrelid=fk.conrelid AND attnum=fk.conkey[1];
  IF fk.confdeltype<>'n' THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)',fk.conrelid::regclass,child_key) INTO dependent USING p_id;
   IF dependent THEN
    RAISE EXCEPTION 'This record is used by other records or attachments. Clear those relationships first' USING ERRCODE='55000';
   END IF;
  END IF;
 END LOOP;
 INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,old_data)
 VALUES(p_actor,'DELETE_MASTER_RECORD',p_resource,p_id,before_row);
 EXECUTE format('DELETE FROM %s WHERE id=$1',target) USING p_id;
 -- Existing admin change triggers publish the confirmed lookup and reference changes.
 RETURN jsonb_build_object('id',p_id,'resource',p_resource,'deleted',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_master_data_record_v1(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_master_data_record_v1(text,uuid,uuid) TO service_role;
COMMENT ON FUNCTION public.delete_master_data_record_v1(text,uuid,uuid) IS 'Session-authorized master record deletion: existing SET NULL only; any referenced CASCADE/RESTRICT/NO ACTION blocks; no operational parent deletion.';
COMMIT;
