-- PROPOSAL ONLY. Do not apply without explicit approval.
-- Additive, service-only projection for bounded Tracker search/sort/page queries.
-- No operational writes, backfill, base privilege changes or replacement views.
-- Recovery: retain existing APIs, disable paged consumer; reviewed removal of
-- only this new view and its pure helpers. Existing data needs no restoration.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE FUNCTION public.tracker_page_text_v1(p_value jsonb,p_fallback text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE v jsonb:=p_value; parsed jsonb; n bigint;
BEGIN
 IF v IS NULL OR v='null'::jsonb THEN RETURN p_fallback; END IF;
 IF jsonb_typeof(v)='string' THEN
   BEGIN parsed:=(v#>>'{}')::jsonb; EXCEPTION WHEN invalid_text_representation THEN parsed:=NULL; END;
   IF jsonb_typeof(parsed)='object' AND jsonb_typeof(parsed->'__alzhen_transmittal_pod_values_v1')='object' THEN
     SELECT count(DISTINCT value),min(value::text)::jsonb INTO n,v
       FROM jsonb_each(parsed->'__alzhen_transmittal_pod_values_v1')
       WHERE value NOT IN ('null'::jsonb,'""'::jsonb);
     IF n>1 OR v IS NULL THEN RETURN p_fallback; END IF;
   END IF;
 END IF;
 IF v='{"__alzhen_tracker_empty_override_v1__":true}'::jsonb
   OR (jsonb_typeof(v)='object' AND v->'__alzhen_tracker_empty_override_v1__'='true'::jsonb) THEN RETURN ''; END IF;
 IF jsonb_typeof(v)='string' THEN RETURN v#>>'{}'; END IF;
 RETURN '';
END; $$;
CREATE FUNCTION public.tracker_page_cells_v1(p_cells jsonb,p_count bigint,p_fields bigint)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_count<>p_fields THEN RAISE EXCEPTION USING ERRCODE='21000',MESSAGE='Ambiguous tracker field binding; repair metadata before paging.'; END IF;
 RETURN coalesce(p_cells,'{}'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.tracker_page_text_v1(jsonb,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tracker_page_cells_v1(jsonb,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tracker_page_text_v1(jsonb,text),public.tracker_page_cells_v1(jsonb,bigint,bigint) TO service_role;
CREATE VIEW public.v_transmittal_tracker_page AS
WITH unique_primary AS (
 SELECT a.* FROM public.trip_truck_assignments a
 WHERE a.assignment_type='PRIMARY' AND a.unassigned_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM public.trip_truck_assignments b WHERE b.trip_id=a.trip_id
   AND b.assignment_type='PRIMARY' AND b.unassigned_at IS NULL AND b.id<>a.id)
), tracker_rows AS (
 SELECT s.id AS stop_id,
   (SELECT fr.id FROM public.flex_rows fr JOIN public.flex_tables ft ON ft.id=fr.table_id
    WHERE ft.settings->>'system_key'='alzhen_transmittal_tracker_v1' AND ft.archived_at IS NULL
      AND fr.row_kind='SOURCE' AND fr.source_entity_type='STOP'
      AND fr.archived_at IS NULL AND fr.source_entity_id=s.id) AS source_row_id
 FROM public.trip_stops s
)
SELECT s.id AS trip_stop_id,s.trip_id,s.stop_sequence,
 coalesce(s.dr_number,public.tracker_page_text_v1(c.value->'delivery_receipt_no_override',coalesce(li.single_dr,''))) AS delivery_receipt_no,
 trim(concat_ws(' ',nullif(d.first_name,''),nullif(d.last_name,''))) AS driver_name,
 public.tracker_page_text_v1(c.value->'transmittal_ref','') AS transmittal_ref,
 public.tracker_page_text_v1(c.value->'warehouse_code_override',coalesce(trim(w.code),'')) AS warehouse_code,
 public.tracker_page_text_v1(c.value->'delivered_to_override',coalesce(nullif(st.name,''),cu.name,'')) AS delivered_to,
 public.tracker_page_text_v1(c.value->'plate_number_override',coalesce(trim(tr.plate_number),'')) AS plate_number,
 public.tracker_page_text_v1(c.value->'sales_order_no_override',coalesce(li.sales_orders,'')) AS sales_order_no,
 public.tracker_page_text_v1(c.value->'date_created_override','') AS date_created,
 public.tracker_page_text_v1(c.value->'tracker_status',coalesce(trim(s.delivery_status),'')) AS status,
 public.tracker_page_text_v1(c.value->'lbc_waybill_no',coalesce(trim(t.lbc_tracking_number),'')) AS lbc_waybill_no,
 public.tracker_page_text_v1(c.value->'lbc_shipping_date',coalesce(left(t.pod_ac_shipping_date::text,10),'')) AS shipping_date_via_lbc,
 public.tracker_page_text_v1(c.value->'tracker_remarks','') AS remarks,
 public.tracker_page_text_v1(c.value->'loading_date_override',coalesce(left(t.loading_date::text,10),'')) AS loading_date,
 public.tracker_page_text_v1(c.value->'delivery_date_override',coalesce(left(s.finish_unloading_time::text,10),'')) AS date_delivered
FROM public.trip_stops s
JOIN public.trips t ON t.id=s.trip_id
JOIN tracker_rows r ON r.stop_id=s.id
LEFT JOIN public.warehouses w ON w.id=t.warehouse_id
LEFT JOIN public.customer_stores st ON st.id=s.store_id
LEFT JOIN public.customers cu ON cu.id=s.customer_id
LEFT JOIN unique_primary a ON a.trip_id=s.trip_id
LEFT JOIN public.trucks tr ON tr.id=a.truck_id
LEFT JOIN public.drivers d ON d.id=a.driver_id
LEFT JOIN LATERAL (
 SELECT string_agg(DISTINCT nullif(trim(i.sap_so_number),''),', ' ORDER BY nullif(trim(i.sap_so_number),'')) AS sales_orders,
 CASE WHEN count(DISTINCT nullif(trim(i.dr_number),''))=1 THEN min(nullif(trim(i.dr_number),'')) END AS single_dr
 FROM public.trip_line_items i WHERE i.trip_stop_id=s.id AND i.trip_id=s.trip_id
) li ON true
LEFT JOIN LATERAL (
 SELECT public.tracker_page_cells_v1(jsonb_object_agg(co.settings->>'system_key',ce.value)
   FILTER(WHERE co.settings->>'system_key' IS NOT NULL),
   count(*) FILTER(WHERE co.settings->>'system_key' IS NOT NULL),
   count(DISTINCT co.settings->>'system_key')) AS value
 FROM public.flex_cells ce JOIN public.flex_columns co ON co.id=ce.column_id
 WHERE ce.row_id=r.source_row_id AND co.table_id=(SELECT table_id FROM public.flex_rows WHERE id=r.source_row_id)
   AND co.binding_scope='STOP' AND NOT co.is_archived
) c ON true
WHERE r.source_row_id IS NOT NULL OR upper(trim(s.delivery_status)) IN ('COMPLETED','COMPLETE','DELIVERED');
REVOKE ALL ON public.v_transmittal_tracker_page FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_transmittal_tracker_page TO service_role;
COMMIT;
