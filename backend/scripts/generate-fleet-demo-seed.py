"""Generate a reviewable, isolated seed from the previously reviewed convoy graph."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
routes = json.loads((root / 'migrations/proposals/2026_10_24_fleet_demo_waypoints.json').read_text())
original = (root / 'migrations/proposals/2026_10_24_home_demo_trip.sql').read_text(encoding='utf-8')
body = original[original.index('  INSERT INTO public.customers'):original.index('\nEND;\n$demo$;')]
tables = ['customers','trucking_companies','trucks','drivers','warehouses','customer_stores','products','trip_types','trips','trip_truck_assignments','trip_stops','trip_line_items','trip_assignment_stops','trip_cargo_allocations','trip_events','driver_trip_updates']
parts = ["""-- Approved fleet demonstration: data only, no schema/security changes.
-- Five independent 31-record graphs. UUID namespaces f1241024-0001..0005.
-- No real GPS, auth users, consent, sessions, attachments or financial records.
-- Normal FK/capacity/history/location/Realtime triggers remain enabled.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $fleet$
DECLARE
 tag constant text := '[ALZHEN_FLEET_DEMO_V1]';
 reviewer constant uuid := '8eaf7847-e806-493d-8338-ac0412153245';
 sample_time timestamptz := clock_timestamp();
 started timestamptz;
 delivery_day date;
 occupied integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('ALZHEN_FLEET_DEMO_V1'));
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=reviewer AND role='ADMIN') THEN RAISE EXCEPTION 'Coordinate reviewer is not an Admin'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tms_dropdown_options WHERE field_key='trip_status' AND option_value='IN_PROGRESS' AND active) THEN RAISE EXCEPTION 'IN_PROGRESS status unavailable'; END IF;
"""
]
for r in routes:
    i = r['number']
    prefix = f'f1241024-{i:04d}-4000-8000-'
    ident = lambda suffix: prefix + f'{suffix:012d}'
    dispatch = f'DEMO-FLEET-{i}-20261024'
    counts = ' + '.join(f"(SELECT count(*) FROM public.{table} WHERE id::text LIKE '{prefix}%')" for table in tables)
    parts.append(f"""
 -- Scenario {i}: {r['origin']} -> {r['name']}; positions verified on Mapbox driving geometry.
 SELECT {counts} INTO occupied;
 IF occupied<>0 THEN
  IF occupied<>31 OR NOT EXISTS(SELECT 1 FROM public.trips WHERE id='{ident(100)}' AND dispatch_number='{dispatch}' AND remarks LIKE '%[ALZHEN_FLEET_DEMO_V1]%')
   OR (SELECT count(*) FROM public.trip_line_items WHERE trip_id='{ident(100)}')<>4
   OR (SELECT count(*) FROM public.trip_stops WHERE trip_id='{ident(100)}')<>2
   OR NOT EXISTS(SELECT 1 FROM public.trip_truck_assignments WHERE id='{ident(101)}' AND trip_id='{ident(100)}' AND truck_id='{ident(3)}' AND driver_id='{ident(4)}')
  THEN RAISE EXCEPTION 'Incomplete or conflicting demo namespace {i}; no records changed'; END IF;
  RAISE NOTICE 'Demo fleet scenario {i} already exists; left unchanged';
 ELSE
  IF EXISTS(SELECT 1 FROM public.trips WHERE dispatch_number='{dispatch}') OR EXISTS(SELECT 1 FROM public.trucks WHERE plate_number='DEMO-F{i:02d}') THEN RAISE EXCEPTION 'Demo identifiers already owned by another graph'; END IF;
  started := sample_time - interval '{'2 days' if r.get('overdue') else '4 hours'}';
  delivery_day := (sample_time AT TIME ZONE 'Asia/Manila')::date {'- 1' if r.get('overdue') else '+ 1'};
