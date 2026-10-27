import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('arrival-only GPS, offline capture, assignment stop order and completion are enforced in SQL',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 await db.exec('create table pod_records(id uuid primary key,trip_id uuid,pod_status text);');
 const schema=JSON.parse(await readFile(new URL('./fixtures/delivery-companion-schema.json',import.meta.url),'utf8'));
 for(const table of schema)await db.exec(`create table public.${table.name} (${table.columns}${table.constraints?.length?', '+table.constraints.join(', '):''})`);
 for(const file of ['2026_10_25_delivery_companion.sql','2026_10_25_delivery_companion_integrity.sql','2026_10_27_delivery_arrival_gps_policy.sql'])await db.exec(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8'));
 await db.exec(`insert into profiles(id,role) values('${id(1)}','TRUCKER'),('${id(2)}','TRUCKER');insert into drivers(id,profile_id,first_name,last_name) values('${id(3)}','${id(1)}','Fixture','One'),('${id(4)}','${id(2)}','Fixture','Two');insert into trips(id,dispatch_number,status) values('${id(5)}','ISOLATED','PLANNED');insert into trip_truck_assignments(id,trip_id,driver_id,stop_scope) values('${id(6)}','${id(5)}','${id(3)}','ALL'),('${id(7)}','${id(5)}','${id(4)}','ALL');insert into customer_stores(id,customer_id,name) values('${id(20)}','${id(21)}','Fixture');insert into trip_stops(id,trip_id,store_id,stop_sequence,delivery_status) values('${id(8)}','${id(5)}','${id(20)}',1,'PENDING'),('${id(9)}','${id(5)}','${id(20)}',2,'PENDING');`);
 let serial=100;const call=async(input:any,key=id(++serial),actor=id(1),assignment=id(6))=>(await db.query<any>('select public.submit_delivery_event_v1($1,$2,$3,$4::jsonb) result',[actor,assignment,key,JSON.stringify(input)])).rows[0].result;
 const capture=new Date().toISOString(),gps={latitude:14.7,longitude:121,accuracy_meters:10,captured_at:capture};
 await assert.rejects(call({type:'WAREHOUSE_ARRIVAL',device_time:capture}),/GPS is required/);
 await assert.rejects(call({type:'LOADING_STARTED'}),/preceding/);
 const key=id(++serial),arrival={type:'WAREHOUSE_ARRIVAL',device_time:capture,gps};await call(arrival,key);await call(arrival,key); // Photo is optional, even with no configured warehouse.
 assert.equal((await db.query<any>(`select count(*)::int n from trip_events where event_type='WAREHOUSE_ARRIVAL'`)).rows[0].n,1);
 await assert.rejects(call({type:'WAREHOUSE_ARRIVAL',device_time:capture,gps},id(++serial),id(2),id(6)),/not available/);
 for(const type of ['LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE'])await call({type});
 assert.equal((await db.query<any>(`select count(*)::int n from trip_events where event_type='IN_TRANSIT'`)).rows[0].n,0);
 await assert.rejects(call({type:'ARRIVED',stop_id:id(9),device_time:capture,gps}),/preceding assigned stop/);
 await assert.rejects(call({type:'ARRIVED',stop_id:id(8)}),/GPS is required/);
 const old=new Date(Date.now()-3600000).toISOString();await call({type:'ARRIVED',stop_id:id(8),device_time:old,gps:{...gps,captured_at:old}});
 for(const type of ['UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE'])await call({type,stop_id:id(8)});
 await assert.rejects(call({type:'ASSIGNMENT_COMPLETED'}),/depart all/);
 await call({type:'ARRIVED',stop_id:id(9),device_time:capture,gps});
 for(const type of ['UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE'])await call({type,stop_id:id(9)});
 await call({type:'ASSIGNMENT_COMPLETED'});
 assert.equal((await db.query<any>('select count(*)::int n from pod_records')).rows[0].n,0,'Unloading/completion must not create POD approval');
 }finally{await db.close();}
});
