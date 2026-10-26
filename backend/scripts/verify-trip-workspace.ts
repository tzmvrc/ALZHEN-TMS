/** Task-scoped live verification. Uses only its own marked records; no production deletes. */
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFile,readFile,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {supabaseAdmin as db} from '../src/config/supabase.js';
import {reviewDelivery} from '../src/services/delivery-workspace.service.js';
const file=join(tmpdir(),'alzhen-trip-workspace-verification.json'),base='http://localhost:5000/api';
const saveManifest=async(m:unknown)=>{await writeFile(file+'.tmp',JSON.stringify(m,null,2),{mode:0o600});await rename(file+'.tmp',file);};
const mode=process.argv[2]??'setup';
const request:typeof fetch=(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(45000)});
async function checked<T>(request:PromiseLike<{data:T;error:any}>):Promise<NonNullable<T>>{const r=await request;if(r.error)throw Error(r.error.message);return r.data!;}
async function setup(){
 let prior:any;try{prior=JSON.parse(await readFile(file,'utf8'));}catch{}
 const run=prior?.run??randomUUID(),mark=`[ALZHEN_VERIFY_${run}]`,m:any=prior??{run,mark,trip:randomUUID(),stop:randomUUID(),line:randomUUID(),accounts:[],checks:[],events:[],images:[]};
 if(m.phase==='ready'){console.log(JSON.stringify({trip:m.trip,ready:true}));return;}
 const save=()=>saveManifest(m);await save();
 const source:any=await checked(db.from('trips').select('*').eq('id','e6301024-0002-4000-9000-000000000100').single());
 const stop:any=await checked(db.from('trip_stops').select('store_id').eq('trip_id',source.id).order('stop_sequence').limit(1).single());
 m.warehouse=await checked(db.from('warehouses').select('id,latitude,longitude').eq('id',source.warehouse_id).single());m.destination=await checked(db.from('customer_stores').select('id,latitude,longitude').eq('id',stop.store_id).single());await save();
 for(let i=0;i<2;i++){
  let a=m.accounts[i];
  if(!a){const email=`alzhen-verify-${run}-${i}@example.invalid`,password=randomBytes(24).toString('base64url')+'A1!';
   const auth=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{first_name:'Verification',last_name:`Driver ${i+1}`,role:'TRUCKER'}});if(auth.error)throw Error(auth.error.message);
   a={profile:auth.data.user!.id,email,password,driver:randomUUID(),truck:randomUUID(),assignment:randomUUID(),allocation:randomUUID()};m.accounts.push(a);await save();}
  await checked(db.from('profiles').upsert({id:a.profile,role:'TRUCKER',first_name:'Verification',last_name:`Driver ${i+1}`}));
  await checked(db.from('drivers').upsert({id:a.driver,profile_id:a.profile,first_name:'Verification',last_name:`Driver ${i+1}`}));
  await checked(db.from('trucks').upsert({id:a.truck,plate_number:`VERIFY-${run.slice(0,8)}-${i+1}`,truck_type:'Wing Van',capacity_cbm:50}));
 }
 await checked(db.from('trips').upsert({id:m.trip,dispatch_number:`VERIFY-${run.slice(0,8)}`,warehouse_id:source.warehouse_id,status:'PLANNED',loading_date:new Date().toISOString().slice(0,10),estimated_delivery_date:new Date(Date.now()+86400000).toISOString().slice(0,10),remarks:`${mark} Isolated functional verification, not a customer order or live driver journey.`}));
 await checked(db.from('trip_stops').upsert({id:m.stop,trip_id:m.trip,store_id:stop.store_id,stop_sequence:1,delivery_status:'PENDING',remarks:mark}));
 await checked(db.from('trip_line_items').upsert({id:m.line,trip_id:m.trip,trip_stop_id:m.stop,dr_number:`VERIFY-DR-${run.slice(0,8)}`,customer_model:'Verification cargo',quantity:15,cbm:3}));
 for(const [i,a] of m.accounts.entries()){
  await checked(db.from('trip_truck_assignments').upsert({id:a.assignment,trip_id:m.trip,truck_id:a.truck,driver_id:a.driver,stop_scope:'SELECTED',remarks:mark}));
  await checked(db.from('trip_assignment_stops').upsert({id:a.stopLink??(a.stopLink=randomUUID()),trip_id:m.trip,assignment_id:a.assignment,trip_stop_id:m.stop}));
  await checked(db.from('trip_cargo_allocations').upsert({id:a.allocation,trip_id:m.trip,assignment_id:a.assignment,trip_line_item_id:m.line,quantity:i?5:10,allocated_cbm:i?1:2}));
 }
 m.phase='ready';await save();console.log(JSON.stringify({mode,trip:m.trip,accounts:m.accounts.map((a:any)=>({profile:a.profile,assignment:a.assignment})),manifest:file}));
}
async function exercise(){
 const m=JSON.parse(await readFile(file,'utf8'));const save=()=>saveManifest(m);
 const session=new Map<string,string>();
 let step=0,uploadStep=0;m.actions??=[];
 for(const a of m.accounts){const r=await request(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,password:a.password})}),v:any=await r.json();if(!r.ok)throw Error(`Verification login: ${v.message}`);session.set(a.profile,v.data.session.access_token);a.appSessionId=v.data.appSessionId;}
 const api=async(a:any,path:string,body:any={},key?:string,expected=200)=>{const headers:any={Authorization:`Bearer ${session.get(a.profile)}`,'x-app-session':a.appSessionId,'Content-Type':'application/json'};if(key)headers['Idempotency-Key']=key;const r=await request(`${base}${path}`,{method:'POST',headers,body:JSON.stringify(body)}),v:any=await r.json();if(expected===200?!r.ok:r.status!==expected)throw Error(`${path}: ${r.status} ${v.message}`);return v;};
 const send=async(a:any,type:string,extra:any={},key=randomUUID())=>{const index=step++;if(m.actions[index]?.event)return m.actions[index];const pending=m.actions[index]??{input:{type,device_time:new Date().toISOString(),remarks:`${m.mark} Verification only.`,...extra},key};m.actions[index]=pending;await save();const v=await api(a,`/delivery/assignments/${a.assignment}/events`,pending.input,pending.key);m.events.push(v.data.id);m.actions[index]={...pending,event:v.data};await save();return m.actions[index];};
 const gps=(point:any)=>({latitude:Number(point.latitude),longitude:Number(point.longitude),accuracy_meters:15,captured_at:new Date().toISOString()});
 const [a,b]=m.accounts;
 const arrival=await send(a,'WAREHOUSE_ARRIVAL',{gps:gps(m.warehouse)});if(arrival.event.verification_method!=='GPS_VERIFIED')throw Error('GPS arrival not verified');
 const again=await api(a,`/delivery/assignments/${a.assignment}/events`,arrival.input,arrival.key);if(again.data.id!==arrival.event.id)throw Error('Idempotency failed');m.checks.push('GPS verified arrival','idempotent event retry');
 const denied=await request(`${base}/delivery/assignments/${a.assignment}`,{headers:{Authorization:`Bearer ${session.get(b.profile)}`,'x-app-session':b.appSessionId}});if(denied.status!==403)throw Error('Cross-driver access was not denied');m.checks.push('cross-driver read denied');
 for(const type of ['LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE'])await send(a,type);
 await send(a,'CUSTOM_STATUS',{title:'Traffic',gps:gps(m.warehouse)});
 await send(a,'ARRIVED',{stop_id:m.stop,gps:gps(m.destination)});await send(a,'UNLOADING_STARTED',{stop_id:m.stop});
 const partial=await send(a,'PARTIAL_UNLOAD',{stop_id:m.stop,quantities:[{allocation_id:a.allocation,quantity:8}]});await api(a,`/delivery/assignments/${a.assignment}/events`,partial.input,partial.key);
 const read=await request(`${base}/delivery/assignments/${a.assignment}`,{headers:{Authorization:`Bearer ${session.get(a.profile)}`,'x-app-session':a.appSessionId}}),workspace:any=await read.json();if(workspace.data.cargo[0].remaining!==2)throw Error('Remaining cargo wrong');m.checks.push('partial unloading remains 2','partial retry counted once');
 await api(a,`/delivery/assignments/${a.assignment}/events`,{type:'PARTIAL_UNLOAD',stop_id:m.stop,quantities:[{allocation_id:a.allocation,quantity:3}]},randomUUID(),422);m.checks.push('excess unload rejected');
 const canvas=createCanvas(640,360),ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,640,360);ctx.fillStyle='#0b2341';ctx.font='26px sans-serif';ctx.fillText('ALZHEN VERIFICATION IMAGE',25,60);ctx.fillText(`DR VERIFY-${m.run.slice(0,8)}`,25,110);ctx.fillText('Not proof of an actual delivery',25,170);const bytes=canvas.toBuffer('image/png');
 const upload=async(owner:any,stop:string|null)=>{const index=uploadStep++;if(m.images[index])return m.images[index];const key=randomUUID(),headers:any={Authorization:`Bearer ${session.get(owner.profile)}`,'x-app-session':owner.appSessionId,'Content-Type':'image/png','X-File-Name':'verification-evidence.png','Idempotency-Key':key};if(stop)headers['X-Trip-Stop-Id']=stop;const r=await request(`${base}/delivery/assignments/${owner.assignment}/evidence`,{method:'POST',headers,body:bytes}),v:any=await r.json();if(!r.ok)throw Error(`Upload: ${r.status} ${v.message}`);m.images.push(v.data.id);await save();return v.data.id;};
 const pod=await upload(a,m.stop);await send(a,'POD_SUBMITTED',{stop_id:m.stop,dr_number:`VERIFY-DR-${m.run.slice(0,8)}`,attachments:[pod],ocr_text:'Manually reviewed verification receipt; OCR extraction not claimed.'});m.checks.push('real Storage upload','POD saved with manual review');
 await send(a,'PARTIAL_UNLOAD',{stop_id:m.stop,quantities:[{allocation_id:a.allocation,quantity:2}]});await send(a,'UNLOADING_FINISHED',{stop_id:m.stop});await send(a,'STOP_DEPARTURE',{stop_id:m.stop});await send(a,'ASSIGNMENT_COMPLETED');
 await api(b,`/delivery/assignments/${b.assignment}/events`,{type:'WAREHOUSE_ARRIVAL',gps:{...gps(m.warehouse),latitude:Number(m.warehouse.latitude)+1}},randomUUID(),422);m.checks.push('outside geofence evidence required');
 const image=await upload(b,null),photo=await send(b,'WAREHOUSE_ARRIVAL',{attachments:[image]});if(photo.event.verification_method!=='PHOTO_PENDING_REVIEW')throw Error('Photo arrival incorrectly verified');await send(b,'LOADING_STARTED');m.photoEvent=photo.event.id;m.checks.push('photo-supported arrival','progress without Admin approval');
 const admin={id:'8eaf7847-e806-493d-8338-ac0412153245',role:'ADMIN'};const photoNow:any=await checked(db.from('trip_events').select('delivery_version,verification_method').eq('id',photo.event.id).single());if(photoNow.verification_method!=='PHOTO_CONFIRMED')await reviewDelivery(admin,b.assignment,photo.event.id,{version:photoNow.delivery_version,action:'CONFIRM_EVIDENCE',reason:'Isolated verification evidence checked; not an operational arrival.'});m.checks.push('audited Admin evidence review');
 for(const type of ['LOADING_FINISHED','WAREHOUSE_DEPARTURE'])await send(b,type);await send(b,'ARRIVED',{stop_id:m.stop,gps:gps(m.destination)});await send(b,'UNLOADING_STARTED',{stop_id:m.stop});
 for(const type of ['BACKLOAD_REPORTED','OFFLOAD_REPORTED']){const reportImage=await upload(b,m.stop);await send(b,type,{stop_id:m.stop,attachments:[reportImage],dr_number:`VERIFY-DR-${m.run.slice(0,8)}`,quantities:[{allocation_id:b.allocation,quantity:1}]});}
 m.checks.push('Backload with evidence and allocated cargo','Offload with evidence and allocated cargo');await save();console.log(JSON.stringify({trip:m.trip,checks:m.checks,events:new Set(m.events).size,images:m.images.length}));
}
async function gpsCheck(){
 const m=JSON.parse(await readFile(file,'utf8')),a=m.accounts[1];
 const login=await request(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:a.email,password:a.password})}),v:any=await login.json();if(!login.ok)throw Error(v.message);
 const headers={'Content-Type':'application/json',Authorization:`Bearer ${v.data.session.access_token}`,'x-app-session':v.data.appSessionId};
 const call=async(path:string,body:unknown)=>{const r=await request(`${base}/tracking/assignments/${a.assignment}/${path}`,{method:'POST',headers,body:JSON.stringify(body)}),data:any=await r.json();if(!r.ok)throw Error(`${data.code}: ${data.message}`);return data.data;};
 const started=await call('start',{consent:true});
 try{await call('fixes',{session_id:started.session_id,latitude:Number(m.warehouse.latitude),longitude:Number(m.warehouse.longitude),accuracy_meters:15,captured_at:new Date().toISOString()});m.checks.push('explicit verification-account GPS session and accepted fix');await saveManifest(m);console.log(JSON.stringify({gpsSaved:true,assignment:a.assignment,testCoordinates:true}));}
 finally{await call('stop',{session_id:started.session_id});}
}
(mode==='setup'?setup():mode==='gps'?gpsCheck():exercise()).catch(e=>{console.error(e.message);process.exitCode=1;});
