-- Relational projections keep SQL filtering/sorting/exports consistent with native milestones.
-- Aggregates are keyed before joining product rows; no per-product RPC or POD query.
CREATE OR REPLACE VIEW public.v_confirmed_pod_documents AS
SELECT i.trip_id,i.assignment_id,i.trip_stop_id,i.dr_number,
 bool_or(i.pod_review_status='APPROVED') approved,
 max(i.pod_reviewed_at) FILTER(WHERE i.pod_review_status='APPROVED') pod_received_at,
 min(coalesce(e.event_time,i.created_at)) pod_submitted_at,
 CASE WHEN bool_or(i.pod_review_status='APPROVED') THEN 'RECEIVED'
  WHEN (array_agg(i.pod_review_status ORDER BY i.created_at DESC,i.id DESC))[1]='REJECTED' THEN 'REJECTED'
  ELSE 'PENDING_TRUCKER_CONFIRMATION' END pod_status
FROM public.trip_images i LEFT JOIN public.trip_events e ON e.id=i.delivery_event_id
WHERE i.kind='receipt' AND i.assignment_id IS NOT NULL AND coalesce(i.delivery_upload_state,'READY')='READY'
GROUP BY i.trip_id,i.assignment_id,i.trip_stop_id,i.dr_number;

CREATE OR REPLACE VIEW public.v_confirmed_assignment_stop_state AS
WITH times AS (
 SELECT e.trip_id,e.assignment_id,e.trip_stop_id,
 min(e.event_time) FILTER(WHERE event_type='WAREHOUSE_ARRIVAL') warehouse_arrival_at,
 min(e.event_time) FILTER(WHERE event_type='LOADING_STARTED') loading_start_at,
 min(e.event_time) FILTER(WHERE event_type='LOADING_FINISHED') loading_finished_at,
 min(e.event_time) FILTER(WHERE event_type='WAREHOUSE_DEPARTURE') warehouse_departure_time,
 min(e.event_time) FILTER(WHERE event_type IN ('ARRIVED','STORE_ARRIVAL')) arrival_time,
 min(e.event_time) FILTER(WHERE event_type='UNLOADING_STARTED') start_unloading_time,
 min(e.event_time) FILTER(WHERE event_type='UNLOADING_FINISHED') finish_unloading_time,
 min(e.event_time) FILTER(WHERE event_type='STOP_DEPARTURE') departure_time,
 min(e.event_time) FILTER(WHERE event_type='POD_SUBMITTED') pod_submitted_at,
 bool_or(event_type='ASSIGNMENT_COMPLETED') assignment_completed,
 bool_or(event_type<>'POD_SUBMITTED') has_events
 FROM public.trip_events e WHERE e.assignment_id IS NOT NULL AND event_type IN
 ('WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE','ARRIVED','STORE_ARRIVAL','UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE','ASSIGNMENT_COMPLETED','POD_SUBMITTED')
 GROUP BY e.trip_id,e.assignment_id,e.trip_stop_id
), assignment_flags AS (
 SELECT trip_id,assignment_id,bool_or(has_events) has_events FROM times GROUP BY trip_id,assignment_id
), trip_flags AS (
 SELECT trip_id,bool_or(has_events) has_events FROM assignment_flags GROUP BY trip_id
), expected AS (
 SELECT DISTINCT ca.trip_id,ca.assignment_id,li.trip_stop_id,li.dr_number
 FROM public.trip_cargo_allocations ca JOIN public.trip_line_items li ON li.id=ca.trip_line_item_id
 WHERE nullif(btrim(li.dr_number),'') IS NOT NULL
), expected_pods AS (
 SELECT ex.trip_id,ex.assignment_id,ex.trip_stop_id,count(*) expected_count,bool_and(coalesce(pd.approved,false)) all_approved
 FROM expected ex LEFT JOIN public.v_confirmed_pod_documents pd ON pd.trip_id=ex.trip_id AND pd.assignment_id=ex.assignment_id AND pd.trip_stop_id=ex.trip_stop_id AND pd.dr_number=ex.dr_number
 GROUP BY ex.trip_id,ex.assignment_id,ex.trip_stop_id
), receipts AS (
 SELECT trip_id,assignment_id,trip_stop_id,bool_or(approved) any_approved,max(pod_received_at) pod_received_at,min(pod_submitted_at) pod_submitted_at,
 CASE WHEN bool_or(approved) THEN 'RECEIVED' WHEN bool_or(pod_status='REJECTED') THEN 'REJECTED' ELSE 'PENDING_TRUCKER_CONFIRMATION' END pod_status
 FROM public.v_confirmed_pod_documents GROUP BY trip_id,assignment_id,trip_stop_id
), rows AS (
 SELECT a.id assignment_id,a.trip_id,s.id trip_stop_id,s.stop_sequence,
 w.warehouse_arrival_at,w.loading_start_at,w.loading_finished_at,w.warehouse_departure_time,
 t.arrival_time,t.start_unloading_time,t.finish_unloading_time,t.departure_time,
 coalesce(t.pod_submitted_at,r.pod_submitted_at) pod_submitted_at,r.pod_received_at,r.pod_status,
 coalesce(w.assignment_completed,false) assignment_completed,
 coalesce(af.has_events,false) has_events,coalesce(tf.has_events,false) trip_has_events,
 CASE WHEN ep.expected_count>0 THEN ep.all_approved ELSE coalesce(r.any_approved,false) END pod_approved
 FROM public.trip_truck_assignments a JOIN public.trip_stops s ON s.trip_id=a.trip_id AND s.archived_at IS NULL
 LEFT JOIN times w ON w.assignment_id=a.id AND w.trip_stop_id IS NULL
 LEFT JOIN times t ON t.assignment_id=a.id AND t.trip_stop_id=s.id
 LEFT JOIN assignment_flags af ON af.assignment_id=a.id
 LEFT JOIN trip_flags tf ON tf.trip_id=a.trip_id
 LEFT JOIN expected_pods ep ON ep.assignment_id=a.id AND ep.trip_stop_id=s.id
 LEFT JOIN receipts r ON r.assignment_id=a.id AND r.trip_stop_id=s.id
 WHERE a.unassigned_at IS NULL AND (a.stop_scope='ALL' OR EXISTS(SELECT 1 FROM public.trip_assignment_stops responsibility WHERE responsibility.assignment_id=a.id AND responsibility.trip_stop_id=s.id))
)
SELECT rows.*,CASE WHEN departure_time IS NOT NULL AND pod_approved THEN 'COMPLETED'
 WHEN arrival_time IS NOT NULL THEN 'ARRIVED' WHEN warehouse_departure_time IS NOT NULL THEN 'IN_TRANSIT'
 WHEN warehouse_arrival_at IS NOT NULL THEN 'AT_DISPATCHER' ELSE 'PLANNED' END delivery_status,
 CASE WHEN departure_time IS NOT NULL AND pod_approved THEN greatest(departure_time,pod_received_at) END delivery_completed_date
