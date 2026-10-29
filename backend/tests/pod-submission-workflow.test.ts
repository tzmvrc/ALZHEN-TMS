import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const migration=(file:string)=>readFile(new URL('../migrations/'+file,import.meta.url),'utf8');
test('submission decisions, rejection requests, replacement chains and notifications are atomic and scoped',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema storage;create table storage.buckets(id text primary key,public boolean);create table storage.objects(bucket_id text,name text);insert into storage.buckets values('trip-images',false);`);
  const schema=JSON.parse(await readFile(new URL('./fixtures/delivery-companion-schema.json',import.meta.url),'utf8'));
  for(const table of schema)await db.exec(`create table public.${table.name} (${table.columns}${table.constraints?.length?', '+table.constraints.join(', '):''})`);
  await db.exec(`create table pod_records(id uuid primary key default gen_random_uuid(),trip_id uuid,trip_stop_id uuid,dr_number text,pod_status text,pod_received_at timestamptz);create table admin_notifications(id uuid primary key,recipient_profile_id uuid,actor_profile_id uuid,notification_type text constraint admin_notifications_notification_type_check check(notification_type in ('report_mention')),reference_type text,reference_id uuid,message text,metadata jsonb,event_key uuid,unique(recipient_profile_id,event_key));`);
  for(const file of ['2026_10_25_delivery_companion.sql','2026_10_25_delivery_companion_integrity.sql','2026_10_27_delivery_arrival_gps_policy.sql'])await db.exec(await migration(file));
  // The fixture already contains the review columns; use the existing production review function/audit DDL.
  const review=await migration('2026_10_31_proposed_pod_review.sql');
  await db.exec('BEGIN;'+review.slice(review.indexOf('CREATE TABLE public.pod_review_events'),review.indexOf('-- Recovery:')));
  await db.exec(await migration('2026_11_04_proposed_pod_submission_review.sql'));
  await db.exec(await migration('2026_11_04_proposed_pod_submission_review.sql')); // Safe migration replay.
  await db.exec(`insert into profiles(id,role,first_name) values('${id(1)}','ADMIN','Reviewer'),('${id(2)}','TRUCKER','Owner'),('${id(3)}','TRUCKER','Other');insert into drivers(id,profile_id,first_name,last_name) values('${id(12)}','${id(2)}','Fixture','Owner'),('${id(13)}','${id(3)}','Fixture','Other');insert into trips(id,dispatch_number,status) values('${id(20)}','ISOLATED-POD','IN_PROGRESS');insert into trip_stops(id,trip_id,stop_sequence,dr_number,delivery_status) values('${id(21)}','${id(20)}',1,'DR-A','PENDING'),('${id(22)}','${id(20)}',2,'DR-B','PENDING');insert into trip_truck_assignments(id,trip_id,driver_id,stop_scope) values('${id(30)}','${id(20)}','${id(12)}','ALL'),('${id(31)}','${id(20)}','${id(13)}','ALL');insert into trip_line_items(id,trip_id,trip_stop_id,quantity,cbm,dr_number,customer_model) values('${id(40)}','${id(20)}','${id(21)}',10,1,'DR-A','TEST-A');insert into trip_cargo_allocations(id,trip_id,assignment_id,trip_line_item_id,quantity,allocated_cbm) values('${id(41)}','${id(20)}','${id(30)}','${id(40)}',10,1);insert into trip_events(id,trip_id,assignment_id,trip_stop_id,event_type,event_time,recorded_by) values('${id(50)}','${id(20)}','${id(30)}','${id(21)}','POD_SUBMITTED',now(),'${id(2)}'),('${id(51)}','${id(20)}','${id(31)}','${id(21)}','POD_SUBMITTED',now(),'${id(3)}'),('${id(52)}','${id(20)}','${id(30)}','${id(22)}','POD_SUBMITTED',now(),'${id(2)}');`);
  for(const [image,event,assignment,stop,actor,dr] of [[60,50,30,21,2,'DR-A'],[61,50,30,21,2,'DR-A'],[62,51,31,21,3,'DR-A'],[63,52,30,22,2,'DR-B']] as const){await db.query(`insert into trip_images(id,trip_id,trip_stop_id,assignment_id,delivery_event_id,uploaded_by,kind,storage_path,file_name,dr_number) values($1,$2,$3,$4,$5,$6,'receipt',$7,'fixture.png',$8);`,[id(image),id(20),id(stop),id(assignment),id(event),id(actor),'fixture/'+image,dr]);}
  await db.exec(`insert into storage.objects select 'trip-images',storage_path from trip_images;`);
  let serial=100;
  const decide=async(receipt:number,decision:string,reason:string,key=id(++serial),stop=21)=> (await db.query<any>('select review_pod_submission_v1($1,$2,$3,$4,$5,0,0,$6,$7,$8::jsonb) result',[id(1),key,id(20),id(stop),id(receipt),decision,reason,JSON.stringify({dr_number:stop===21?'DR-A':'DR-B'})])).rows[0].result;
  const count=async(table:string)=>(await db.query<any>(`select count(*)::int n from ${table}`)).rows[0].n;
  await assert.rejects(decide(60,'REJECTED',' '),/reason/);
  await assert.rejects(decide(61,'REJECTED','Wrong primary'),/primary/);
  assert.equal(await count('pod_review_events'),0);
  const key=id(++serial),rejected=await decide(60,'REJECTED','Photo blurred',key);
  assert.deepEqual(await decide(60,'REJECTED','Photo blurred',key),rejected);
  assert.equal(await count('pod_review_events'),1);assert.equal(await count('admin_notifications'),1);
  const images=(await db.query<any>('select id,pod_review_status from trip_images order by id')).rows;
  assert.deepEqual(images.map(r=>r.pod_review_status),['REJECTED','REJECTED','PENDING','PENDING']);
  const notice=(await db.query<any>('select * from admin_notifications')).rows[0];assert.equal(notice.recipient_profile_id,id(2));assert.equal(notice.metadata.assignment_id,id(30));assert.match(notice.message,/DR DR-A.*Photo blurred/);
  await assert.rejects(decide(60,'APPROVED',''),/prior decision/);
  // A rejected submission cannot be hidden by an unrelated plain POD submission.
  await assert.rejects(db.query('select submit_delivery_event_v1($1,$2,$3,$4::jsonb)',[id(2),id(30),id(++serial),JSON.stringify({type:'POD_SUBMITTED',stop_id:id(21),dr_number:'DR-A',attachments:[id(61)]})]),/Evidence must/);
  for(const n of [70,71,72])await db.query(`insert into trip_images(id,trip_id,trip_stop_id,assignment_id,uploaded_by,kind,storage_path,file_name) values($1,$2,$3,$4,$5,'photo',$6,'replacement.png')`,[id(n),id(20),id(21),id(30),id(2),'fixture/'+n]);
  await db.exec(`insert into storage.objects select 'trip-images',storage_path from trip_images where id in ('${id(70)}','${id(71)}','${id(72)}');`);
  await assert.rejects(db.query('select submit_delivery_event_v1($1,$2,$3,$4::jsonb)',[id(2),id(30),id(++serial),JSON.stringify({type:'POD_SUBMITTED',stop_id:id(21),dr_number:'DR-A',attachments:[id(72)]})]),/Admin-requested replacement/);
  await db.exec(`insert into trip_events(trip_id,assignment_id,trip_stop_id,event_type,event_time,recorded_by) values('${id(20)}','${id(30)}','${id(21)}','UNLOADING_FINISHED',now(),'${id(2)}');`);
  await assert.rejects(db.query('select submit_delivery_event_v1($1,$2,$3,$4::jsonb)',[id(2),id(30),id(++serial),JSON.stringify({type:'STOP_DEPARTURE',stop_id:id(21)})]),/Admin-requested replacement/);
  const replacementBody={type:'POD_SUBMITTED',stop_id:id(21),dr_number:'DR-A',replaces_receipt_id:id(60),attachments:[id(70),id(71)],ocr_text:'Submitted original replacement data'};
  const replace=async(body:object,key:string,actor=id(2),assignment=id(30))=>(await db.query<any>('select submit_pod_replacement_v1($1,$2,$3,$4::jsonb) result',[actor,assignment,key,JSON.stringify(body)])).rows[0].result;
  await assert.rejects(replace(replacementBody,id(++serial),id(3)),/not available/);
  await assert.rejects(replace({...replacementBody,stop_id:id(22)},id(++serial)),/no longer outstanding/);
  const replacementKey=id(++serial),replacement=await replace(replacementBody,replacementKey);
  assert.equal((await replace(replacementBody,replacementKey)).id,replacement.id);
  assert.equal(replacement.delivery_metadata.replaces_receipt_id,id(60));
  await assert.rejects(replace({...replacementBody,attachments:[id(72)]},id(++serial)),/no longer outstanding/);
  const requests=async()=>(await db.query<any>(`select delivery_metadata from trip_events where delivery_metadata->'pod_replacement_request' is not null and delivery_metadata#>>'{pod_replacement_request,resolved_by}' is null`)).rows;
  assert.equal((await requests()).length,0);
  await decide(70,'REJECTED','Still blurred');assert.equal((await requests()).length,1);
  const second=await replace({...replacementBody,replaces_receipt_id:id(70),attachments:[id(72)]},id(++serial));assert.equal((await requests()).length,0);
  await decide(72,'APPROVED','');await assert.rejects(decide(72,'APPROVED',''),/prior decision/);
  assert.equal(second.delivery_metadata.replaces_receipt_id,id(70));assert.equal(await count('pod_review_events'),3);assert.equal(await count('admin_notifications'),3);
  assert.equal((await db.query<any>(`select quantity from trip_cargo_allocations where id='${id(41)}'`)).rows[0].quantity,'10');assert.equal(await count('trip_delivery_quantities'),0);
  assert.equal((await db.query<any>(`select pod_review_status from trip_images where id='${id(60)}'`)).rows[0].pod_review_status,'REJECTED');
  await db.exec('set role authenticated');await assert.rejects(db.exec(`select review_pod_submission_v1(null,null,null,null,null,0,0,'REJECTED','x','{}')`),/permission denied/);
 }finally{await db.close();}
});
