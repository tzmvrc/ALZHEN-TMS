import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[2]
if (root/'backend/migrations/2026_10_21_convoy_stop_history.sql').exists():
    raise SystemExit('Versioned migration already exists. Do not regenerate an installed migration.')
source=(root/'backend/migrations/2026_10_21_trip_convoy_integrity.sql').read_text(encoding='utf-8')
body=re.search(r'CREATE FUNCTION public.set_trip_assignment_stops_v1\(.*?END \$\$;',source,re.S).group(0)
body=body.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1).replace('DECLARE assignment public.trip_truck_assignments%ROWTYPE;','DECLARE assignment public.trip_truck_assignments%ROWTYPE; before_stops jsonb; before_assignment jsonb;')
body=body.replace(" IF assignment.collaboration_version", " before_assignment=to_jsonb(assignment);\n IF assignment.collaboration_version")
body=body.replace(' DELETE FROM public.trip_assignment_stops WHERE', " SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]') INTO before_stops FROM public.trip_assignment_stops s WHERE s.assignment_id=p_assignment;\n IF EXISTS(SELECT 1 FROM public.trip_assignment_stops WHERE assignment_id=p_assignment AND progress<>'PENDING' AND NOT trip_stop_id=ANY(p_stop_ids)) THEN RAISE EXCEPTION 'Keep truck stops that have recorded delivery progress' USING ERRCODE='23514';END IF;\n DELETE FROM public.trip_assignment_stops WHERE")
body=body.replace('entity_id,new_data) VALUES(p_actor,\'UPDATE\',\'trip_assignment_stops\',p_assignment,','entity_id,old_data,new_data) VALUES(p_actor,\'UPDATE\',\'trip_assignment_stops\',p_assignment,jsonb_build_object(\'assignment\',before_assignment,\'responsibilities\',before_stops),')
digest=next(row['hash'] for row in json.loads((root/'docs/architecture-installed-hashes.json').read_text()) if row['name']=='set_trip_assignment_stops_v1')
sql=f"""BEGIN;
SET LOCAL lock_timeout='3s';
DO $$BEGIN IF md5(replace(pg_get_functiondef('public.set_trip_assignment_stops_v1(uuid,uuid,uuid,text,uuid[],bigint)'::regprocedure),chr(13),''))<>'{digest}' THEN RAISE EXCEPTION 'Stop responsibility function changed; review required';END IF;END$$;
{body}
CREATE FUNCTION public.guard_assignment_stop_history_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.trips WHERE id=OLD.trip_id) AND EXISTS(SELECT 1 FROM public.trip_assignment_stops WHERE assignment_id=OLD.id) THEN
  RAISE EXCEPTION 'End this assignment to preserve truck-stop history; hard deletion is not permitted' USING ERRCODE='55000';
 END IF;RETURN OLD;
END$$;
CREATE TRIGGER convoy_stop_history_guard BEFORE DELETE ON public.trip_truck_assignments FOR EACH ROW EXECUTE FUNCTION public.guard_assignment_stop_history_v1();
REVOKE ALL ON FUNCTION public.guard_assignment_stop_history_v1() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
"""
(root/'backend/migrations/2026_10_21_convoy_stop_history.sql').write_text(sql,encoding='utf-8',newline='\n')
