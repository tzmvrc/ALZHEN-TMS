import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('delivery transactions enforce assignment scope, geofences, quantities, idempotency and audited review',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;');
  const schema=JSON.parse(await readFile(new URL('./fixtures/delivery-companion-schema.json',import.meta.url),'utf8'));
  for(const table of schema)await db.exec(`create table public.${table.name} (${table.columns}${table.constraints?.length?', '+table.constraints.join(', '):''})`);
  await db.exec(await readFile(new URL('../migrations/2026_10_25_delivery_companion.sql',import.meta.url),'utf8')).catch((e:any)=>{throw Error([e.message,e.where,e.position].join(' / '));});
  await db.exec(await readFile(new URL('../migrations/2026_10_25_delivery_companion_integrity.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../migrations/2026_10_25_delivery_review_order.sql',import.meta.url),'utf8'));
  await db.exec(`insert into profiles(id,role) values('${id(1)}','ADMIN'),('${id(2)}','TRUCKER'),('${id(3)}','TRUCKER');
   insert into drivers(id,profile_id,first_name,last_name) values('${id(12)}','${id(2)}','Fixture','Driver A'),('${id(13)}','${id(3)}','Fixture','Driver B');
   insert into warehouses(id,code,name,latitude,longitude,location_verified) values('${id(20)}','FIXTURE','Fixture origin',14.7,121.0,true);
   insert into customer_stores(id,customer_id,name,latitude,longitude,location_verified) values('${id(21)}','${id(22)}','Fixture stop',14.6,121.1,true);
   insert into trips(id,dispatch_number,warehouse_id,status) values('${id(30)}','ISOLATED-DELIVERY','${id(20)}','PLANNED');
   insert into trip_stops(id,trip_id,store_id,stop_sequence,delivery_status) values('${id(31)}','${id(30)}','${id(21)}',1,'PENDING');
   insert into trip_truck_assignments(id,trip_id,driver_id,stop_scope) values('${id(40)}','${id(30)}','${id(12)}','ALL'),('${id(41)}','${id(30)}','${id(13)}','ALL');
   insert into trip_line_items(id,trip_id,trip_stop_id,quantity,cbm) values('${id(50)}','${id(30)}','${id(31)}',15,3);
   insert into trip_cargo_allocations(id,trip_id,assignment_id,trip_line_item_id,quantity,allocated_cbm) values('${id(60)}','${id(30)}','${id(40)}','${id(50)}',10,2),('${id(61)}','${id(30)}','${id(41)}','${id(50)}',5,1);`);
  let serial=100;
  const call=async(input:Record<string,unknown>,actor=id(2),assignment=id(40),key=id(++serial))=>(await db.query<{event:any}>('select submit_delivery_event_v1($1,$2,$3,$4::jsonb) event',[actor,assignment,key,JSON.stringify(input)])).rows[0].event;
  const gps=(lat=14.7,lng=121)=>({latitude:lat,longitude:lng,accuracy_meters:20,captured_at:new Date().toISOString()});
  await assert.rejects(call({type:'WAREHOUSE_ARRIVAL',gps:gps()},id(3)),/not available/);
  await assert.rejects(call({type:'WAREHOUSE_ARRIVAL',gps:gps(15,122)}),/arrival photo/);
  const input={type:'WAREHOUSE_ARRIVAL',gps:gps()},key=id(++serial);
  const arrival=await call(input,id(2),id(40),key);assert.equal(arrival.verification_method,'GPS_VERIFIED');
  assert.equal((await call(input,id(2),id(40),key)).id,arrival.id);
  await assert.rejects(call({...input,remarks:'Changed'},id(2),id(40),key),/reused/);
  await assert.rejects(call({type:'LOADING_FINISHED'}),/preceding/);
  await call({type:'LOADING_STARTED'});await call({type:'LOADING_FINISHED'});await call({type:'WAREHOUSE_DEPARTURE'});
  await call({type:'CUSTOM_STATUS',title:'Traffic',remarks:'Slow traffic on the delivery route',gps:gps()});
  assert.equal((await db.query<any>('select count(*)::int n from trip_events where event_type=\'ARRIVED\'')).rows[0].n,0);
  await call({type:'ARRIVED',stop_id:id(31),gps:gps(14.6,121.1)});
  await call({type:'UNLOADING_STARTED',stop_id:id(31)});
  await assert.rejects(call({type:'PARTIAL_UNLOAD',stop_id:id(31),quantities:[{allocation_id:id(61),quantity:1}]}),/does not belong/);
  const partial={type:'PARTIAL_UNLOAD',stop_id:id(31),quantities:[{allocation_id:id(60),quantity:8}]},pk=id(++serial);
  await call(partial,id(2),id(40),pk);await call(partial,id(2),id(40),pk);
  await assert.rejects(call({type:'PARTIAL_UNLOAD',stop_id:id(31),quantities:[{allocation_id:id(60),quantity:3}]}),/remaining/);
  await assert.rejects(call({type:'PARTIAL_UNLOAD',stop_id:id(31),quantities:[{allocation_id:id(60),quantity:-1}]}),/remaining/);
  await assert.rejects(call({type:'UNLOADING_FINISHED',stop_id:id(31)}),/remaining/);
  await call({type:'PARTIAL_UNLOAD',stop_id:id(31),quantities:[{allocation_id:id(60),quantity:2}]});
  await call({type:'UNLOADING_FINISHED',stop_id:id(31)});await call({type:'STOP_DEPARTURE',stop_id:id(31)});await call({type:'ASSIGNMENT_COMPLETED'});
  assert.equal(Number((await db.query<any>('select sum(quantity) n from trip_delivery_quantities')).rows[0].n),10);
  assert.notEqual((await db.query<any>('select delivery_status from trip_stops')).rows[0].delivery_status,'COMPLETED');
  assert.notEqual((await db.query<any>('select status from trips')).rows[0].status,'COMPLETED');
  await assert.rejects(db.exec(`update trip_cargo_allocations set quantity=9 where id='${id(60)}'`),/reduced/);
  await db.exec(`insert into trip_images(id,trip_id,assignment_id,uploaded_by,storage_path,file_name,delivery_upload_state) values('${id(70)}','${id(30)}','${id(41)}','${id(3)}','fixture/evidence.jpg','Fixture evidence','PENDING');`);
  await db.exec(`update trip_line_items set dr_number='FIXTURE-DR' where id='${id(50)}'; insert into trip_images(id,trip_id,assignment_id,trip_stop_id,uploaded_by,storage_path,file_name,delivery_upload_state) values('${id(71)}','${id(30)}','${id(41)}','${id(31)}','${id(3)}','fixture/pod.jpg','Fixture POD','READY'),('${id(72)}','${id(30)}','${id(41)}','${id(31)}','${id(3)}','fixture/backload.jpg','Fixture backload','READY'),('${id(73)}','${id(30)}','${id(41)}','${id(31)}','${id(3)}','fixture/offload.jpg','Fixture offload','READY');`);
  await assert.rejects(call({type:'POD_SUBMITTED',stop_id:id(31),dr_number:'WRONG',attachments:[id(71)]},id(3),id(41)),/DR belonging/);
  const pod=await call({type:'POD_SUBMITTED',stop_id:id(31),dr_number:'FIXTURE-DR',attachments:[id(71)],ocr_text:'Manually reviewed fixture',ocr_confidence:40},id(3),id(41));
  assert.equal(pod.event_type,'POD_SUBMITTED');
  assert.notEqual((await db.query<any>('select delivery_status from trip_stops')).rows[0].delivery_status,'COMPLETED');
  for(const [type,photoId,table] of [['BACKLOAD_REPORTED',72,'backload_items'],['OFFLOAD_REPORTED',73,'offload_items']] as const){
   const input={type,stop_id:id(31),remarks:'Isolated fixture evidence only',dr_number:'FIXTURE-DR',quantities:[{allocation_id:id(61),quantity:1}],attachments:[id(photoId)]},key=id(++serial);
   const report=await call(input,id(3),id(41),key);assert.ok(report.delivery_metadata.report_id);
   await call(input,id(3),id(41),key);assert.equal((await db.query<any>(`select count(*)::int n from ${table}`)).rows[0].n,1);
  }
  await assert.rejects(db.exec(`delete from trip_images where id='${id(71)}'`),/retained/);
  const photoInput={type:'WAREHOUSE_ARRIVAL',attachments:[id(70)]};
  await assert.rejects(call(photoInput,id(3),id(41)),/uploaded successfully/);
  await db.exec(`update trip_images set delivery_upload_state='READY' where id='${id(70)}'`);
  const photo=await call(photoInput,id(3),id(41));assert.equal(photo.verification_method,'PHOTO_PENDING_REVIEW');
  await call({type:'LOADING_STARTED'},id(3),id(41)); // no Admin approval gate
  await assert.rejects(db.query('select review_delivery_event_v1($1,$2,0,$3,$4)',[id(3),photo.id,'CONFIRM_EVIDENCE','Fixture checked']),/Only an active Admin/);
  await db.query('select review_delivery_event_v1($1,$2,0,$3,$4)',[id(1),photo.id,'CONFIRM_EVIDENCE','Fixture photo checked']);
  await db.query('select review_delivery_event_v1($1,$2,1,$3,$4,$5)',[id(1),photo.id,'CORRECT_TIME','Clock reviewed with dispatcher',new Date(Date.now()-60000).toISOString()]);
  assert.equal((await db.query<any>('select count(*)::int n from audit_logs')).rows[0].n,2);
  await assert.rejects(db.query('select review_delivery_event_v1($1,$2,2,$3,$4,$5)',[id(1),photo.id,'CORRECT_TIME','Invalid milestone ordering',new Date(Date.now()+60000).toISOString()]),/milestone order/);
  await assert.rejects(db.query('select set_delivery_geofence_v1($1,$2,$3,$4)',[id(3),'warehouses',id(20),900]),/Only Admin/);
  await db.query('select set_delivery_geofence_v1($1,$2,$3,$4)',[id(1),'warehouses',id(20),900]);
  assert.equal((await db.query<any>('select arrival_radius_meters from warehouses')).rows[0].arrival_radius_meters,900);
  assert.equal((await db.query<any>('select old_data->>\'event_time\' original from audit_logs where action=\'DELIVERY_CORRECT_TIME\'')).rows[0].original,photo.event_time);
 }finally{await db.close();}
});
