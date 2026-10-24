"""Generate insert-only, atomic demo SQL and an exact-ID manifest. Does not connect to a database."""
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

root=Path(__file__).resolve().parents[1]
out=root/'migrations/proposals'
scenarios=json.loads((out/'2026_10_24_demo30_waypoints.json').read_text())
tag='[ALZHEN_DEMO30_V1]'
reviewer='8eaf7847-e806-493d-8338-ac0412153245'
now=datetime.now(timezone.utc).replace(microsecond=0)
today=now.astimezone(timezone(timedelta(hours=8))).date()
iso=lambda value:value.isoformat()
ident=lambda scenario,suffix:f'e6301024-{scenario:04d}-4000-9000-{suffix:012d}'
db=defaultdict(list)
def put(table,**row):
    db[table].append(row)
def base(**row):
    return dict(row,created_at=iso(now-timedelta(days=20)))
products=[('REF320','320L refrigerator','REF',Decimal('.72')),('TV55','55-inch television','TV',Decimal('.18')),('WM9','9kg washing machine','WM',Decimal('.42')),('AC15','1.5HP air conditioner','AC',Decimal('.16')),('SBAR','Soundbar system','SBAR',Decimal('.04')),('REF120','120L compact refrigerator','REF',Decimal('.36'))]
customers=['Appliance Retail PH','Home Essentials Distribution','Island Retail Supply','Regional Consumer Goods']
for i,name in enumerate(customers):
    put('customers',**base(id=ident(0,1+i),name=f'DEMO30 {name}',code=f'DEMO30-CUSTOMER-{i+1}',address='Fictional Philippine distribution customer',email=f'demo30-customer-{i+1}@example.invalid',status='ACTIVE',notes=tag+' Fictional entity; no orders, messages or financial posting.'))
for i,name in enumerate(['Luzon Logistics','Visayas Freight','Mindanao Transport']):
    put('trucking_companies',**base(id=ident(0,101+i),name=f'DEMO30 {name}',code=f'DEMO30-CARRIER-{i+1}',email=f'demo30-carrier-{i+1}@example.invalid',status='ACTIVE',notes=tag+' Fictional carrier.'))
for i,(model,name,category,unit) in enumerate(products):
    put('products',**base(id=ident(0,401+i),sku=f'DEMO30-{model}',model_code=f'DEMO30-{model}',name=f'DEMO30 {name}',category=category,unit_cbm=float(unit),status='ACTIVE',notes=tag+' Sample cargo specification. No product image.'))
put('trip_types',**base(id=ident(0,301),code='DEMO30-DISTRIBUTION',name='DEMO30 Regional Distribution',description=tag+' Multi-stop and convoy distribution demonstration.',active=True))
hubs=list(dict.fromkeys(s['hub'] for s in scenarios))
hub_info={'Valenzuela':('Metro Manila','LUZON'),'Marikina':('Metro Manila','LUZON'),'Cabuyao':('Laguna','LUZON'),'Dasmarinas':('Cavite','LUZON'),'Mandaue':('Cebu','VISAYAS'),'CDO':('Misamis Oriental','MINDANAO'),'Davao':('Davao del Sur','MINDANAO'),'SanFernando':('Pampanga','LUZON')}
province_cities={
 'Bulacan':['Malolos','San Jose del Monte','Meycauayan','Bocaue','Balagtas'],
 'Pampanga':['San Fernando','Angeles','Mabalacat','Guagua','Lubao'],
 'Rizal':['Antipolo','Cainta','San Mateo','Rodriguez','Taytay Rizal','Angono'],
 'Laguna':['Calamba','Santa Rosa','San Pedro','Binan','Los Banos','Bay Laguna'],
 'Cavite':['Imus','Bacoor','General Trias','Tanza','Silang','Tagaytay'],
 'Davao del Norte':['Panabo','Carmen Davao','Tagum'],
}
for i,hub in enumerate(hubs):
    point=next(s['warehouse'] for s in scenarios if s['hub']==hub)
    province,region=hub_info[hub]
    put('warehouses',**base(id=ident(0,201+i),code=f'DEMO30-WH-{i+1}',name=f'DEMO30 {hub} warehouse',address=f'Fictional demo road-side consolidation area in {hub}; not an actual business premise',city=hub,province=province,region=region,latitude=point[1],longitude=point[0],location_verified=True,location_verified_at=iso(now),location_verified_by=reviewer,status='ACTIVE',notes=tag+' Coordinate reviewed against Mapbox driving geometry for a fictional demonstration only.'))
