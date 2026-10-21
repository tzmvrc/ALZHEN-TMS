import json, hashlib, re
from pathlib import Path
root = Path(__file__).resolve().parents[2]
if (root/'backend/migrations/2026_10_21_convoy_projection_completion.sql').exists():
    raise SystemExit('Versioned migration already exists. Do not regenerate an installed migration.')
views = json.loads((root/'backend/tests/fixtures/architecture-projections-installed.json').read_text())
sql = ["BEGIN;", "SET LOCAL lock_timeout='3s';"]
recovery = ["BEGIN;", "SET LOCAL lock_timeout='3s';"]
for entry in views:
    name, original = entry['name'], entry['definition'].replace('\r', '').rstrip().rstrip(';')
    body = original
    if name in ['v_dispatch_monitoring','v_dispatch_report','v_trip_booking','v_tms_combined']:
        body, count = re.subn(r'source.dispatch_number,', 't.dispatch_number,', body, count=1)
        assert count == 1, name
        body = f'SELECT projection.*, stop.dispatch_number AS stop_dispatch_reference FROM ({body}) projection LEFT JOIN public.trip_stops stop ON stop.id=projection._trip_stop_id'
    elif name == 'vw_store_calling_tracker':
        body = re.sub(r'WITH unique_active_primary_assignments AS \(.*?\n\s*SELECT sc.id', 'WITH active_convoy_assignments AS (SELECT a.* FROM public.trip_truck_assignments a WHERE a.unassigned_at IS NULL)\n SELECT sc.id', body, count=1, flags=re.S)
        body = body.replace('unique_active_primary_assignments tta', 'active_convoy_assignments tta')
        body = body.replace('((tta.trip_id = t.id))', "((tta.trip_id = t.id) AND (ts.id IS NULL OR tta.stop_scope='ALL' OR EXISTS(SELECT 1 FROM public.trip_assignment_stops responsibility WHERE responsibility.assignment_id=tta.id AND responsibility.trip_stop_id=ts.id)))")
        body = re.sub(r'CASE\s+WHEN \(sc.trip_stop_id IS NULL\) THEN t.dispatch_number\s+ELSE ts.dispatch_number\s+END AS dispatch_number', 't.dispatch_number AS dispatch_number', body)
        body = body.replace('sc.updated_at\n', 'sc.updated_at, tta.id AS assignment_id, ts.dispatch_number AS stop_dispatch_reference\n')
        assert 'AS assignment_id' in body
    else:
        body = re.sub(r'WITH unique_primary AS \(.*?\), tracker_rows AS', 'WITH active_convoy_assignments AS (SELECT a.* FROM public.trip_truck_assignments a WHERE a.unassigned_at IS NULL), tracker_rows AS', body, count=1, flags=re.S)
        body = body.replace('unique_primary a ON ((a.trip_id = s.trip_id))', "active_convoy_assignments a ON ((a.trip_id = s.trip_id) AND (a.stop_scope='ALL' OR EXISTS(SELECT 1 FROM public.trip_assignment_stops responsibility WHERE responsibility.assignment_id=a.id AND responsibility.trip_stop_id=s.id)))")
        body = body.replace('AS date_delivered\n', 'AS date_delivered, a.id AS assignment_id, tr.plate_number AS assigned_plate_number\n')
        assert 'AS assignment_id' in body
    digest=hashlib.md5(entry['definition'].replace('\r','').encode()).hexdigest()
    sql.append(f"DO $$ BEGIN IF md5(replace(pg_get_viewdef('public.{name}'::regclass),chr(13),''))<>'{digest}' THEN RAISE EXCEPTION 'Unexpected definition for {name}; review dependencies'; END IF; END $$;")
    sql.append(f'CREATE OR REPLACE VIEW public.{name} AS {body};')
    # Recovery keeps appended columns, so dependent consumers do not lose data.
    extra = ', NULL::uuid AS assignment_id, NULL::text AS assigned_plate_number' if name=='v_transmittal_tracker_page' else ', NULL::uuid AS assignment_id, NULL::text AS stop_dispatch_reference' if name=='vw_store_calling_tracker' else ', NULL::text AS stop_dispatch_reference'
    recovery.append(f'CREATE OR REPLACE VIEW public.{name} AS SELECT old_projection.*{extra} FROM ({original}) old_projection;')
sql += ['ALTER TABLE public.trip_cargo_allocations REPLICA IDENTITY FULL;', 'ALTER TABLE public.trip_assignment_stops REPLICA IDENTITY FULL;', 'NOTIFY pgrst, \'reload schema\';', 'COMMIT;']
recovery += ['COMMIT;']
(root/'backend/migrations/2026_10_21_convoy_projection_completion.sql').write_text('\n'.join(sql)+'\n', newline='\n')
(root/'backend/migrations/recovery/2026_10_21_convoy_projection_completion_recovery.sql').write_text('\n'.join(recovery)+'\n', newline='\n')
