// Explicitly opted-in live acceptance. Creates only uniquely named isolated fixtures.
// Passwords/tokens exist only in process memory and are never written or logged.
if(process.env.ALZHEN_CREW_LIVE_TEST!=='1')throw Error('Set ALZHEN_CREW_LIVE_TEST=1 for authorized isolated live verification.');
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const {createServer}=require('node:http');
const {writeFile,readFile}=require('node:fs/promises');
const {supabaseAdmin:db}=require('../dist/config/supabase.js');
const {createUserAccount}=require('../dist/services/user.service.js');
const {saveTruckCrew}=require('../dist/services/truck-crew.service.js');
const {decidePodReceipt}=require('../dist/services/pod-review.service.js');
const {attachCollaborationServer}=require('../dist/services/collaboration-server.js');
const {io}=require('../../frontend/node_modules/socket.io-client');
const app=require('../dist/app.js').default;
const {createCanvas}=require('@napi-rs/canvas');
const realRpc=db.rpc.bind(db);db.rpc=async(...args)=>{const result=await realRpc(...args);if(result.error)console.error('Verification RPC failure:',args[0],result.error.code||'NETWORK',result.error.message?.slice(0,240));return result;};
const tag=Date.now().toString(36),created=[],checks=[],fixtures={tag},sockets=[];let collaboration,server,base,admin;
const checked=async request=>{const result=await request;if(result.error)throw Error('Fixture database operation failed: '+result.error.code);return result.data;};
const insert=async(table,row)=>checked(db.from(table).insert(row).select('*').single());
const pending=(socket,event,predicate=()=>true)=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{socket.off(event,receive);reject(Error('Realtime event not received: '+event));},15000);function receive(data){if(!predicate(data))return;clearTimeout(timeout);socket.off(event,receive);resolve(data);}socket.on(event,receive);});
async function request(path,session,method='GET',body,headers={}){const response=await fetch(base+'/api'+path,{method,headers:{...(session?{Authorization:'Bearer '+session.session.access_token,'X-App-Session':session.appSessionId}:{}),...(body&&!(body instanceof Buffer)?{'Content-Type':'application/json'}:{}),...headers},body:body instanceof Buffer?body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(35000)});const value=await response.json();return {status:response.status,...value};}
const data=async result=>{const r=await result;if(!r.success)throw Error('Live API failed '+r.status+': '+r.message);return r.data;};
(async()=>{
 try{
  const admins=await checked(db.from('profiles').select('id').eq('role','ADMIN').is('deactivated_at',null).is('locked_at',null).limit(1));if(!admins.length)throw Error('Existing development Admin profile required.');admin=admins[0].id;
  let resume;if(process.env.ALZHEN_CREW_RESUME_TEST==='1'){const prior=JSON.parse(await readFile('../docs/truck-crew-live-2026-10-29.json','utf8'));resume=prior.runs.at(-1);if(!resume.accounts.every(a=>a.email.startsWith('crew-')))throw Error('Only identified crew test accounts may resume.');Object.assign(fixtures,resume.fixtures);for(const old of resume.accounts){const account={...old,password:randomBytes(24).toString('base64url')};const auth=await db.auth.admin.updateUserById(old.id,{password:account.password,ban_duration:'none'});if(auth.error)throw Error('Test credential reset failed.');await checked(db.from('profiles').update({deactivated_at:null,deactivated_by:null}).eq('id',old.id));const driverRow=await checked(db.from('drivers').select('id').eq('profile_id',old.id).single());account.driverId=driverRow.id;created.push(account);}await checked(db.from('trips').update({archived_at:null}).eq('id',fixtures.trip));}
  if(!resume)for(const [label,crew_role] of [['driver','DRIVER'],['helper-a','HELPER'],['helper-b','HELPER'],['unassigned','HELPER']]){
   const account={label,email:`crew-${tag}-${label}@alzhentest.example`,password:randomBytes(24).toString('base64url')};
   const result=await createUserAccount({first_name:'Crew Test',last_name:label,email:account.email,password:account.password,role:'TRUCKER',crew_role,is_admin:false,created_by:admin});account.id=result.user.id;account.driverId=result.driver.id;created.push(account);
  }
  checks.push('backend account creation saves Driver and Helper classifications');
  const [driver,a,b,outsider]=created;
  const truck=resume?await checked(db.from('trucks').select('*').eq('id',fixtures.truck).single()):await insert('trucks',{plate_number:'CREW-'+tag,truck_type:'10W',capacity_cbm:10});fixtures.truck=truck.id;
  const trip=resume?await checked(db.from('trips').select('*').eq('id',fixtures.trip).single()):await insert('trips',{dispatch_number:'ISOLATED-CREW-'+tag,status:'PLANNED'});fixtures.trip=trip.id;
  const stop=resume?await checked(db.from('trip_stops').select('*').eq('id',fixtures.stop).single()):await insert('trip_stops',{trip_id:trip.id,stop_sequence:1,dr_number:'CREW-'+tag});fixtures.stop=stop.id;
  const assignment=resume?await checked(db.from('trip_truck_assignments').select('*').eq('id',fixtures.assignment).single()):await insert('trip_truck_assignments',{trip_id:trip.id,truck_id:truck.id,driver_id:driver.driverId,assignment_type:'PRIMARY',stop_scope:'ALL'});fixtures.assignment=assignment.id;
  const line=resume?await checked(db.from('trip_line_items').select('*').eq('id',fixtures.line).single()):await insert('trip_line_items',{trip_id:trip.id,trip_stop_id:stop.id,dr_number:stop.dr_number,customer_model:'ISOLATED CREW MODEL',quantity:1,cbm:1});fixtures.line=line.id;
  const allocation=resume?await checked(db.from('trip_cargo_allocations').select('*').eq('id',fixtures.allocation).single()):await insert('trip_cargo_allocations',{trip_id:trip.id,assignment_id:assignment.id,trip_line_item_id:line.id,quantity:1,allocated_cbm:1});fixtures.allocation=allocation.id;
  await saveTruckCrew({id:admin,role:'ADMIN'},trip.id,assignment.id,{helper_ids:[a.id,b.id],expected_version:assignment.crew_version??0});
  server=createServer(app);collaboration=await attachCollaborationServer(server,{bridge:false});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
  for(const account of created){account.session=await data(request('/auth/login',null,'POST',{email:account.email,password:account.password}));}
  for(const account of [driver,a,b]){const w=await data(request('/delivery/current',account.session));assert.equal(w.assignment.id,assignment.id);assert.equal(w.crew.length,3);}
  assert.equal((await request('/delivery/assignments/'+assignment.id,outsider.session)).status,403);checks.push('independent real logins share one dashboard; unassigned user is denied');
  for(const account of [driver,a,b]){const socket=io(base,{transports:['websocket'],auth:{token:account.session.session.access_token,appSession:account.session.appSessionId}});sockets.push(socket);await pending(socket,'connect');const joined=await new Promise(resolve=>socket.emit('room:join',{kind:'trip',key:trip.id},resolve));assert.equal(joined.ok,true);account.socket=socket;}
  const save=(account,type,extra={})=>data(request(`/delivery/assignments/${assignment.id}/events`,account.session,'POST',{type,device_time:new Date().toISOString(),...extra},{'Idempotency-Key':randomUUID()}));
  const gps=()=>({latitude:14.6,longitude:121,accuracy_meters:10,captured_at:new Date().toISOString()});
  await save(driver,'WAREHOUSE_ARRIVAL',{gps:gps()});await save(a,'LOADING_STARTED');await save(b,'LOADING_FINISHED');await save(driver,'WAREHOUSE_DEPARTURE');
  let realtime=pending(a.socket,'trucker:changed',v=>v.assignmentId===assignment.id);await save(driver,'IN_TRANSIT',{stop_id:stop.id});await realtime;
  realtime=pending(driver.socket,'trucker:changed',v=>v.assignmentId===assignment.id);await save(a,'ARRIVED',{stop_id:stop.id,gps:gps()});await realtime;checks.push('actual authenticated sockets deliver Driver travel and Helper arrival changes');
  const canvas=createCanvas(600,800),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,600,800);ctx.fillStyle='#102b48';ctx.font='24px sans-serif';ctx.fillText('ISOLATED CREW TEST DELIVERY RECEIPT',25,80);ctx.fillText('DR '+stop.dr_number,25,140);ctx.fillText('MODEL: ISOLATED CREW MODEL / QTY: 1',25,200);ctx.fillText('TEST ONLY - NO OPERATIONAL DELIVERY',25,270);let image=canvas.toBuffer('image/png');
  const upload=async(account)=>data(request(`/delivery/assignments/${assignment.id}/evidence`,account.session,'POST',image,{'Content-Type':'image/png','X-File-Name':'isolated-crew-receipt.png','X-Trip-Stop-Id':stop.id,'Idempotency-Key':randomUUID()}));
  const original=await upload(a);fixtures.original=original.id;
  const selections=[{allocation_id:allocation.id,line_item_id:line.id,assignment_id:assignment.id,trip_stop_id:stop.id,dr_number:stop.dr_number,model:line.customer_model,quantity:1}];
  const ocr_text=`DR Number: ${stop.dr_number}\nModel Codes: ${line.customer_model}\nProduct Selections: ${JSON.stringify(selections)}\n--- Scanned text ---\nSynthetic isolated crew receipt`;
  const pod=await save(a,'POD_SUBMITTED',{stop_id:stop.id,dr_number:stop.dr_number,attachments:[original.id],ocr_text});assert.equal(pod.recorded_by,a.id);assert.equal(pod.delivery_metadata.actor_snapshot.crew_role,'HELPER');
  for(const account of [driver,a,b])assert.equal((await data(request(`/delivery/assignments/${assignment.id}/receipts`,account.session))).length,1);
  await decidePodReceipt({profileId:admin,role:'ADMIN'},trip.id,original.id,{request_id:randomUUID(),decision:'REJECTED',reason:'Isolated crew test: replace synthetic receipt',expected_review_version:0,expected_ocr_version:0,reviewed_fields:{dr_number:stop.dr_number}});
  for(const account of [driver,a,b]){const w=await data(request('/delivery/current',account.session));assert(w.milestones.some(e=>e.delivery_metadata?.pod_replacement_request?.receipt_id===original.id));const notices=await data(request('/notifications',account.session));assert(notices.notifications.some(n=>n.notification_type==='pod_rejected'&&n.metadata.receipt_id===original.id));}
  ctx.fillText('CORRECTED REPLACEMENT - SECOND ATTEMPT',25,340);image=canvas.toBuffer('image/png');
  const replacementPhoto=await upload(b);fixtures.replacement=replacementPhoto.id;
  const replacement=await save(b,'POD_SUBMITTED',{stop_id:stop.id,dr_number:stop.dr_number,attachments:[replacementPhoto.id],ocr_text,replaces_receipt_id:original.id});assert.equal(replacement.recorded_by,b.id);assert.equal(replacement.delivery_metadata.replaces_receipt_id,original.id);
  const pendingPhoto=await checked(db.from('trip_images').select('pod_review_status').eq('id',replacementPhoto.id).single());assert.equal(pendingPhoto.pod_review_status,'PENDING');checks.push('Helper POD, crew rejection notifications, cross-crew replacement Pending and original history persist');
  const simultaneous=await Promise.all([save(driver,'UNLOADING_STARTED',{stop_id:stop.id}),save(b,'UNLOADING_STARTED',{stop_id:stop.id})]);assert.equal(simultaneous[0].id,simultaneous[1].id);
  const recorded=await checked(db.from('trip_events').select('id').eq('assignment_id',assignment.id).eq('event_type','UNLOADING_STARTED'));assert.equal(recorded.length,1);checks.push('simultaneous real HTTP writes commit exactly one physical milestone');
  await saveTruckCrew({id:admin,role:'ADMIN'},trip.id,assignment.id,{helper_ids:[b.id],expected_version:1});assert.equal((await request('/delivery/assignments/'+assignment.id,a.session)).status,403);
  const historical=await checked(db.from('trip_events').select('recorded_by,delivery_metadata').eq('id',pod.id).single());assert.equal(historical.recorded_by,a.id);assert.equal(historical.delivery_metadata.actor_snapshot.name,'Crew Test helper-a');checks.push('removal immediately denies future reads while historical actor remains fixed');
  const oldSession=a.session;await data(request('/auth/login',null,'POST',{email:a.email,password:a.password}));assert.equal((await request('/auth/me',oldSession)).status,401);assert.equal((await request('/auth/me',driver.session)).status,200);assert.equal((await request('/auth/me',b.session)).status,200);checks.push('same-account single-device policy stays active; other crew sessions remain independent');
 }finally{
  for(const socket of sockets)socket.disconnect();if(collaboration)await collaboration.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));
  if(fixtures.trip)await checked(db.from('trips').update({archived_at:new Date().toISOString()}).eq('id',fixtures.trip));
  if(fixtures.truck)await checked(db.from('trucks').update({status:'INACTIVE'}).eq('id',fixtures.truck));
  for(const account of created){await checked(db.from('profiles').update({deactivated_at:new Date().toISOString(),deactivated_by:admin}).eq('id',account.id));const result=await db.auth.admin.updateUserById(account.id,{ban_duration:'876000h'});if(result.error)throw Error('Test account ban could not be confirmed.');}
  let prior;try{prior=JSON.parse(await readFile('../docs/truck-crew-live-2026-10-29.json','utf8'));}catch{}
  const run={fixtures,accounts:created.map(({id,email,label})=>({id,email,label,status:'DEACTIVATED_AND_BANNED'})),checks,retention:'Archived isolated trip and immutable test history retained; no operational records modified.'};
  await writeFile('../docs/truck-crew-live-2026-10-29.json',JSON.stringify({runs:[...(prior?.runs??(prior?[prior]:[])),run]},null,2));
 }
 console.log(JSON.stringify({passed:true,checks,archivedTestTrip:fixtures.trip,testAccounts:created.length,allTestAccountsDeactivated:true},null,2));
})().catch(e=>{console.error('Crew live verification failed:',e.message);process.exitCode=1;});