names=['Rafael Cruz','Carlo Reyes','Luis Mendoza','Daniel Garcia','Marco Bautista','Paolo Ramos','Adrian Flores','Miguel Santos','Noel Torres','Jose Villanueva','Arnel Aquino','Dante Navarro','Eric Santiago','Francis Lim','Ramon Castillo','Alvin Mercado','Benedict Tan','Dennis Lopez','Joel Fernandez','Kevin Rivera','Lester Gomez','Mario Pascual','Nestor Dela Cruz','Oscar Bautista','Peter Salvador','Renato Diaz','Samuel Castro','Tomas Valdez','Victor Soriano','Wilson Aguilar']
completed_index=0
assignment_ids=[]
for s in scenarios:
    n=s['number']; trip=ident(n,100); dispatch=f'DEMO30-20261024-{n:03d}'
    hub=s['hub']; province,region=hub_info[hub]; warehouse=ident(0,201+hubs.index(hub)); customer=ident(0,1+(n-1)%4)
    carrier=ident(0,102 if hub=='Mandaue' else 103 if hub in ['CDO','Davao'] else 101)
    if s['status']=='PLANNED': day=today+timedelta(days=1+n%3)
    elif s['status']=='COMPLETED': day=today-timedelta(days=completed_index); completed_index+=1
    elif s['delayed']: day=today-timedelta(days=1)
    else: day=today
    start=datetime.combine(day,datetime.min.time(),timezone(timedelta(hours=8)))+timedelta(hours=6+n%4)
    departed=None if s['status']=='PLANNED' else start+timedelta(minutes=55)
    assigned=now-timedelta(hours=1) if s['status']=='PLANNED' else start-timedelta(hours=1)
    put('trips',id=trip,dispatch_number=dispatch,trip_reference=f'DEMO30-TRIP-{n:03d}',trip_number=1,trip_type_id=ident(0,301),warehouse_id=warehouse,loading_date=day.isoformat(),estimated_delivery_date=day.isoformat(),status=s['status'],authorization_letter=f'DEMO30-AUTH-{n:03d}',letter_status='READY',remarks=tag+f' Fictional {hub} distribution to '+', '.join(stop['name'] for stop in s['stops'])+'. Demo / Simulated GPS; no real order, driver telemetry, consent or POD document.'+(' Overdue delivery estimate demonstrates delay.' if s['delayed'] else ''),request_received_at=iso(assigned-timedelta(hours=12)),departure_from_warehouse_at=iso(departed) if departed else None,created_at=iso(assigned-timedelta(hours=2)))
    trucks=2 if s['multi'] else 1
    for a in range(trucks):
        aid=ident(n,101+a);tid=ident(n,3+a*4);did=ident(n,4+a*4);assignment_ids.append(aid)
        truck_type='Wing Van' if n%3==0 else 'Closed Van' if n%3==1 else '10W'
        capacity=60 if truck_type=='Wing Van' else 36 if truck_type=='Closed Van' else 45
        first,last=names[(n-1+a*13)%len(names)].split(' ',1)
        put('trucks',**base(id=tid,plate_number=f'DEMO30-{n:03d}{chr(65+a)}',trucking_company_id=carrier,truck_type=truck_type,capacity_cbm=capacity,status='ACTIVE',notes=tag+' Fictional plate and truck, dedicated to this seed.'))
        put('drivers',**base(id=did,trucking_company_id=carrier,first_name=f'DEMO30 {first}',last_name=last,license_number=f'DEMO30-NOT-A-LICENSE-{n:03d}-{a+1}',status='ACTIVE',profile_id=None,assigned_truck_id=tid,notes=tag+' Fictional driver; no authentication account, tracking consent or device session.'))
        put('trip_truck_assignments',id=aid,trip_id=trip,truck_id=tid,driver_id=did,trucking_company_id=carrier,assignment_type='PRIMARY' if a==0 else 'SECONDARY',assigned_at=iso(assigned),stop_scope='SELECTED',remarks=tag+f' Truck {a+1}; independent stop responsibility and whole-unit cargo allocation.',created_at=iso(assigned))
    event_index=0
    def event(kind,time,point,aid,stop=None,detail=''):
        global event_index
        event_index+=1
        put('trip_events',id=ident(n,500+event_index),trip_id=trip,trip_stop_id=stop,event_type=kind,event_time=iso(time),latitude=point[1],longitude=point[0],recorded_by=None,notes=tag+f' [assignment:{aid}] SIMULATED demonstration event. '+detail,created_at=iso(time))
        if kind!='DEMO_SIMULATED_GPS':
            a=int(aid[-12:])-101
            put('driver_trip_updates',id=ident(n,800+event_index),trip_id=trip,driver_id=ident(n,4+a*4),status='DEMO '+kind,delivery_status='COMPLETED' if kind in ['UNLOADING_FINISHED','DEMO_POD_SUBMISSION','STOP_DEPARTURE'] else 'IN PROGRESS',notes=tag+f' [assignment:{aid}] SIMULATED activity for a fictional driver. '+detail,created_at=iso(time),updated_at=iso(time))
    if s['status']!='PLANNED':
        put('loading_reports',id=ident(n,900),trip_id=trip,status='SUBMITTED',event_type='Loading',warehouse_arrival_at=iso(start-timedelta(minutes=25)),loading_start_at=iso(start),loading_finished_at=iso(start+timedelta(minutes=45)),submitted_at=iso(start+timedelta(minutes=46)),created_at=iso(start),updated_at=iso(start+timedelta(minutes=46)))
        for a in range(trucks):
            event('LOADING_FINISHED',start+timedelta(minutes=45),s['warehouse'],ident(n,101+a),detail='Sample cargo loading completed; no real driver submission.')
            event('WAREHOUSE_DEPARTURE',departed,s['warehouse'],ident(n,101+a),detail='Fictional departure from the demo warehouse.')
    stage=[]
    for j,stop in enumerate(s['stops']):
        stop_province=next((name for name,cities in province_cities.items() if stop['name'] in cities),province)
        stopid=ident(n,111+j);store=ident(n,11+j);a=j%2 if s['multi'] else 0;aid=ident(n,101+a)
        complete=s['status']=='COMPLETED' or s['status']=='IN_PROGRESS' and j==0 and (s['multi'] or n%3==0 and len(s['stops'])>1)
        current=s['status']=='IN_PROGRESS' and not complete and n%2==0 and j==(1 if (s['multi'] or n%3==0 and len(s['stops'])>1) else 0)
        status='COMPLETED' if complete else 'IN PROGRESS' if current else 'PENDING';stage.append(status)
        arrival=start+timedelta(hours=2+j*1.25)
        unload=arrival+timedelta(minutes=12);finish=unload+timedelta(minutes=30+n%3*10);leave=finish+timedelta(minutes=10)
        p1=(n+j)%len(products);p2=(p1+2)%len(products);quantities=[5+(n+j)%8,8+(n*2+j)%9]
        units=sum(quantities);cbm=sum((Decimal(q)*products[p][3] for p,q in zip([p1,p2],quantities)),Decimal(0))
        put('customer_stores',**base(id=store,customer_id=customer,name=f'DEMO30 {stop["name"]} receiving point',code=f'DEMO30-{n:03d}-STORE-{j+1}',address=f'Fictional receiving area near a Mapbox-snapped public road in {stop["name"]}; no business affiliation',city=stop['name'],province=stop_province,region=region,latitude=stop['point'][1],longitude=stop['point'][0],location_verified=True,location_verified_at=iso(now),location_verified_by=reviewer,status='ACTIVE',notes=tag+' Demonstration coordinates; not verification of an actual customer premise.'))
        put('trip_stops',id=stopid,trip_id=trip,stop_sequence=j+1,customer_id=customer,store_id=store,dispatch_number=dispatch,transaction_number=f'DEMO30-TXN-{n:03d}-{j+1}',delivery_status=status,arrival_time=iso(arrival) if complete or current else None,start_unloading_time=iso(unload) if complete or current else None,finish_unloading_time=iso(finish) if complete else None,departure_time=iso(leave) if complete else None,quantity=units,total_cbm=float(cbm),dr_number=f'DEMO30-DR-{n:03d}-{j+1}',remarks=tag+' Protect appliance cartons; call receiving desk before arrival. Simulated delivery; no POD file exists.',created_at=iso(assigned))
        put('trip_assignment_stops',id=ident(n,401+j),trip_id=trip,assignment_id=aid,trip_stop_id=stopid,progress=status.replace(' ','_'),created_at=iso(assigned))
        for k,(p,q) in enumerate(zip([p1,p2],quantities)):
            model,name,category,unit=products[p];line=ident(n,201+j*10+k)
            put('trip_line_items',id=line,trip_id=trip,trip_stop_id=stopid,product_id=ident(0,401+p),quantity=q,unit_cbm=float(unit),cbm=float(unit*q),dr_number=f'DEMO30-DR-{n:03d}-{j+1}',so_number=f'DEMO30-SO-{n:03d}-{j+1}-{k+1}',customer_po_number=f'DEMO30-PO-{n:03d}',customer_model=f'DEMO30-{model}',source_warehouse_id=warehouse,source_warehouse=f'DEMO30 {hub} warehouse',source_product_category=category,source_city=stop['name'],source_province=stop_province,remarks=tag+' Whole-unit sample cargo, fully allocated to the responsible truck.',created_at=iso(assigned))
            put('trip_cargo_allocations',id=ident(n,301+j*10+k),trip_id=trip,assignment_id=aid,trip_line_item_id=line,quantity=q,allocated_cbm=float(unit*q),created_at=iso(assigned))
        if complete or current:
            put('unloading_reports',id=ident(n,911+j),trip_id=trip,trip_stop_id=stopid,status='SUBMITTED' if complete else 'DRAFT',event_type='Unloading',submitted_at=iso(finish) if complete else None,created_at=iso(arrival),updated_at=iso(finish if complete else unload))
            event('ARRIVED',arrival,stop['point'],aid,stopid,'Simulated arrival at the assigned delivery stop.')
            event('UNLOADING_STARTED',unload,stop['point'],aid,stopid,'Simulated unloading in progress.')
        if complete:
            event('UNLOADING_FINISHED',finish,stop['point'],aid,stopid,'Simulated delivery completion.')
            event('DEMO_POD_SUBMISSION',finish+timedelta(minutes=3),stop['point'],aid,stopid,'POD workflow preview ONLY. No proof, receipt image, document, upload or actual driver submission exists.')
            event('STOP_DEPARTURE',leave,stop['point'],aid,stopid,'Simulated departure following delivery.')
    if s['status']=='IN_PROGRESS':
        for a in range(trucks):
            assigned_stops=[j for j in range(len(stage)) if (j%2 if s['multi'] else 0)==a]
            in_progress=next((j for j in assigned_stops if stage[j]=='IN PROGRESS'),None)
            completed=[j for j in assigned_stops if stage[j]=='COMPLETED']
            point=s['stops'][in_progress]['point'] if in_progress is not None else s['stops'][completed[-1]]['point'] if completed and all(stage[j]=='COMPLETED' for j in assigned_stops) else s['gps'][a]
            event('DEMO_SIMULATED_GPS',now-timedelta(minutes=2+n%9+a),point,ident(n,101+a),detail='Static Mapbox road-network coordinate. Demo / Simulated GPS, not live driver telemetry. No consent or tracking session was created.')
    if s['delayed']:
        stopid=ident(n,112 if len(stage)>1 else 111);aid=ident(n,102 if s['multi'] else 101);time=now-timedelta(minutes=90+n)
        put('incidents',id=ident(n,950),trip_id=trip,trip_stop_id=stopid,incident_date=today.isoformat(),status='OPEN',description=tag+' SIMULATED traffic / receiving-window delay for dashboard exception review. No actual incident or driver report.',created_at=iso(time),updated_at=iso(time))
        event('INCIDENT_REPORTED',time,s['gps'][-1],aid,stopid,'Fictional traffic / receiving-window delay; no actual incident.')