"""
    )
    s = body.replace('d0241024-0000-4000-8000-',prefix).replace('DEMO-HOME',f'DEMO-FLEET-{i}')
    s = s.replace('DEMO-1024',f'DEMO-F{i:02d}').replace('DEMO-NOT-A-REAL-LICENSE',f'DEMO-FLEET-{i}-LICENSE')
    s=s.replace('DEMO-DR-',f'DEMO-F{i}-DR-').replace('DEMO-SO-',f'DEMO-F{i}-SO-').replace('DEMO-AUTH-1024',f'DEMO-F{i}-AUTH')
    first,last = r['driver'].split(' ',1)
    s = s.replace("'DEMO Miguel','Santos'",f"'DEMO {first}','{last}'")
    s = s.replace("'Wing Van',45",f"'{r['type']}',{45 if r['type']=='Wing Van' else 30}")
    s = s.replace('DEMO Valenzuela consolidation warehouse',f"DEMO Fleet {i} {r['origin']} warehouse")
    s = s.replace('DEMO street waypoint in Valenzuela; not a real customer premise',f"DEMO road waypoint in {r['origin']}; no real premise or business affiliation")
    if r['origin']=='Marikina': s=s.replace("'Valenzuela','Metro Manila'","'Marikina','Metro Manila'")
    s = s.replace('DEMO North EDSA receiving point',f"DEMO Fleet {i} {r['stops'][0]['name']} receiving point")
    s = s.replace('DEMO Ermita receiving point',f"DEMO Fleet {i} {r['stops'][1]['name']} receiving point")
    s = s.replace('DEMO receiving point near SM City North EDSA; no business affiliation',f"DEMO road waypoint in {r['stops'][0]['name']}; no real premise")
    s = s.replace('DEMO receiving point near Robinsons Place Manila; no business affiliation',f"DEMO road waypoint in {r['stops'][1]['name']}; no real premise")
    # Each coordinate pair remains longitude/latitude only in the manifest, latitude/longitude in SQL.
    for old,p in [('14.701028,120.983014',r['warehouse']),('14.656510,121.028953',r['stops'][0]['point']),('14.578818,120.983034',r['stops'][1]['point']),('14.636887,121.025503',r['gps'])]:
        s=s.replace(old,f'{p[1]},{p[0]}')
    s=s.replace('North EDSA delivered; Ermita pending.',f"{r['stops'][0]['name']} delivered; {r['stops'][1]['name']} pending.")
    s=s.replace('SIMULATED GPS: static',f"[assignment:{ident(101)}] SIMULATED GPS: static")
    s=s.replace('Mapbox demo fixture','Mapbox Directions preparation').replace('existing Mapbox road waypoint','Mapbox-snapped demonstration road waypoint')
    # Dedicated trip numbers; existing reference generator remains authoritative.
    s=s.replace('dispatch_number,trip_reference,trip_type_id','dispatch_number,trip_reference,trip_number,trip_type_id')
    s=s.replace(f"'{dispatch}','DEMO-FLEET-{i}-TRIP-01',",f"'{dispatch}','DEMO-FLEET-{i}-TRIP-01',{i},")
    # Keep actual place labels meaningful; all receiving points remain fictional.
    s=s.replace("'Quezon City','Metro Manila'",f"'{r['stops'][0]['name']}','{'Bulacan' if i==4 else 'Metro Manila'}'")
    s=s.replace("'Manila','Metro Manila'",f"'{r['stops'][1]['name']}','{'Pampanga' if i==4 else 'Metro Manila'}'")
    if i==3:s=s.replace("'Antipolo','Metro Manila'","'Antipolo','Rizal'").replace("'Cainta','Metro Manila'","'Cainta','Rizal'")
    parts.append(s)
    parts.append(f"""
  INSERT INTO public.driver_trip_updates(id,trip_id,driver_id,status,delivery_status,notes,updated_at)
   VALUES('{ident(161)}','{ident(100)}','{ident(4)}','DEMO first delivery completed','COMPLETED',tag||' Demonstration progress, not a real driver submission. [assignment:{ident(101)}]',started+interval '120 minutes');
 END IF;
"""
    )
parts.append('END;\n$fleet$;\nCOMMIT;\n')
(root / 'migrations/proposals/2026_10_24_home_fleet_demo.sql').write_text(''.join(parts),encoding='utf-8')
print('Generated 5 independent, idempotent demo graphs: 155 rows across 16 tables.')
