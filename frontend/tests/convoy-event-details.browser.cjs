// Synthetic transport only: mounts the real Trip Details page; never reads/writes operational data.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const baseline=false;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const trip=id(1),otherTrip=id(9);
const trucks=[{id:id(2),trip_id:trip,truck_id:id(12),stop_scope:'ALL',truck:{id:id(12),plate_number:'CBF 6419'},driver:{first_name:'Edmar June',last_name:'Quebral'}},{id:id(3),trip_id:trip,truck_id:id(13),stop_scope:'ALL',truck:{id:id(13),plate_number:'CBP 4369'},driver:{first_name:'John',last_name:'Doe'}}];
trucks.push({...trucks[0],id:id(4),truck_id:id(14),truck:{id:id(14),plate_number:'THIRD TRUCK'},driver:{first_name:'Third',last_name:'Driver'}});
const ops={trips:[],trip_options:[],stops:[],loading:[],unloading:[],backloads:[],offloads:[],event_rows:[]};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),results=[],errors=[];
 try{
  for(const count of baseline?[2]:[3,2,1]){
   const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),requests=[];
   page.setDefaultTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.stack);});
   let rows=trucks.slice(0,count),delay=20,failConvoy=false;const fixtureEvents=rows.slice(0,2).map((a,i)=>({id:id(100+i),trip_id:trip,assignment_id:a.id,trip_stop_id:null,event_type:'WAREHOUSE_DEPARTURE',event_time:`2026-10-30T0${i+1}:00:00Z`,created_at:'2026-10-30T00:00:00Z',recorded_by:id(200+i),verification_method:'RECORDED',delivery_version:0,attachments:[{id:id(300+i),file_name:'truck-'+i+'.png',mime_type:'image/png',kind:'photo',url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+a0AAAAASUVORK5CYII='}],delivery_metadata:{actor_snapshot:{name:i?'Fixture Helper':'Fixture Driver',crew_role:i?'HELPER':'DRIVER'}},notes:'Own truck remark '+i}));
   await page.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"const value={profile:{id:'fixture',role:'ADMIN'},accessToken:'fixture',refreshSession:async()=>{}};export const useAuth=()=>value;"}));
   await page.route('**/src/components/ui/Toast.tsx*',r=>r.fulfill({contentType:'text/javascript',body:'export const useToast=()=>({addToast:()=>{}});'}));
   await page.route('**/src/components/admin/RoadRoutingPanel.tsx*',r=>r.fulfill({contentType:'text/javascript',body:'export default function GPS(){return null;}'}));
   await page.route('**/src/services/realtime.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const subscribeToAdminRealtime=()=>()=>{};'}));
   await page.route('**/src/services/collaboration.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:'const callbacks=new Set();window.emitMonitoring=e=>callbacks.forEach(f=>f(e));export const subscribeCollaborationEvents=f=>{callbacks.add(f);return()=>callbacks.delete(f);};export const joinCollaborationRoom=()=>()=>{};export const collaborationSnapshot=()=>({connected:true,bridgeHealthy:true});'}));
   await page.route('**/*.supabase.co/**',r=>r.abort());
   await page.route('**/api/**',async r=>{
    assert.equal(r.request().method(),'GET','No mutations allowed');
    const url=new URL(r.request().url()),p=url.pathname,record={path:p,start:Date.now(),end:null};requests.push(record);
    let data=[],wait=0,status=200;const requestedTrip=p.includes(otherTrip)?otherTrip:trip;
    const assigned=requestedTrip===otherTrip?[{...trucks[0],id:id(10),trip_id:otherTrip,truck:{plate_number:'OTHER TRIP'}}]:rows;
    if(p==='/api/trips/'+requestedTrip){wait=200;data={trip:{id:requestedTrip,dispatch_number:requestedTrip===trip?'MONITORING FIXTURE':'OTHER FIXTURE',status:'IN_PROGRESS'},warehouse:{name:'Fixture warehouse'}};}
    else if(p.endsWith('/assignments')){wait=300;data=assigned;}
    else if(p.endsWith('/convoy')){wait=delay;status=failConvoy?503:200;data={assignments:assigned.slice().reverse(),stops:[],cargo:[],allocations:[],responsibilities:[],operational_state:[]};}
    else if(p.includes('/reports/operations/trips/')){wait=3200;data=ops;}
    else if(p.endsWith('/events')){wait=20;data=fixtureEvents;}
    else if(p.endsWith('/line-items')){wait=2100;data=[];}
    else if(p.endsWith('/receipts')){wait=2700;data=[];}
    else if(p.endsWith('/pod-review-capabilities'))data={enabled:true};
    else if(/\/delivery\/assignments\/[^/]+\/events\/[^/]+$/.test(p))data={event:fixtureEvents.find(e=>p.endsWith(e.id)),attachments:fixtureEvents.find(e=>p.endsWith(e.id))?.attachments??[],quantities:[],audit:[]};
    else if(p.includes('/delivery/assignments/'))data={assignment:{id:p.split('/').at(-1)},stops:[],cargo:[],milestones:[],pods:[]};
    await new Promise(resolve=>setTimeout(resolve,wait));record.end=Date.now();
    await r.fulfill({status,contentType:'application/json',body:JSON.stringify({success:status===200,data,message:'Isolated refresh failure'})}).catch(()=>{});
   });
   const mount=async({refresh=false,newTrip=trip}={})=>{
    await page.goto('http://localhost:5173/tests/table-fixture.html'+(refresh?new URL(page.url()).search:''));
    await page.evaluate(async fixture=>{
     const main=await(await fetch('/src/main.tsx')).text(),driver=await(await fetch('/src/pages/Driver/DeliveryCompanion.tsx')).text(),React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),router=await import(driver.match(/from ["']([^"']*react-router-dom[^"']*)["']/)[1]);
     await import('/src/index.css');const {default:Detail}=await import('/src/pages/Admin/views/TripDetailView.tsx');
     window.mountTrip=tripId=>{window.monitoringRoot.render(React.createElement(router.BrowserRouter,null,React.createElement(Detail,{tripId,onBack:()=>{}})));};
     window.monitoringRoot=(DOM.createRoot??DOM.default.createRoot)(document.body.appendChild(document.createElement('div')));
     window.monitoringStart=Date.now();window.mountTrip(fixture.trip);
    },{trip:newTrip});
   };
   await mount();
   const milestone=page.getByRole('button',{name:/Departed warehouse/}).first();await milestone.waitFor();
   if(!await milestone.isVisible())await page.locator('.trip-phase-toggle').first().click();await milestone.click();
   const details=page.getByRole('region',{name:'Convoy Event Details'});await details.waitFor();
   const absent=async()=>{assert.equal(await page.getByText('Monitoring truck',{exact:true}).count(),0);assert.equal(await page.locator('.trip-truck-selector,.trip-truck-buttons,.trip-truck-skeleton').count(),0);};await absent();
   assert.equal(await details.locator('.trip-convoy-event-column').count(),count);
   await details.getByText('Updated by: Fixture Driver (Driver)',{exact:true}).waitFor();
   if(count>1)await details.getByText('Updated by: Fixture Helper (Helper)',{exact:true}).waitFor();
   const active=()=>details.locator('.trip-convoy-event-column[data-active=true]');
   const choose=async a=>{await details.getByRole('button',{name:`Show ${a.truck.plate_number} operational timeline`,exact:true}).click();await page.waitForFunction(id=>new URLSearchParams(location.search).get('assignment')===id,a.id);await details.locator(`[data-assignment-id="${a.id}"][data-active=true]`).waitFor();assert.equal(await active().count(),1);};
   await choose(trucks[0]);
   if(count>1){
    const first=details.locator('.trip-convoy-event-column').filter({has:page.getByRole('button',{name:'Show CBF 6419 operational timeline'})});
    const second=details.locator('.trip-convoy-event-column').filter({has:page.getByRole('button',{name:'Show CBP 4369 operational timeline'})});
    await second.getByRole('button',{name:'View truck-1.png',exact:true}).click();assert.ok((await active().innerText()).includes('CBF 6419'),'image preview does not switch');await page.keyboard.press('Escape');
    await second.locator('summary').click();assert.ok((await active().innerText()).includes('CBF 6419'),'nested review does not switch');
    await second.locator('.trip-event-section h4').filter({hasText:'Remarks'}).click();
    await page.waitForFunction(id=>new URLSearchParams(location.search).get('assignment')===id,trucks[1].id);
    await details.locator(`[data-assignment-id="${trucks[1].id}"][data-active=true]`).waitFor();assert.equal(await active().count(),1);
    await first.getByText('Updated by: Fixture Driver (Driver)',{exact:true}).waitFor();await second.getByText('Updated by: Fixture Helper (Helper)',{exact:true}).waitFor();
    await page.getByRole('region',{name:'Operational timeline',exact:true}).getByText(/Updated by: Fixture Helper/).waitFor();
    await first.getByRole('button',{name:'Show CBF 6419 operational timeline'}).focus();await page.keyboard.press('Enter');await choose(trucks[1]);
   }
   if(count===3){await choose(trucks[2]);await active().getByRole('heading',{name:'Awaiting Update',exact:true}).waitFor();assert.equal(await details.locator('.trip-convoy-event-column').count(),3);await choose(trucks[0]);}
   const widths=await page.locator('.trip-journey-grid').evaluate(e=>Array.from(e.children).map(c=>c.getBoundingClientRect().width));assert.ok(Math.abs(widths[0]/(widths[0]+widths[1])-.4)<.001,JSON.stringify(widths));
   if(count===2){const dims=await details.locator('.trip-convoy-event-column').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().width));assert.ok(Math.abs(dims[0]-dims[1])<1);}
   if(count===3)assert.equal(await details.locator('.trip-convoy-event-columns').evaluate(e=>e.scrollWidth>e.clientWidth),true);
   const selected=new URL(page.url()).searchParams.get('assignment');
   await page.evaluate(trip=>window.emitMonitoring({kind:'commit',commit:{tripId:trip,source:'trip_events'}}),trip);await page.waitForTimeout(700);
   assert.equal(new URL(page.url()).searchParams.get('assignment'),selected);assert.equal(await details.locator('.trip-convoy-event-column').count(),count);
   await details.getByRole('button',{name:'Back to route',exact:true}).click();await absent();assert.equal(new URL(page.url()).searchParams.get('assignment'),selected);
   await mount({refresh:true});await page.getByRole('button',{name:/Departed warehouse/}).first().waitFor();await absent();assert.equal(new URL(page.url()).searchParams.get('assignment'),selected);
   const again=page.getByRole('button',{name:/Departed warehouse/}).first();if(!await again.isVisible())await page.locator('.trip-phase-toggle').first().click();await again.click();await details.waitFor();
   await page.setViewportSize({width:390,height:844});
   const mobile=await page.locator('.trip-journey-grid').evaluate(e=>{const a=e.children[0].getBoundingClientRect(),b=e.children[1].getBoundingClientRect();return {stacked:b.top>=a.bottom,overflow:document.documentElement.scrollWidth>innerWidth};});assert.equal(mobile.stacked,true);assert.equal(mobile.overflow,false);
   if(count>1){await choose(trucks[1]);rows=rows.filter(a=>a.id!==trucks[1].id);await page.evaluate(trip=>window.emitMonitoring({kind:'commit',commit:{tripId:trip,source:'trip_truck_assignments'}}),trip);await page.waitForFunction(id=>!document.querySelector(`[data-assignment-id="${id}"]`),trucks[1].id);assert.equal(await active().count(),1);assert.ok((await active().getAttribute('data-assignment-id'))!==trucks[1].id);}
   results.push({trucks:count,permanentSelectorRemoval:true,panelWidths:widths,assignmentSwitching:true,independentEvents:true,nestedControls:true,realtimePreservesSelection:true,refresh:true,mobile});await ctx.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,results,operationalWrites:0},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