# Validate the complete graph locally before emitting SQL.
for table,rows in db.items():
    assert len({r['id'] for r in rows})==len(rows),table
    assert all(str(r['id']).startswith('e6301024-') for r in rows)
for assignment in db['trip_truck_assignments']:
    truck=next(r for r in db['trucks'] if r['id']==assignment['truck_id'])
    used=sum(Decimal(str(r['allocated_cbm'])) for r in db['trip_cargo_allocations'] if r['assignment_id']==assignment['id'])
    assert used<=truck['capacity_cbm'],(assignment['id'],used,truck['capacity_cbm'])
for line in db['trip_line_items']:
    allocated=[a for a in db['trip_cargo_allocations'] if a['trip_line_item_id']==line['id']]
    assert sum(a['quantity'] for a in allocated)==line['quantity']
    assert sum(Decimal(str(a['allocated_cbm'])) for a in allocated)==Decimal(str(line['cbm']))
assert len(db['trips'])==30 and len(db['trucks'])==40 and len(db['trip_stops'])==60
assert all(r.get('profile_id') is None for r in db['drivers'])
order=['customers','trucking_companies','products','trip_types','warehouses','trucks','drivers','customer_stores','trips','trip_truck_assignments','trip_stops','trip_line_items','trip_assignment_stops','trip_cargo_allocations','loading_reports','unloading_reports','incidents','trip_events','driver_trip_updates']
manifest={'tag':tag,'reviewer':reviewer,'preparedAt':iso(now),'counts':{table:len(db[table]) for table in order},'ids':{table:[row['id'] for row in db[table]] for table in order},'statuses':dict(Counter(row['status'] for row in db['trips'])),'delayedTrips':4,'multiTruckTrips':10,'expectedGPSMarkers':28,'routeEligibleAssignments':[a['id'] for a in db['trip_truck_assignments'] if next(t for t in db['trips'] if t['id']==a['trip_id'])['status']!='COMPLETED']}
(out/'2026_10_24_demo30_manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
payload=json.dumps({table:db[table] for table in order},separators=(',',':'))
sql="""-- USER-APPROVED, INSERT-ONLY DATA SEED. No DDL, UPDATE, DELETE, UPSERT, RLS or trigger changes.
-- Every row belongs to [ALZHEN_DEMO30_V1], UUID namespace e6301024-*.
-- Fictional customers/drivers/plates; road-snapped demo coordinates, not real premises.
-- No auth users, tracking consent/sessions/telemetry, Storage images or proof-of-delivery documents.
-- Full transaction; rerun validates the existing complete graph and does not overwrite anything.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $demo30$
DECLARE
 payload jsonb := $payload$"""+payload+"""$payload$::jsonb;
 reviewer uuid := '"""+reviewer+"""';
 table_name text; names text; expected integer; occupied integer; already_complete boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('ALZHEN_DEMO30_V1'));
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=reviewer AND role='ADMIN') THEN RAISE EXCEPTION 'Coordinate reviewer is not the verified Admin'; END IF;
 IF (SELECT count(*) FROM public.tms_dropdown_options WHERE field_key='trip_status' AND option_value IN('PLANNED','IN_PROGRESS','COMPLETED') AND active)<>3 THEN RAISE EXCEPTION 'Required existing trip statuses unavailable'; END IF;
 already_complete := (SELECT count(*)=30 FROM public.trips WHERE id::text LIKE 'e6301024-%' AND remarks LIKE '%[ALZHEN_DEMO30_V1]%');
 FOR table_name IN SELECT jsonb_object_keys(payload) LOOP
   expected:=jsonb_array_length(payload->table_name);
   EXECUTE format('SELECT count(*) FROM public.%I WHERE id::text LIKE ''e6301024-%%''',table_name) INTO occupied;
   IF already_complete THEN
     IF occupied<>expected THEN RAISE EXCEPTION 'Existing demo graph is incomplete in %; nothing overwritten',table_name; END IF;
     EXECUTE format('SELECT count(*) FROM public.%I t JOIN jsonb_array_elements($1) r ON t.id=(r->>''id'')::uuid',table_name) INTO occupied USING payload->table_name;
     IF occupied<>expected THEN RAISE EXCEPTION 'Demo IDs differ in %; nothing overwritten',table_name; END IF;
   ELSIF occupied<>0 THEN RAISE EXCEPTION 'Reserved demo namespace occupied in %; nothing overwritten',table_name;
   END IF;
 END LOOP;
 IF already_complete THEN
   IF EXISTS(SELECT 1 FROM public.trips t JOIN jsonb_array_elements(payload->'trips') r ON t.id=(r->>'id')::uuid WHERE t.dispatch_number IS DISTINCT FROM r->>'dispatch_number' OR t.remarks NOT LIKE '%[ALZHEN_DEMO30_V1]%') THEN RAISE EXCEPTION 'Demo identity changed'; END IF;
   RAISE NOTICE 'All 30 demo graphs already exist; no inserts or updates performed';
   RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM public.trips t JOIN jsonb_array_elements(payload->'trips') r ON t.dispatch_number=r->>'dispatch_number' OR t.trip_reference=r->>'trip_reference') THEN RAISE EXCEPTION 'Demo dispatch/reference collides with an existing trip'; END IF;
 FOREACH table_name IN ARRAY ARRAY["""+','.join("'"+table+"'" for table in order)+"""] LOOP
   SELECT string_agg(quote_ident(k),',' ORDER BY k) INTO names FROM jsonb_object_keys(payload->table_name->0) k;
   EXECUTE format('INSERT INTO public.%1$I (%2$s) SELECT %2$s FROM jsonb_populate_recordset(NULL::public.%1$I,$1)',table_name,names) USING payload->table_name;
 END LOOP;
 IF (SELECT count(*) FROM public.trips WHERE id::text LIKE 'e6301024-%')<>30 THEN RAISE EXCEPTION 'Expected exactly 30 demo trips'; END IF;
 IF EXISTS(SELECT 1 FROM public.trip_line_items l LEFT JOIN public.trip_cargo_allocations a ON a.trip_line_item_id=l.id WHERE l.id::text LIKE 'e6301024-%' GROUP BY l.id,l.quantity,l.cbm HAVING sum(a.quantity) IS DISTINCT FROM l.quantity OR sum(a.allocated_cbm) IS DISTINCT FROM l.cbm) THEN RAISE EXCEPTION 'Cargo allocation totals differ'; END IF;
 IF EXISTS(SELECT 1 FROM public.trip_cargo_allocations a JOIN public.trip_line_items l ON l.id=a.trip_line_item_id LEFT JOIN public.trip_assignment_stops s ON s.assignment_id=a.assignment_id AND s.trip_stop_id=l.trip_stop_id WHERE a.id::text LIKE 'e6301024-%' AND s.id IS NULL) THEN RAISE EXCEPTION 'Cargo stop not assigned to responsible truck'; END IF;
 IF EXISTS(SELECT 1 FROM public.trip_stops s JOIN public.trip_line_items l ON l.trip_stop_id=s.id WHERE s.id::text LIKE 'e6301024-%' GROUP BY s.id,s.quantity,s.total_cbm HAVING sum(l.quantity)<>s.quantity OR sum(l.cbm)<>s.total_cbm) THEN RAISE EXCEPTION 'Stop totals differ from cargo'; END IF;
END;
$demo30$;
COMMIT;
"""
(out/'2026_10_24_demo30_seed.sql').write_text(sql,encoding='utf-8')
print(json.dumps({k:manifest[k] for k in ['counts','statuses','multiTruckTrips','expectedGPSMarkers']},indent=2))
