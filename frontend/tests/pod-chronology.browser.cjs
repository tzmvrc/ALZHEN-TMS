// Production timeline components with isolated events; no operational writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const t=hour=>`2026-10-29T${String(hour).padStart(2,'0')}:00:00Z`;
 const events=['ARRIVED','POD_SUBMITTED','UNLOADING_STARTED','UNLOADING_FINISHED','STOP_DEPARTURE','POD_REJECTED'].map((type,index)=>({id:'event-'+index,trip_id:'trip',assignment_id:'truck',trip_stop_id:'stop',event_type:type,event_time:t(index+8),created_at:t(index+8),delivery_metadata:type==='POD_REJECTED'?{pod_review_event_id:'audit',receipt_id:'receipt',dr_number:'DR-A'}:{},attachments:[],actor:{first_name:type==='POD_REJECTED'?'Admin Reviewer':'Driver'},notes:type==='POD_REJECTED'?'Missing signature':null}));
 events[1].delivery_metadata={pod_replacement_request:{receipt_id:'receipt',requested_at:t(14),reason:'Missing signature',resolved_by:null}};
 await page.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"export const useAuth=()=>({accessToken:'fixture',profile:{id:'fixture',role:'TRUCKER'}});"}));
 await page.route('**/src/services/collaboration.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const subscribeCollaborationEvents=()=>()=>{};'}));
 await page.route('**/api/**',r=>{assert.equal(r.request().method(),'GET');return r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{rows:[...events].reverse(),next:null}})});});
 try{
  await page.goto('http://localhost:5173/tests/table-fixture.html');
  await page.evaluate(async events=>{
   const main=await(await fetch('/src/main.tsx')).text(),React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);await import('/src/index.css');await import('/src/components/admin/trip-operational-workspace.css');
   const {operationalPhases}=await import('/src/services/operational-timeline.ts'),{default:Admin}=await import('/src/components/admin/TripOperationalTimeline.tsx'),{default:Driver}=await import('/src/components/delivery/DeliveryTimeline.tsx');
   const node=document.body.appendChild(document.createElement('div')),root=(DOM.createRoot??DOM.default.createRoot)(node);
   window.renderPodChronology=rows=>root.render(React.createElement(React.Fragment,null,React.createElement(Admin,{phases:operationalPhases({events:rows,assignmentId:'truck',trip:{id:'trip'},data:{stops:[{id:'stop',name:'Fixture Store',sequence:1}]},operations:null,origin:'Warehouse'}),selected:null,onSelect:()=>{},onClear:()=>{},loading:false}),React.createElement(Driver,{assignmentId:'truck',tripId:'trip',stopNames:{stop:'Fixture Store'}})));window.renderPodChronology(events);
  },events);
  const stop=page.getByRole('list',{name:'Delivery stop 1 milestones'});await stop.waitFor();
  const order=await stop.locator('[data-milestone-key]').evaluateAll(nodes=>nodes.map(node=>node.dataset.milestoneKey));assert(order.indexOf('event-3')<order.indexOf('event-5'));assert(order.indexOf('event-5')<order.indexOf('pod-required:receipt'));assert.equal(await stop.locator('[data-milestone-key="pod-required:receipt"]').getAttribute('data-tone'),'pending');
  const driver=page.getByRole('region',{name:'Delivery activity and reports'});await driver.locator('[data-review-event=POD_REJECTED]').waitFor();assert.match(await driver.locator('[data-review-event=POD_REJECTED]').innerText(),/Admin review/);assert.equal(await driver.locator('[data-review-event=POD_REJECTED] button').count(),0);
  const updated=structuredClone(events);updated[1].delivery_metadata.pod_replacement_request.resolved_by='replacement';updated.push({...updated[1],id:'replacement',event_time:t(15),delivery_metadata:{replaces_receipt_id:'receipt'}});await page.evaluate(rows=>window.renderPodChronology(rows),updated);await stop.getByText('POD Resubmitted',{exact:true}).waitFor();assert.equal(await stop.locator('[data-milestone-key="pod-required:receipt"]').count(),0);assert.equal(await stop.locator('[data-milestone-key="event-4"]').getAttribute('data-tone'),'green');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['persisted rejection follows unloading and physical completion','outstanding upload is a pending action','Trucker renders Admin audit events without physical-event correction controls','replacement appears after rejection without resetting completion'],productionWrites:0},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
