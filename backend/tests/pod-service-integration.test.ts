import test from 'node:test';
import assert from 'node:assert/strict';
import {podIntegrationFixture} from './fixtures/pod-integration-fixture.js';
process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='isolated-test';process.env.SUPABASE_ANON_KEY='isolated-test';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('real backend services submit, list, reject, notify, request replacement, replace and approve against isolated PostgreSQL',async()=>{
 const sql=await podIntegrationFixture();
 const {supabaseAdmin:client}=await import('../src/config/supabase.js');
 const {submitDelivery,deliveryWorkspace,deliveryReceipts,deliverySubmission}=await import('../src/services/delivery-workspace.service.js');
 const {decidePodReceipt}=await import('../src/services/pod-review.service.js');
 const {listTripReceipts,saveAdminReceiptText}=await import('../src/services/trip-receipt.service.js');
 const {listNotifications,markNotificationRead}=await import('../src/services/notification.service.js');
 const original={from:client.from,rpc:client.rpc,storage:client.storage.from,flag:process.env.POD_REVIEW_ENABLED};
 const query=async(text:string,params:unknown[]=[])=> (await sql.query<any>(text,params)).rows;
 const identifier=(value:string)=>{if(!/^[a-z_][a-z0-9_]*$/.test(value))throw Error('Invalid fixture identifier');return '"'+value+'"';};
 // Transport adapter only: production service validation and the real SQL RPCs run unchanged.
 client.from=((table:string)=>{
  let fields='*',single=false,head=false,limit=10000,offset=0,update:Record<string,unknown>|null=null;const parameters:unknown[]=[],conditions:string[]=[],orders:string[]=[];
  const bind=(value:unknown)=>{parameters.push(value);return '$'+parameters.length;};
  const q={or:(value:string)=>{assert.equal(value,'delivery_upload_state.eq.READY,delivery_upload_state.is.null');conditions.push("(delivery_upload_state='READY' OR delivery_upload_state IS NULL)");return q;},range:(start:number,end:number)=>{offset=start;limit=end-start+1;return q;},select:(value='*',options?:{head?:boolean})=>{fields=value;head=options?.head??false;return q;},eq:(column:string,value:unknown)=>{conditions.push(column==='assignment.trip_id'?'assignment_id IN (SELECT id FROM trip_truck_assignments WHERE trip_id='+bind(value)+')':identifier(column)+'='+bind(value));return q;},is:(column:string,value:unknown)=>{assert.equal(value,null);conditions.push(identifier(column)+' IS NULL');return q;},in:(column:string,values:unknown[])=>{conditions.push(identifier(column)+' IN ('+values.map(bind).join(',')+')');return q;},order:(column:string,options?:{ascending?:boolean})=>{orders.push(identifier(column)+(options?.ascending===false?' DESC':' ASC'));return q;},limit:(value:number)=>{limit=value;return q;},maybeSingle:()=>{single=true;return q;},update:(value:Record<string,unknown>)=>{update=value;return q;},then:(resolve:any,reject:any)=>{
   const run=async()=>{
    try{
     const name=identifier(table),where=conditions.length?' WHERE '+conditions.join(' AND '):'';
     const assignments=update?Object.entries(update).map(([key,value])=>identifier(key)+'='+bind(value)).join(','):'';
     const rows=await query(update?`UPDATE ${name} SET ${assignments}${where} RETURNING *`:`SELECT * FROM ${name}${where}${orders.length?' ORDER BY '+orders.join(','):''} LIMIT ${limit} OFFSET ${offset}`,parameters);
     if(fields.includes('driver:'))for(const row of rows){row.driver=(await query('select * from drivers where id=$1',[row.driver_id]))[0]??null;row.trip=(await query('select * from trips where id=$1',[row.trip_id]))[0];row.truck=null;row.company=null;}
     if(table==='trip_truck_crew_members')for(const row of rows)row.profile=(await query('select * from profiles where id=$1',[row.profile_id]))[0];
     if(fields.includes('store:'))for(const row of rows)row.store=null;
     if(fields.includes('line:'))for(const row of rows){row.line=(await query('select * from trip_line_items where id=$1',[row.trip_line_item_id]))[0];row.line.product=null;}
     return {data:head?null:single?rows[0]??null:rows,count:rows.length,error:null};
    }catch(error:any){return {data:null,error:{message:error.message,code:error.code}};}
   };return run().then(resolve,reject);
  }};return q;
 }) as typeof client.from;
 client.rpc=(async(name:string,params:Record<string,unknown>)=>{
  try{const signatures:Record<string,string[]>={crew_assignment_access_v1:['p_actor','p_assignment'],submit_delivery_event_v1:['p_actor','p_assignment','p_key','p_input'],submit_pod_replacement_v1:['p_actor','p_assignment','p_key','p_input'],review_pod_submission_v1:['p_actor_id','p_request_id','p_trip_id','p_stop_id','p_receipt_id','p_expected_review_version','p_expected_ocr_version','p_decision','p_reason','p_reviewed_fields','p_pod_record_id']};const keys=signatures[name];assert.ok(keys,'Unexpected external RPC');const values=keys.map(key=>params[key]&&typeof params[key]==='object'?JSON.stringify(params[key]):params[key]);return {data:(await query(`select ${identifier(name)}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) result`,values))[0].result,error:null};}catch(error:any){return {data:null,error:{message:error.message,code:error.code}};}
 }) as typeof client.rpc;
 client.storage.from=(()=>({createSignedUrl:async(path:string)=>{assert.equal((await query('select * from storage.objects where name=$1',[path])).length,1);return {data:{signedUrl:'https://isolated.invalid/'+path},error:null};}})) as typeof client.storage.from;
 try{
  process.env.POD_REVIEW_ENABLED='true';
  await sql.exec(`alter table admin_notifications alter column created_at set default now();insert into profiles(id,role,first_name) values('${id(1)}','ADMIN','Reviewer'),('${id(2)}','TRUCKER','Owner'),('${id(3)}','TRUCKER','Unrelated');insert into drivers(id,profile_id,first_name,last_name) values('${id(12)}','${id(2)}','Fixture','Owner'),('${id(13)}','${id(3)}','Fixture','Other');insert into trips(id,dispatch_number,status) values('${id(20)}','SERVICE-FIXTURE','PLANNED');insert into trip_stops(id,trip_id,stop_sequence,dr_number,delivery_status) values('${id(21)}','${id(20)}',1,'DR-A','PENDING'),('${id(22)}','${id(20)}',2,'DR-B','PENDING');insert into trip_truck_assignments(id,trip_id,driver_id,stop_scope) values('${id(30)}','${id(20)}','${id(12)}','ALL'),('${id(31)}','${id(20)}','${id(13)}','ALL');insert into trip_line_items(id,trip_id,trip_stop_id,quantity,cbm,dr_number,customer_model) values('${id(40)}','${id(20)}','${id(21)}',10,1,'DR-A','TEST-A');insert into trip_cargo_allocations(id,trip_id,assignment_id,trip_line_item_id,quantity,allocated_cbm) values('${id(41)}','${id(20)}','${id(30)}','${id(40)}',10,1);`);
  const actor={id:id(2),role:'TRUCKER'},reviewer={profileId:id(1),role:'ADMIN'};let serial=100;
  const save=(body:Record<string,unknown>,key=id(++serial))=>submitDelivery(actor,id(30),key,body);
  const gps={latitude:14.7,longitude:121,accuracy_meters:10,captured_at:new Date().toISOString()},device_time=new Date().toISOString();
  await save({type:'WAREHOUSE_ARRIVAL',gps,device_time});for(const type of ['LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE'])await save({type});await save({type:'ARRIVED',stop_id:id(21),gps,device_time});
  const photo=async()=>{const asset=id(++serial);await sql.query(`insert into trip_images(id,trip_id,trip_stop_id,assignment_id,uploaded_by,kind,storage_path,file_name,delivery_upload_state) values($1,$2,$3,$4,$5,'photo',$6,'synthetic.png','READY')`,[asset,id(20),id(21),id(30),id(2),'service-fixture/'+asset]);await sql.query(`insert into storage.objects(bucket_id,name) values('trip-images',$1)`,['service-fixture/'+asset]);return asset;};
  const source=await photo(),second=await photo();await save({type:'POD_SUBMITTED',stop_id:id(21),dr_number:'DR-A',attachments:[source,second],ocr_text:'DR Number: DR-A\nModel Codes: TEST-A\nModel Quantities: {"TEST-A":3}\n--- Scanned text ---\nSynthetic receipt'});
  const visible=await listTripReceipts(id(20));assert.equal(visible.length,2);assert.equal(visible[0].uploader_name,'Owner');assert.equal((await deliveryReceipts(actor,id(30))).length,2);
  await assert.rejects(deliveryReceipts({id:id(3),role:'TRUCKER'},id(30)),/not available/);
  const draft={request_id:id(++serial),decision:'REJECTED',reason:'Signature missing',expected_review_version:0,expected_ocr_version:0,reviewed_fields:{dr_number:'DR-A'}};
  const rejection=await decidePodReceipt(reviewer,id(20),source,draft);await decidePodReceipt(reviewer,id(20),source,draft);assert.equal(rejection.receipt.pod_review_status,'REJECTED');await assert.rejects(saveAdminReceiptText(id(20),source,id(1),{ocr_text:'Changed rejected receipt',reviewed:true,expected_version:0}),/read-only/);
  const notifications=await listNotifications(id(2),'TRUCKER');assert.equal(notifications.notifications.length,1);assert.match(notifications.notifications[0].message,/Signature missing/);assert.equal((await listNotifications(id(3),'TRUCKER')).notifications.length,0);
  const workspace=await deliveryWorkspace(actor,id(30));const request=workspace.milestones.find(e=>e.delivery_metadata?.pod_replacement_request)?.delivery_metadata.pod_replacement_request;assert.equal(request.receipt_id,source);assert.equal(request.resolved_by,null);assert.equal(workspace.cargo[0].remaining,10);
  const replacement=await photo(),replacementKey=id(++serial),body={type:'POD_SUBMITTED',stop_id:id(21),dr_number:'DR-A',attachments:[replacement],replaces_receipt_id:source,ocr_text:'Corrected synthetic receipt'};
  const submitted=await save(body,replacementKey);assert.equal((await save(body,replacementKey)).id,submitted.id);assert.equal((await deliverySubmission(actor,id(30),replacementKey))?.id,submitted.id);assert.equal(await deliverySubmission({id:id(3),role:'TRUCKER'},id(30),replacementKey),null);assert.equal(await deliverySubmission(actor,id(31),replacementKey),null);const adminReceipts=await listTripReceipts(id(20));assert.equal(adminReceipts.find(row=>row.id===replacement)?.replaces_receipt_id,source);
  const after=await deliveryWorkspace(actor,id(30));assert.equal(after.milestones.find(e=>e.delivery_metadata?.pod_replacement_request)?.delivery_metadata.pod_replacement_request.resolved_by,submitted.id);
  const approved=await decidePodReceipt(reviewer,id(20),replacement,{...draft,request_id:id(++serial),decision:'APPROVED',reason:''});assert.equal(approved.receipt.pod_review_status,'APPROVED');assert.equal((await deliveryReceipts(actor,id(30))).find(r=>r.id===source)?.pod_review_status,'REJECTED');
  await assert.rejects(decidePodReceipt(reviewer,id(20),replacement,{...draft,request_id:id(++serial),decision:'APPROVED',reason:''}),/prior decision/);
  assert.equal((await listNotifications(id(2),'TRUCKER')).notifications.length,2);await markNotificationRead(id(2),notifications.notifications[0].id);assert.ok((await listNotifications(id(2),'TRUCKER')).notifications.find(n=>n.id===notifications.notifications[0].id)?.read_at);
  assert.equal((await query('select * from pod_review_events')).length,2);assert.equal((await query('select * from trip_delivery_quantities')).length,0);assert.equal((await query('select quantity from trip_cargo_allocations'))[0].quantity,'10');
 }finally{client.from=original.from;client.rpc=original.rpc;client.storage.from=original.storage;if(original.flag===undefined)delete process.env.POD_REVIEW_ENABLED;else process.env.POD_REVIEW_ENABLED=original.flag;await sql.close();}
});
