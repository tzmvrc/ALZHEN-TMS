// Run with Playwright MCP against an authenticated TRUCKER session.
// Only /delivery fixture requests are intercepted; no operational writes or GPS sessions.
async (page) => {
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const assignment={id:id(40),trip_id:id(30),truck:{plate_number:'FIXTURE 001',truck_type:'10W'},trip:{dispatch_number:'ISOLATED UI FIXTURE',status:'PLANNED'},driver:{first_name:'Fixture',last_name:'Driver'}};
 const workspace={assignment,warehouse:{name:'Fixture warehouse',latitude:14.7,longitude:121,location_verified:true,arrival_radius_meters:500},stops:[{id:id(31),stop_sequence:1,store:{name:'Fixture destination',latitude:14.6,longitude:121.1,location_verified:true,arrival_radius_meters:500}}],cargo:[{id:id(60),quantity:10,allocated_cbm:2,delivered:0,remaining:10,line:{id:id(50),trip_stop_id:id(31),dr_number:'FIXTURE-DR-A',customer_model:'Product A'}},{id:id(61),quantity:5,allocated_cbm:1,delivered:0,remaining:5,line:{id:id(51),trip_stop_id:id(31),dr_number:'FIXTURE-DR-B',customer_model:'Product B'}}],milestones:[]};
 const events=[],keys=new Map();let uploads=0,hold=false;
 const clearFixture=()=>page.evaluate(async assignment=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('alzhen-delivery-outbox-v1',1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('submissions',{keyPath:'key'});s.createIndex('owner','owner');};r.onsuccess=()=>resolve(r.result);r.onerror=reject;});await new Promise((resolve,reject)=>{const tx=db.transaction('submissions','readwrite'),s=tx.objectStore('submissions'),q=s.getAll();q.onsuccess=()=>q.result.filter(r=>r.assignment===assignment).forEach(r=>s.delete(r.key));tx.oncomplete=resolve;tx.onerror=reject;});db.close();},id(40));
 const until=async predicate=>{for(let n=0;n<100;n++){if(predicate())return;await page.waitForTimeout(50);}throw Error('Fixture acknowledgment did not arrive');};
 await clearFixture();
 const route=async route=>{const req=route.request(),path=new URL(req.url()).pathname,method=req.method();let data;
  if(path.endsWith('/assignments'))data={rows:[assignment],next:null};
  else if(path.endsWith('/evidence')){uploads++;data={id:id(200+uploads),state:'READY'};}
  else if(path.endsWith('/events')&&method==='POST'){
   if(hold){await route.abort('internetdisconnected');return;}
   const key=req.headers()['idempotency-key'],body=req.postDataJSON();
   if(keys.has(key))data=keys.get(key);else{data={id:id(300+events.length),trip_id:id(30),assignment_id:id(40),trip_stop_id:body.stop_id??null,event_type:body.type,event_time:new Date().toISOString(),created_at:new Date().toISOString(),verification_method:body.type==='ARRIVED'?'PHOTO_PENDING_REVIEW':'RECORDED',notes:body.remarks,delivery_metadata:{title:body.title},delivery_version:0,attachments:[],demonstration:true};keys.set(key,data);events.unshift(data);if(!['CUSTOM_STATUS','PARTIAL_UNLOAD','POD_SUBMITTED','BACKLOAD_REPORTED','OFFLOAD_REPORTED','PHOTO_UPLOADED'].includes(body.type))workspace.milestones.push(data);for(const q of body.quantities??[]){if(body.type==='PARTIAL_UNLOAD'){const cargo=workspace.cargo.find(c=>c.id===q.allocation_id);cargo.delivered+=Number(q.quantity);cargo.remaining-=Number(q.quantity);}}}
  }else if(path.endsWith('/events'))data={rows:events,next:null};
  else if(path.includes('/events/'))data={attachments:[],audit:[],quantities:[]};
  else data=workspace;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
 };
 await page.route('**/api/delivery/**',route);
 const tracking=route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:{enabled:false}})});
 await page.route('**/api/tracking/capabilities',tracking);
 await page.context().grantPermissions(['geolocation'],{origin:'http://localhost:5173'});
 await page.context().setGeolocation({latitude:14.7,longitude:121,accuracy:10});
 await page.setViewportSize({width:390,height:844});
 const submit=async label=>{await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('button',{name:'Submit update',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});};
 const image={name:'ISOLATED-fixture-evidence.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCzAAAAAASUVORK5CYII=','base64')};
 try{
  await page.goto('http://localhost:5173/trucker/trips');
  await page.getByRole('button',{name:'Arrived at Warehouse',exact:true}).waitFor();
  assert(await page.locator('canvas.mapboxgl-canvas').count()===0,'Driver home must not mount a map');
  await submit('Arrived at Warehouse');await submit('Start Loading');await submit('Finish Loading');await submit('Depart Warehouse');
  await page.getByRole('button',{name:'Add Status',exact:true}).click();await page.getByLabel('Remarks (optional)').fill('Isolated fixture traffic update');await page.getByRole('button',{name:'Submit update',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Arrived at Delivery Stop',exact:true}).waitFor();
  await page.context().setGeolocation({latitude:15,longitude:122,accuracy:10});
  await page.getByRole('button',{name:'Arrived at Delivery Stop',exact:true}).click();await page.getByRole('button',{name:'Submit update',exact:true}).click();await page.getByText('Add a photo before submitting this action.',{exact:true}).waitFor();
  await page.locator('dialog input[type=file]').setInputFiles(image);await page.getByRole('button',{name:'Submit update',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});await submit('Start Unloading');
  await page.getByRole('button',{name:'Record Unloaded Cargo',exact:true}).click();await page.getByRole('button',{name:'Unload all remaining in this DR',exact:true}).first().click();await page.getByLabel('Unload Product B',{exact:true}).fill('3');await page.getByRole('button',{name:'Submit update',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Record Unloaded Cargo',exact:true}).waitFor();assert(workspace.cargo[0].remaining===0&&workspace.cargo[1].remaining===2,'Partial delivery must preserve remaining quantities');
  await page.getByRole('button',{name:'Record Unloaded Cargo',exact:true}).click();await page.getByLabel('Unload Product B',{exact:true}).fill('2');await page.getByRole('button',{name:'Submit update',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});await submit('Finish Unloading');
  await page.getByRole('button',{name:'Upload POD',exact:true}).click();await page.locator('dialog input[type=file]').setInputFiles(image);await page.getByLabel('DR No.',{exact:true}).fill('FIXTURE-DR-A');await page.getByRole('button',{name:'Submit update',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});await until(()=>events.some(e=>e.event_type==='POD_SUBMITTED'));await page.getByLabel('Pending submissions',{exact:true}).waitFor({state:'detached'});
  hold=true;await page.getByRole('button',{name:'Add Status',exact:true}).click();await page.getByLabel('Remarks (optional)').fill('Fixture connection recovery');await page.getByRole('button',{name:'Submit update',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});await page.getByText('1 pending sync',{exact:true}).waitFor();await page.getByText('Saved on this device only',{exact:true}).waitFor();hold=false;
  await page.getByRole('button',{name:'Sync now',exact:true}).click();await page.getByText('1 pending sync',{exact:true}).waitFor({state:'detached'});
  assert(events.filter(e=>e.notes==='Fixture connection recovery').length===1,'Reconnect must save once');
  await page.getByRole('button',{name:'History',exact:true}).click();await page.getByText('Photo supported · Pending review',{exact:true}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile viewport must not overflow');
  await page.screenshot({path:'.playwright-mcp/delivery-mobile-timeline.png',fullPage:true});
  return {passed:true,isolated:true,eventCount:events.length,uploads,remaining:workspace.cargo.map(c=>c.remaining),checks:['mobile layout','one next action','loading sequence','informational status','outside geofence evidence required','photo-supported continuation','complete and partial DR quantities','POD independent of completion','pending sync and retry once','timeline verification badge']};
 }finally{hold=false;await clearFixture();await page.unroute('**/api/delivery/**',route);await page.unroute('**/api/tracking/capabilities',tracking);await page.context().clearPermissions();await page.context().setGeolocation(null);await page.goto('http://localhost:5173/trucker/trips');}
}
