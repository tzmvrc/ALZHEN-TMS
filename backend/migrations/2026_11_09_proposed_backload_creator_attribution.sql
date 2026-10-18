-- PROPOSAL ONLY: Backload original creator in dataset-wide search/sort. No data backfill.
-- Requires installed Operations pagination + Offload creator view.
-- Verification: same 28 columns/types/ACL/owner; search/sort use creator name.
-- Recovery: reinstall the captured pre-migration view definition (no row changes).
-- Capture existing pg_get_viewdef before approval; rollback restores that exact definition.
-- Existing column contract/owner/ACL/RLS/publications remain unchanged.
BEGIN;
SET LOCAL lock_timeout='3s';
CREATE OR REPLACE VIEW public.v_operations_report_page AS
WITH sources AS (
 SELECT 'LOADING'::text source_type,id source_record_id,trip_id,NULL::uuid trip_stop_id,event_type,
   NULL::timestamptz event_date,NULL::text reason,NULL::numeric number_of_boxes,NULL::text comments,NULL::uuid reporter_id
 FROM public.loading_reports
 UNION ALL
 SELECT 'UNLOADING',id,trip_id,trip_stop_id,event_type,NULL,NULL,NULL,NULL,NULL FROM public.unloading_reports
 UNION ALL
 SELECT 'BACKLOAD',id,trip_id,trip_stop_id,event_type,NULL,reason,number_of_boxes,comments,coalesce(created_by,submitted_by) FROM public.backloads
 UNION ALL
 SELECT 'OFFLOAD',id,trip_id,trip_stop_id,event_type,
   coalesce(reported_at,report_date::timestamp AT TIME ZONE 'Asia/Manila',created_at),
   reason,number_of_boxes,comments,coalesce(created_by,submitted_by) FROM public.offloads
), unique_primary AS (
 SELECT a.* FROM public.trip_truck_assignments a
 WHERE a.assignment_type='PRIMARY' AND a.unassigned_at IS NULL
 AND NOT EXISTS (SELECT 1 FROM public.trip_truck_assignments b WHERE b.trip_id=a.trip_id
   AND b.assignment_type='PRIMARY' AND b.unassigned_at IS NULL AND b.id<>a.id)
), projected AS (
 SELECT t.trip_number,r.source_type,r.source_record_id,r.trip_id,r.trip_stop_id,r.event_type AS report_type,
   CASE WHEN r.source_type='UNLOADING' THEN s.finish_unloading_time ELSE r.event_date END AS date,
   coalesce(CASE WHEN r.trip_stop_id IS NULL THEN t.dispatch_number ELSE s.dispatch_number END,t.trip_number::text) AS trip,
   truck.plate_number,
   nullif(coalesce(nullif(trim(concat_ws(' ',d.first_name,d.last_name)),''),trim(concat_ws(' ',dp.first_name,dp.last_name))),'') AS driver_name,
   route.value || CASE WHEN s.stop_sequence IS NOT NULL THEN ' · Stop '||s.stop_sequence::text ELSE '' END AS route,
   CASE WHEN r.source_type='OFFLOAD' THEN coalesce(nullif(trim(s.dr_number),''),oi.dr_number) ELSE li.dr_number END AS dr_number,
   CASE WHEN r.source_type='OFFLOAD' THEN oi.quantity WHEN r.source_type='BACKLOAD' THEN r.number_of_boxes ELSE li.quantity END AS quantity,
   CASE WHEN r.source_type='OFFLOAD' THEN oi.total_cbm WHEN r.source_type='BACKLOAD' THEN NULL::numeric ELSE li.cbm END AS total_cbm,
   CASE WHEN r.source_type='LOADING' THEN t.remarks WHEN r.source_type='UNLOADING' THEN s.remarks
     WHEN r.source_type='BACKLOAD' THEN coalesce(r.comments,r.reason) ELSE r.comments END AS remarks,
   nullif(trim(concat_ws(' ',rp.first_name,rp.last_name)),'') AS reported_by,
   r.reason,r.comments,r.number_of_boxes
 FROM sources r
 JOIN public.trips t ON t.id=r.trip_id
 LEFT JOIN public.trip_stops s ON s.id=r.trip_stop_id AND s.trip_id=r.trip_id
 LEFT JOIN unique_primary a ON a.trip_id=t.id
 LEFT JOIN public.trucks truck ON truck.id=a.truck_id
 LEFT JOIN public.drivers d ON d.id=a.driver_id
 LEFT JOIN public.profiles dp ON dp.id=d.profile_id
 LEFT JOIN public.profiles rp ON rp.id=r.reporter_id
 LEFT JOIN LATERAL (
   SELECT sum(l.quantity) quantity,sum(l.cbm) cbm,string_agg(DISTINCT nullif(trim(l.dr_number),''),', ' ORDER BY nullif(trim(l.dr_number),'')) dr_number
   FROM public.trip_line_items l WHERE l.trip_id=r.trip_id
     AND (r.trip_stop_id IS NULL OR (s.id IS NOT NULL AND l.trip_stop_id=s.id))
 ) li ON true
 LEFT JOIN LATERAL (
   SELECT sum(i.quantity) quantity,sum(i.total_cbm) total_cbm,string_agg(DISTINCT nullif(trim(i.dr_number),''),', ' ORDER BY nullif(trim(i.dr_number),'')) dr_number
   FROM public.offload_items i WHERE r.source_type='OFFLOAD' AND i.offload_id=r.source_record_id
 ) oi ON true
 LEFT JOIN LATERAL (
   SELECT coalesce(nullif(trim(w.name),''),'Warehouse not set') || coalesce(' → '||string_agg(
     coalesce(nullif(trim(cs.name),''),nullif(trim(c.name),''),'Stop '||coalesce(rs.stop_sequence::text,'(sequence unavailable)')),
     ' → ' ORDER BY rs.stop_sequence NULLS LAST,rs.id),'') AS value
   FROM public.trip_stops rs
   LEFT JOIN public.customer_stores cs ON cs.id=rs.store_id
   LEFT JOIN public.customers c ON c.id=rs.customer_id
   RIGHT JOIN (SELECT wh.name FROM (VALUES(1)) seed(n) LEFT JOIN public.warehouses wh ON wh.id=t.warehouse_id) w ON rs.trip_id=t.id
   GROUP BY w.name
 ) route ON true
 WHERE NOT EXISTS(SELECT 1 FROM public.operations_report_conversions cv
   WHERE cv.source_type=r.source_type AND cv.source_id=r.source_record_id)
)
SELECT p.*,
 public.operations_natural_sort_v1(p.trip) AS trip_sort,
 public.operations_natural_sort_v1(p.plate_number) AS plate_number_sort,
 public.operations_natural_sort_v1(p.driver_name) AS driver_name_sort,
 public.operations_natural_sort_v1(p.route) AS route_sort,
 public.operations_natural_sort_v1(p.dr_number) AS dr_number_sort,
 public.operations_natural_sort_v1(p.report_type) AS report_type_sort,
 public.operations_natural_sort_v1(p.remarks) AS remarks_sort,
 public.operations_natural_sort_v1(p.reported_by) AS reported_by_sort,
 concat_ws(' ',p.trip_number::text,p.trip,p.plate_number,p.driver_name,p.route,p.dr_number,p.quantity::text,p.total_cbm::text,
 p.report_type,p.remarks,p.reported_by,p.reason,p.comments,p.number_of_boxes::text) AS search_text
FROM projected p;
COMMIT;
