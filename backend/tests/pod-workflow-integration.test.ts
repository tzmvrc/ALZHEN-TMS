import test from 'node:test';
import assert from 'node:assert/strict';
import {podIntegrationFixture} from './fixtures/pod-integration-fixture.js';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('live writer plus real operational triggers: multi-DR rejection, replacement and approval through delivery completion',async()=>{
 const db=await podIntegrationFixture();
 try{
  await db.exec(`insert into profiles(id,role,first_name) values('${id(1)}','ADMIN','Reviewer'),('${id(2)}','TRUCKER','Owner'),('${id(3)}','TRUCKER','Other');insert into drivers(id,profile_id,first_name,last_name) values('${id(12)}','${id(2)}','Fixture','Owner'),('${id(13)}','${id(3)}','Fixture','Other');insert into trips(id,dispatch_number,status) values('${id(20)}','ISOLATED-POD','PLANNED'),('${id(200)}','UNRELATED','PLANNED');insert into trip_stops(id,trip_id,stop_sequence,dr_number,delivery_status) values('${id(21)}','${id(20)}',1,'DR-A','PENDING'),('${id(22)}','${id(20)}',2,'DR-C','PENDING'),('${id(201)}','${id(200)}',1,'DR-A','PENDING');insert into trip_truck_assignments(id,trip_id,driver_id,stop_scope) values('${id(30)}','${id(20)}','${id(12)}','ALL'),('${id(31)}','${id(20)}','${id(13)}','ALL'),('${id(230)}','${id(200)}','${id(13)}','ALL');insert into trip_line_items(id,trip_id,trip_stop_id,quantity,cbm,dr_number,customer_model) values('${id(40)}','${id(20)}','${id(21)}',20,2,'DR-A','TEST-A'),('${id(42)}','${id(20)}','${id(21)}',5,1,'DR-B','TEST-B'),('${id(44)}','${id(20)}','${id(22)}',2,1,'DR-C','TEST-C');insert into trip_cargo_allocations(id,trip_id,assignment_id,trip_line_item_id,quantity,allocated_cbm) values('${id(41)}','${id(20)}','${id(30)}','${id(40)}',10,1),('${id(43)}','${id(20)}','${id(30)}','${id(42)}',5,1),('${id(45)}','${id(20)}','${id(30)}','${id(44)}',2,1),('${id(46)}','${id(20)}','${id(31)}','${id(40)}',10,1);create table billings(id uuid primary key,amount numeric);insert into billings values('${id(900)}',123.45);`);
  // Older line items may inherit their DR from the exact delivery stop.
  await db.exec(`update trip_line_items set dr_number=null where id='${id(40)}'`);
  let serial=1000;
  const query=async(sql:string,params:unknown[]=[])=> (await db.query<any>(sql,params)).rows;
  const snapshot=async()=>JSON.stringify({cargo:await query('select * from trip_cargo_allocations order by id'),billing:await query('select * from billings order by id')});const before=await snapshot();
  const save=async(input:Record<string,unknown>,key=id(++serial),assignment=id(30),actor=id(2),replacement=false)=>(await query(`select ${replacement?'submit_pod_replacement_v1':'submit_delivery_event_v1'}($1,$2,$3,$4::jsonb) result`,[actor,assignment,key,JSON.stringify(input)]))[0].result;
  const photo=async(stop=21,assignment=30,actor=2)=>{const asset=id(++serial);await db.query(`insert into trip_images(id,trip_id,trip_stop_id,assignment_id,uploaded_by,kind,storage_path,file_name,delivery_upload_state) values($1,$2,$3,$4,$5,'photo',$6,'synthetic.png','READY')`,[asset,id(20),id(stop),id(assignment),id(actor),'isolated/'+asset]);await db.query(`insert into storage.objects(bucket_id,name) values('trip-images',$1)`,['isolated/'+asset]);return asset;};
  const decide=async(receipt:string,decision:string,reason='',key=id(++serial),stop=21)=>(await query('select review_pod_submission_v1($1,$2,$3,$4,$5,0,0,$6,$7,$8::jsonb) result',[id(1),key,id(20),id(stop),receipt,decision,reason,JSON.stringify({dr_number:(await query('select dr_number from trip_images where id=$1',[receipt]))[0].dr_number})]))[0].result;
  const pending=async()=>await query(`select id from trip_events where assignment_id=$1 and delivery_metadata->'pod_replacement_request' is not null and delivery_metadata#>>'{pod_replacement_request,resolved_by}' is null`,[id(30)]);
  const gps={latitude:14.7,longitude:121,accuracy_meters:10,captured_at:new Date().toISOString()},device_time=new Date().toISOString();
  await save({type:'WAREHOUSE_ARRIVAL',gps,device_time});for(const type of ['LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE'])await save({type});
  const firstPhoto=await photo();await assert.rejects(save({type:'POD_SUBMITTED',stop_id:id(21),dr_number:'DR-A',attachments:[firstPhoto]}),/preceding/);
  await save({type:'ARRIVED',stop_id:id(21),gps,device_time});const otherPage=await photo();
  const original=await save({type:'POD_SUBMITTED',stop_id:id(21),dr_number:'DR-A',attachments:[firstPhoto,otherPage],ocr_text:'DR Number: DR-A\nModel Codes: TEST-A\nModel Quantities: {"TEST-A":3}\n--- Scanned text ---\nSynthetic'});
  const primary=(await query('select id from trip_images where delivery_event_id=$1 order by display_order,created_at,id',[original.id]))[0].id;
  const rejectKey=id(++serial);await decide(primary,'REJECTED','Blurred receipt',rejectKey);await decide(primary,'REJECTED','Blurred receipt',rejectKey);assert.equal((await pending()).length,1);
  assert.equal((await query("select * from admin_notifications where notification_type='pod_rejected'")).length,1);
  await assert.rejects(save({type:'UNLOADING_STARTED',stop_id:id(21)}),/required POD/);
  const replacementPhoto=await photo(),replacementInput={type:'POD_SUBMITTED',stop_id:id(21),dr_number:'DR-A',attachments:[replacementPhoto],replaces_receipt_id:primary},replacementKey=id(++serial);
  await assert.rejects(save({...replacementInput,dr_number:'WRONG-DR'},id(++serial),id(30),id(2),true),(error:any)=>error.code==='P0409');
  const replacement=await save(replacementInput,replacementKey,id(30),id(2),true);assert.equal((await save(replacementInput,replacementKey,id(30),id(2),true)).id,replacement.id);assert.equal((await pending()).length,0);
  await decide(replacementPhoto,'REJECTED','Missing signature');assert.equal((await pending()).length,1);
  const finalPhoto=await photo();await save({...replacementInput,attachments:[finalPhoto],replaces_receipt_id:replacementPhoto},id(++serial),id(30),id(2),true);await decide(finalPhoto,'APPROVED');assert.equal((await pending()).length,0);
  // Multiple DRs at one stop must be independently approvable, even after DR-A has a ledger row.
  const bPhoto=await photo();await save({type:'POD_SUBMITTED',stop_id:id(21),dr_number:'DR-B',attachments:[bPhoto]});await decide(bPhoto,'APPROVED');
  assert.equal((await query('select * from pod_records order by dr_number')).length,2);assert.equal(await snapshot(),before);assert.equal((await query('select * from trip_delivery_quantities')).length,0);
  await save({type:'UNLOADING_STARTED',stop_id:id(21)});await save({type:'UNLOADING_FINISHED',stop_id:id(21)});await save({type:'STOP_DEPARTURE',stop_id:id(21)});
  assert.equal((await query('select * from trip_delivery_quantities where allocation_id=$1',[id(41)]))[0].quantity,'10');
  await save({type:'ARRIVED',stop_id:id(22),gps:{...gps,captured_at:new Date().toISOString()},device_time:new Date().toISOString()});const cPhoto=await photo(22);await save({type:'POD_SUBMITTED',stop_id:id(22),dr_number:'DR-C',attachments:[cPhoto]});await save({type:'UNLOADING_STARTED',stop_id:id(22)});await save({type:'UNLOADING_FINISHED',stop_id:id(22)});
  await save({type:'STOP_DEPARTURE',stop_id:id(22)});await decide(cPhoto,'APPROVED','',id(++serial),22);
  assert.equal((await query("select * from trip_events where assignment_id=$1 and event_type='ASSIGNMENT_COMPLETED'",[id(30)])).length,1);
  assert.equal((await query('select * from trip_events where assignment_id in ($1,$2)',[id(31),id(230)])).length,0);assert.equal(await snapshot(),before);
  assert.equal((await query('select pod_review_status from trip_images where id=$1',[primary]))[0].pod_review_status,'REJECTED');
  assert.equal((await query('select * from pod_review_events')).length,5);assert.equal((await query("select * from admin_notifications where notification_type in ('pod_approved','pod_rejected')")).length,5);
  assert.ok((await query("select * from admin_notifications where notification_type in ('pod_approved','pod_rejected')")).every(n=>n.recipient_profile_id===id(2)));
 }finally{await db.close();}
});