FROM rows;
REVOKE ALL ON public.v_confirmed_pod_documents,public.v_confirmed_assignment_stop_state FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.v_confirmed_pod_documents,public.v_confirmed_assignment_stop_state TO service_role;

CREATE OR REPLACE FUNCTION public.read_confirmed_operational_state_v1(p_trips uuid[])
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT to_jsonb(s) FROM public.v_confirmed_assignment_stop_state s WHERE s.trip_id=ANY(p_trips);
$$;

-- Preserve every installed view's column order/types and unrelated source/import improvements.
-- Only outer field expressions change; new read-only fields are appended.
DO $migration$
DECLARE view_name text; definition text; projection text; tail text; split_at int; field text; expr text; dr text; existing text[];
BEGIN
 FOREACH view_name IN ARRAY ARRAY['v_tms_combined','v_dispatch_monitoring','v_dispatch_report','v_trip_booking','v_trip_master_csv'] LOOP
  IF to_regclass('public.'||view_name) IS NULL THEN CONTINUE;END IF;
  SELECT pg_get_viewdef(to_regclass('public.'||view_name),true) INTO definition;
  IF position('_operational_projection_ready' IN definition)>0 THEN CONTINUE;END IF;
  split_at:=position(E'\n   FROM' IN definition);
  IF split_at=0 OR left(ltrim(definition),9)<>'SELECT m.' THEN RAISE EXCEPTION 'Unexpected projection layout for %: %',view_name,left(definition,400);END IF;
  projection:=left(definition,split_at-1);tail:=rtrim(substr(definition,split_at),E';\n ');
  SELECT array_agg(column_name) INTO existing FROM information_schema.columns WHERE table_schema='public' AND table_name=view_name;
  dr:=CASE WHEN 'dr_number'=ANY(existing) THEN 'm.dr_number' WHEN 'transaction_dr_number'=ANY(existing) THEN 'm.transaction_dr_number' ELSE 'NULL::text' END;
  FOREACH field IN ARRAY ARRAY['delivery_status','warehouse_arrival_at','loading_start_at','loading_finished_at','warehouse_departure_time','arrival_time','start_unloading_time','finish_unloading_time','departure_time','delivery_completed_date','pod_submitted_at','pod_received_at','pod_status'] LOOP
   expr:='op.'||field;
   IF field IN ('pod_status','pod_submitted_at','pod_received_at') THEN expr:=format('CASE WHEN nullif(btrim(%s),'''') IS NOT NULL THEN pd.%I ELSE op.%I END',dr,field,field);END IF;
   IF field=ANY(existing) THEN
    IF position('m.'||field||',' IN projection)=0 AND right(rtrim(projection),length(field)+2)<>'m.'||field THEN RAISE EXCEPTION 'Unexpected % expression in %',field,view_name;END IF;
    projection:=replace(projection,'m.'||field,format('CASE WHEN op.trip_has_events THEN %s ELSE m.%I END AS %I',expr,field,field));
   ELSE projection:=projection||format(E',\n    %s AS %I',expr,field);END IF;
  END LOOP;
  IF 'signed_dr_upload_date'=ANY(existing) THEN projection:=replace(projection,'m.signed_dr_upload_date',format('(CASE WHEN op.trip_has_events THEN ((CASE WHEN nullif(btrim(%s),'''') IS NOT NULL THEN pd.pod_submitted_at ELSE op.pod_submitted_at END) AT TIME ZONE ''Asia/Manila'')::date ELSE m.signed_dr_upload_date END) AS signed_dr_upload_date',dr));END IF;
  projection:=projection||E',\n    CASE WHEN op.trip_has_events THEN ''CONFIRMED_MILESTONES'' ELSE ''LEGACY'' END AS delivery_status_source,\n    true AS _operational_projection_ready';
  EXECUTE 'CREATE OR REPLACE VIEW public.'||quote_ident(view_name)||' AS '||projection||tail||format(E'\n LEFT JOIN public.v_confirmed_assignment_stop_state op ON op.assignment_id=m._assignment_id AND op.trip_stop_id=m._trip_stop_id\n LEFT JOIN public.v_confirmed_pod_documents pd ON pd.assignment_id=m._assignment_id AND pd.trip_stop_id=m._trip_stop_id AND pd.dr_number=%s',dr);
 END LOOP;
END $migration$;
