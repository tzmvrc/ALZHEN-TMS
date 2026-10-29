// Synthetic transport only: mounts the real Trip Details page; never reads/writes operational data.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const baseline=process.argv.includes('--baseline');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const trip=id(1),otherTrip=id(9);
const trucks=[{id:id(2),trip_id:trip,truck_id:id(12),stop_scope:'ALL',truck:{id:id(12),plate_number:'CBF 6419'},driver:{first_name:'Edmar June',last_name:'Quebral'}},{id:id(3),trip_id:trip,truck_id:id(13),stop_scope:'ALL',truck:{id:id(13),plate_number:'CBP 4369'},driver:{first_name:'John',last_name:'Doe'}}];
const ops={trips:[],trip_options:[],stops:[],loading:[],unloading:[],backloads:[],offloads:[],event_rows:[]};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),results=[],errors=[];
 try{
  for(const count of baseline?[2]:[2,1]){
   const ctx=await browser.newContext({viewport:{width:1440,height:1000}}),page=await ctx.newPage(),requests=[];
   page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
   let rows=trucks.slice(0,count),delay=2400,failConvoy=false;
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
    else if(p.endsWith('/events')){wait=1800;data=[];}
    else if(p.endsWith('/line-items')){wait=2100;data=[];}
    else if(p.endsWith('/receipts')){wait=2700;data=[];}
    else if(p.endsWith('/pod-review-capabilities'))data={enabled:true};
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
   if(!baseline)await page.getByRole('status',{name:'Loading truck assignments'}).waitFor();
   const selector=page.getByRole('group',{name:'Selected truck assignment'});
   await selector.getByRole('button',{name:/CBF 6419/}).waitFor().catch(async e=>{console.error(JSON.stringify({errors,requests,body:await page.locator('body').innerText()},null,2));throw e;});
   const start=await page.evaluate(()=>window.monitoringStart),shown=Date.now();
   const sample={trucks:count,buttonsMs:shown-start,assignmentStartMs:requests.find(r=>r.path.endsWith('/assignments')).start-start,requiredResponses:requests.filter(r=>r.end&&r.end<=shown).map(r=>r.path),checks:[]};
   assert.equal(await selector.getByRole('button').count(),count);
   if(!baseline){
    assert.ok(sample.buttonsMs<1500,JSON.stringify(sample));
    assert.ok(sample.assignmentStartMs<150,'Assignments start alongside initial trip');
    assert.ok(requests.some(r=>r.path.endsWith('/convoy')&&!r.end),'Convoy remains pending when selector renders');
    assert.ok(requests.some(r=>r.path.includes('/reports/operations/')&&!r.end),'Reports remain pending');
    assert.equal(requests.filter(r=>r.path.endsWith('/assignments')).length,1);
    sample.checks.push('selector renders from initial assignments before slow convoy, reports, POD and cargo');
    if(count===2){
     await page.waitForResponse(r=>r.url().endsWith('/convoy'));
     assert.equal(await selector.getByRole('button',{name:/CBF 6419/}).getAttribute('aria-pressed'),'true','Default selection survives a differently ordered convoy');
     sample.checks.push('default selection survives convoy enrichment with a different assignment order');
     await selector.getByRole('button',{name:/CBP 4369/}).click();await page.waitForFunction(()=>document.querySelector('.trip-truck-buttons>button[aria-pressed=true]')?.textContent.includes('CBP 4369'));assert.equal(await selector.getByRole('button',{name:/CBP 4369/}).getAttribute('aria-pressed'),'true');
     await page.waitForFunction(id=>document.querySelector('.trip-pod-review')?.getAttribute('id')===`trip-${id}-pod`,trip);
     assert.ok(new URL(page.url()).searchParams.get('assignment')===id(3));
     if(!requests.some(r=>r.path.includes('/reports/operations/')&&r.end))await page.waitForResponse(r=>r.url().includes('/reports/operations/')&&r.status()===200);
     assert.equal(await selector.getByRole('button',{name:/CBP 4369/}).getAttribute('aria-pressed'),'true','Richer convoy order cannot reset selection');
     const assignmentReads=requests.filter(r=>r.path.endsWith('/assignments')).length,convoyReads=requests.filter(r=>r.path.endsWith('/convoy')).length;
     for(const plate of ['CBF 6419','CBP 4369']){await selector.getByRole('button',{name:new RegExp(plate)}).click();await page.waitForFunction(plate=>document.querySelector('.trip-truck-buttons>button[aria-pressed=true]')?.textContent.includes(plate),plate);}
     assert.equal(requests.filter(r=>r.path.endsWith('/assignments')).length,assignmentReads);assert.equal(requests.filter(r=>r.path.endsWith('/convoy')).length,convoyReads);
     sample.checks.push('switching trucks preserves selected query and does not refetch assignment/convoy lists');
     failConvoy=true;await page.evaluate(trip=>window.emitMonitoring({kind:'commit',commit:{tripId:trip,source:'trip_truck_assignments'}}),trip);
     await page.getByText('Truck allocation details could not refresh.',{exact:false}).waitFor();
     assert.equal(await selector.getByRole('button').count(),2);assert.equal(await selector.getByRole('button',{name:/CBP 4369/}).getAttribute('aria-pressed'),'true');
     sample.checks.push('buttons and selected truck survive a failed background convoy refresh');failConvoy=false;
     await mount({refresh:true});await selector.getByRole('button',{name:/CBP 4369/}).waitFor();assert.equal(await selector.getByRole('button',{name:/CBP 4369/}).getAttribute('aria-pressed'),'true');
     sample.checks.push('refresh restores selected assignment');
     for(const width of [390,1440]){await page.setViewportSize({width,height:1000});assert.ok(await selector.isVisible());const geometry=await selector.evaluate(e=>({right:e.getBoundingClientRect().right,viewport:innerWidth,parents:[e,e.parentElement,e.parentElement.parentElement].map(n=>({class:n.className,width:n.getBoundingClientRect().width,css:getComputedStyle(n).minWidth}))}));assert.ok(geometry.right<=width+1,JSON.stringify(geometry));}
     sample.checks.push('mobile and desktop selector fit viewport');
     await page.evaluate(trip=>window.mountTrip(trip),otherTrip);await selector.getByRole('button',{name:/OTHER TRIP/}).waitFor();assert.equal(await selector.getByRole('button').count(),1);assert.equal(await selector.getByRole('button').first().getAttribute('aria-pressed'),'true');
     sample.checks.push('trip change discards foreign selection and assignments');
    }else sample.checks.push('single truck displays a correctly selected button');
   }
   results.push(sample);await ctx.close();
  }
  assert.deepEqual(errors,[]);const output={mode:baseline?'before':'after',conditions:{tripMs:200,assignmentsMs:300,convoyMs:2400,reportsMs:3200},results,errors,operationalWrites:0};
  const dir=path.resolve(__dirname,'../../.playwright-mcp/monitoring-truck');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,baseline?'before.json':'after.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
