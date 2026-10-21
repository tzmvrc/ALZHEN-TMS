-- Additive follow-up to users_workspace_profiles_activity_assignments.
-- Preserve every event. Only server-side services may mutate audit evidence.
-- Recovery: restore reviewed grants only; retain the added search projection.
BEGIN;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
 ON public.audit_logs, public.flex_audit_events, public.report_audit_logs, public.pod_review_events
 FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.v_user_activity AS
SELECT events.*,
 concat_ws(' ', events.action, events.module, events.entity_id::text,
  events.new_data->>'actor_name', events.new_data->>'trip_number',
  events.new_data->>'dispatch_number', events.new_data->>'trip_id',
  events.new_data->>'column', events.new_data->>'column_key', events.new_data->>'field') AS search_text
FROM (
 SELECT 'audit:'||id::text AS id,user_id,action,entity_type AS module,entity_id,old_data,new_data,created_at FROM public.audit_logs
 UNION ALL SELECT 'flex:'||id::text,actor_profile_id,upper(action),'flexible-tables',entity_id,before_data,after_data,created_at FROM public.flex_audit_events
 UNION ALL SELECT 'report:'||id::text,actor_profile_id,upper(action),entity_type,entity_id,before_data,after_data,created_at FROM public.report_audit_logs
 UNION ALL SELECT 'pod:'||id::text,actor_profile_id,'POD_'||upper(decision),'pod',receipt_id,NULL::jsonb,jsonb_build_object('trip_id',trip_id,'trip_stop_id',trip_stop_id,'result',outcome,'actor_name',actor_snapshot),created_at FROM public.pod_review_events
) events;
REVOKE ALL ON public.v_user_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_user_activity TO service_role;
COMMIT;
