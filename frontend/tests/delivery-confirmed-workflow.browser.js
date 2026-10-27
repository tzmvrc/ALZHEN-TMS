// Real Trucker UI, outbox and compression. Every write is intercepted in this browser.
async(page,saved)=>{
 const assert=(v,m)=>{if(!v)throw Error(m);},errors=[],requests=[],events=[],uploads=[];
 const workspace=structuredClone(saved.current??Object.values(saved.workspaces)[0]);workspace.milestones=[];workspace.assignment.trip.status='PLANNED';
 const first=workspace.stops[0],second={...first,id:'00000000-0000-4000-8000-000000000099',stop_sequence:2,store:{...first.store,name:'Second fixture stop'}};workspace.stops=[first,second];
 const owner='00000000-0000-4000-8000-000000000042',assignment=workspace.assignment.id;
 let serial=100,releaseArrival,releaseUpload,failLoading=true;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>sessionStorage.getItem('fixture-offline')!=='true'});
  window.fixtureGpsCalls=0;window.fixtureGpsDenied=false;
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition:(ok,fail)=>{window.fixtureGpsCalls++;if(window.fixtureGpsDenied)fail({code:1});else ok({timestamp:Date.now(),coords:{latitude:14.7,longitude:121,accuracy:10}});},watchPosition:()=>1,clearWatch:()=>{}}});
 });
 await page.route('**/socket.io/**',r=>r.abort());
 await page.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`const profile={id:'${owner}',role:'TRUCKER',first_name:'Fixture',last_name:'Driver'};const auth={profile,user:{id:profile.id,user_metadata:{}},accessToken:'fixture',loading:false,isAuthenticated:true,isAdmin:false,logout:async()=>{}};export const useAuth=()=>auth;export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/trucker';export const getRoleBasedLoginPath=()=>'/trucker/login';`}));
 await page.route('**/api/**',async r=>{
  const req=r.request(),path=new URL(req.url()).pathname;let data=[];
  if(req.method()!=='GET'){
   assert(path.startsWith(`/api/delivery/assignments/${assignment}/`),'Wrong write scope '+path);
   if(path.endsWith('/evidence')){
    uploads.push({key:req.headers()['idempotency-key'],name:req.headers()['x-file-name'],bytes:req.postDataBuffer().length,mime:req.headers()['content-type']});
    if(uploads.length===1)await new Promise(resolve=>{releaseUpload=resolve;});
    data={id:'00000000-0000-4000-8000-'+String(++serial).padStart(12,'0'),state:'READY'};
   }else{
    const body=req.postDataJSON(),key=req.headers()['idempotency-key'];requests.push({key,body});
    assert(!['WAREHOUSE_ARRIVAL','ARRIVED'].includes(body.type)||Boolean(body.gps),'Arrival GPS missing');if(body.type==='CUSTOM_STATUS')assert(Boolean(body.gps),'Recent optional GPS missing from custom update');
    if(body.type==='LOADING_STARTED'&&failLoading){failLoading=false;return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture save unavailable',code:'TEMPORARY_FAILURE'})});}
    if(body.type==='WAREHOUSE_ARRIVAL')await new Promise(resolve=>{releaseArrival=resolve;});
    let event=events.find(e=>e.key===key);if(!event){event={key,id:'00000000-0000-4000-8000-'+String(++serial).padStart(12,'0'),trip_id:workspace.assignment.trip_id,assignment_id:assignment,trip_stop_id:body.stop_id??null,event_type:body.type,event_time:new Date().toISOString(),delivery_metadata:{title:body.title},attachments:[]};events.push(event);
     if(!['POD_SUBMITTED','CUSTOM_STATUS'].includes(body.type))workspace.milestones.push(event);
     if(body.type==='PARTIAL_UNLOAD')for(const q of body.quantities){const cargo=workspace.cargo.find(c=>c.id===q.allocation_id);cargo.delivered+=Number(q.quantity);cargo.remaining-=Number(q.quantity);}
    }data=event;
   }
  }else if(path==='/api/delivery/current')data=workspace;
  else if(path==='/api/tracking/capabilities')data={enabled:false};
  else if(path==='/api/notifications')data={notifications:[],unreadCount:0};
  else if(path.endsWith('/events'))data={rows:[],next:null};
  else if(path.endsWith('/pdf-capabilities'))data={enabled:false};
  await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
 });
 await page.setViewportSize({width:390,height:850});await page.goto('http://localhost:5173/trucker');await page.getByRole('region',{name:'Trip information'}).waitFor();
 const next=page.locator('.delivery-next-panel .delivery-primary'),sheet=page.locator('dialog.delivery-sheet'),primary=sheet.locator('.delivery-submit-button');
 assert(await next.textContent()==='Share My Location','Missing GPS must replace the arrival button');
 await page.evaluate(()=>window.fixtureGpsDenied=true);await next.click();await page.getByRole('alert').filter({hasText:'Location unavailable'}).waitFor();assert(events.length===0,'GPS request submitted a milestone');
 await page.evaluate(()=>window.fixtureGpsDenied=false);await next.click();await page.waitForFunction(()=>document.querySelector('.delivery-next-panel button')?.textContent==='Arrived at Warehouse');assert(events.length===0,'Acquiring GPS automatically submitted arrival');
 assert(await page.locator('.delivery-location-warning').count()===0,'Old GPS warning panel remains');await next.click();assert(await sheet.getByText('Add photos (optional)',{exact:true}).count()===1,'Arrival photo is compulsory');
 const buttonBefore=await primary.boundingBox();await primary.click();for(let i=0;i<100&&!releaseArrival;i++)await page.waitForTimeout(20);assert(releaseArrival,'Arrival request not received');const buttonDuring=await primary.boundingBox();assert(Math.abs(buttonBefore.width-buttonDuring.width)<1&&Math.abs(buttonBefore.height-buttonDuring.height)<1,'Saving changed button dimensions');
 assert(await primary.isDisabled(),'Duplicate submission allowed');assert((await primary.textContent()).includes('confirmation'),'Missing confirmation state');assert(workspace.milestones.length===0,'Progress advanced before confirmation');
 releaseArrival();await sheet.waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelector('.delivery-next-panel button')?.textContent==='Start Loading');
 let gpsCount=await page.evaluate(()=>window.fixtureGpsCalls);await next.click();assert(await page.evaluate(()=>window.fixtureGpsCalls)===gpsCount,'Loading requests blocking GPS');
 await primary.click();await sheet.getByRole('alert').waitFor();await primary.click();await sheet.waitFor({state:'detached'});
 const loading=requests.filter(r=>r.body.type==='LOADING_STARTED');assert(loading.length===2&&loading[0].key===loading[1].key,'Retry created a different request identity');
 const submitNext=async expected=>{if((await next.textContent()).includes('Share My Location')){await next.click();await page.waitForFunction(()=>!document.querySelector('.delivery-next-panel .delivery-primary')?.textContent.includes('Share My Location'));}await next.click();await primary.click();await sheet.waitFor({state:'detached'});assert(events.at(-1).event_type===expected,'Unexpected saved stage '+events.at(-1).event_type);};
 await submitNext('LOADING_FINISHED');
 for(const width of [320,390,768]){await page.setViewportSize({width,height:900});assert(await next.evaluate(e=>{const p=e.parentElement,c=getComputedStyle(p);return Math.abs(e.getBoundingClientRect().width-(p.clientWidth-parseFloat(c.paddingLeft)-parseFloat(c.paddingRight)))<2;}),'Next action is not full width '+width);}await page.setViewportSize({width:390,height:900});
 await page.evaluate(async assignment=>{const source=await(await fetch('/src/pages/Driver/DeliveryCompanion.tsx')).text();const path=source.match(/from ["']([^"']*delivery.service[^"']*)["']/)[1];(await import(path)).clearDeliveryGps(assignment);window.fixtureGpsDenied=true;},assignment);
 await submitNext('WAREHOUSE_DEPARTURE');assert(await page.evaluate(()=>window.fixtureGpsCalls)===gpsCount,'Warehouse departure acquired GPS');assert(requests.filter(r=>r.body.type==='WAREHOUSE_DEPARTURE').every(r=>!r.body.gps),'Departure manufactured a GPS reading');assert(!events.some(e=>e.event_type==='IN_TRANSIT'),'Duplicate On the Way event created');
 assert((await next.textContent()).includes('Share My Location'),'Arrival without GPS did not offer location sharing');
 await page.evaluate(async assignment=>{const source=await(await fetch('/src/pages/Driver/DeliveryCompanion.tsx')).text();const path=source.match(/from ["']([^"']*delivery.service[^"']*)["']/)[1];(await import(path)).cacheDeliveryGps(assignment,{latitude:14.7,longitude:121,accuracy_meters:10,captured_at:new Date().toISOString()});},assignment);
 const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=3000;c.height=2100;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#000';x.font='bold 160px sans-serif';x.fillText('DR 12345 - DELIVERED',120,230);x.fillText('Receiver: Test Driver',120,490);const pixels=x.getImageData(0,700,3000,1400);for(let i=0;i<pixels.data.length;i+=4){const v=(i*31+i%37)%255;pixels.data[i]=v;pixels.data[i+1]=v;pixels.data[i+2]=v;pixels.data[i+3]=255;}x.putImageData(pixels,0,700);return c.toDataURL('image/jpeg',.97).split(',')[1];});
 const file={name:'fixture-document.jpg',mimeType:'image/jpeg',buffer:Buffer.from(photo,'base64')};
 const exif=Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex'),oriented=Buffer.concat([file.buffer.subarray(0,2),exif,file.buffer.subarray(2)]).toString('base64');
 const orientation=await page.evaluate(async data=>{const {prepareDeliveryPhoto}=await import('/src/services/delivery-photo.ts');const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),prepared=await prepareDeliveryPhoto(new File([bytes],'oriented.jpg',{type:'image/jpeg'}),true),b=await createImageBitmap(prepared);const result={width:b.width,height:b.height};b.close();return result;},oriented);
 assert(orientation.width<orientation.height&&Math.max(orientation.width,orientation.height)<=1920,'Image orientation not baked into prepared photo');
 await page.getByRole('button',{name:'Add Status',exact:true}).click();await sheet.locator('input[type=file]').setInputFiles(file);await sheet.getByAltText('Evidence preview 1').waitFor();await primary.click();
 for(let i=0;i<100&&!releaseUpload;i++)await page.waitForTimeout(20);assert(releaseUpload,'Photo upload did not start');assert((await primary.textContent()).includes('Uploading photos'),'Upload progress missing');releaseUpload();await sheet.waitFor({state:'detached'});
 assert(await page.evaluate(()=>window.fixtureGpsCalls)===gpsCount,'Manual travel status requested GPS');
 await page.evaluate(()=>window.fixtureGpsDenied=false);await submitNext('ARRIVED');assert(events.at(-1).trip_stop_id===first.id,'Arrival associated with wrong stop');
 await submitNext('UNLOADING_STARTED');
 await next.click();await sheet.getByRole('button',{name:'Unload all remaining in this DR'}).first().click();await primary.click();await sheet.waitFor({state:'detached'});assert(events.at(-1).event_type==='PARTIAL_UNLOAD','Unloaded quantities missing');
 await submitNext('UNLOADING_FINISHED');assert(!events.some(e=>e.event_type==='POD_SUBMITTED'),'Unloading created a POD');
 await page.evaluate(()=>{sessionStorage.setItem('fixture-offline','true');dispatchEvent(new Event('offline'));});
 await page.getByRole('button',{name:'Upload POD',exact:true}).click();await sheet.getByLabel('DR No.',{exact:true}).fill(workspace.cargo[0].line.dr_number);await sheet.locator('input[type=file]').setInputFiles(file);await sheet.getByAltText('Evidence preview 1').waitFor();await primary.click();await sheet.getByRole('button',{name:/Queued.*awaiting sync/}).waitFor();assert(!events.some(e=>e.event_type==='POD_SUBMITTED'),'Offline POD treated as confirmed');
 await sheet.getByRole('button',{name:'Close',exact:true}).last().click();await page.reload();await page.getByRole('region',{name:'Pending submissions'}).waitFor();
 const persisted=await page.evaluate(async owner=>{const {readDeliveryOutbox}=await import('/src/services/delivery-outbox.ts');const row=(await readDeliveryOutbox(owner))[0],f=row.files[0].file,b=await createImageBitmap(f);const result={name:f.name,size:f.size,width:b.width,height:b.height,key:row.key};b.close();return result;},owner);
 assert(Math.max(persisted.width,persisted.height)<=1920,'Compression dimension cap not applied');assert(persisted.size<file.buffer.length,'Photo was not compressed');assert(persisted.name.endsWith('.jpg'),'Prepared filename mismatch');
 await page.evaluate(()=>{sessionStorage.removeItem('fixture-offline');dispatchEvent(new Event('online'));});
 for(let i=0;i<150&&!events.some(e=>e.event_type==='POD_SUBMITTED');i++)await page.waitForTimeout(25);assert(events.some(e=>e.key===persisted.key&&e.event_type==='POD_SUBMITTED'),'Queued photo did not sync after reload');
 await page.getByRole('region',{name:'Pending submissions'}).waitFor({state:'detached'});await submitNext('STOP_DEPARTURE');
 await submitNext('ARRIVED');assert(events.at(-1).trip_stop_id===second.id,'Second stop scope wrong');await submitNext('UNLOADING_STARTED');await submitNext('UNLOADING_FINISHED');await submitNext('STOP_DEPARTURE');await submitNext('ASSIGNMENT_COMPLETED');
 assert(events.filter(e=>e.event_type==='POD_SUBMITTED').length===1,'Duplicate POD submission');assert(uploads.length===2,'Duplicate image upload');
 assert(errors.length===0,errors.join('; '));await page.screenshot({path:'.playwright-mcp/delivery-workflow-confirmed.png',fullPage:true});
 return {passed:true,productionWrites:0,events:events.map(e=>e.event_type),uploads:uploads.length,compressed:persisted,checks:['arrival GPS denial/retry','optional arrival image','non-blocking stationary statuses','in-button progress','backend confirmation only','same-key retry','stop sequence and cargo','offline file persistence and sync','compression','no duplicate transit/POD']};
}
