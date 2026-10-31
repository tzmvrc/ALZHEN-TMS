// Isolated actual list component. No operational database reads or writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
async function verify(page){
 let requests=0,records=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>{assert.equal(r.request().method(),'GET');requests++;return r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:records})});});
 await page.goto('http://localhost:5173/tests/table-fixture.html');
 await page.evaluate(async()=>{
  const main=await(await fetch('/src/main.tsx')).text();
  const React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
  await import('/src/index.css');await import('/src/components/delivery/delivery-workspace.css');
  const {default:List}=await import('/src/components/delivery/CargoDeliveryDocuments.tsx'),{composeSaved}=await import('/src/services/receipt-fields.service.ts');
  const cargo=['a','b','c','d','e'].map(id=>({id,quantity:5,remaining:0,delivered:5,line:{id:'line-'+id,trip_stop_id:id==='e'?'s2':'s1',dr_number:'DR-001',customer_model:id==='a'?'LONG-MODEL-WITH-MANY-COMPONENTS-AND-IDENTIFIERS-123456789':'REPEATED-MODEL'}}));
  window.cargoFixture={assignment:{id:'truck',trip_id:'trip'},cargo,stops:[{id:'s1',stop_sequence:1,dr_number:'DR-001',store:{name:'Fixture Store'}},{id:'s2',stop_sequence:2,dr_number:'DR-001',store:{name:'Other Store'}}],milestones:[{id:'arrival-2',event_type:'ARRIVED',trip_stop_id:'s2',assignment_id:'truck',event_time:'2026-10-30T02:00:00Z'},{id:'complete',event_type:'STOP_DEPARTURE',trip_stop_id:'s1',assignment_id:'truck',event_time:'2026-10-30T01:00:00Z'}]};
  window.cargoRecords=['b','c','d','e'].map((id,i)=>({id:'pod-'+id,trip_id:'trip',assignment_id:'truck',trip_stop_id:id==='e'?'s2':'s1',delivery_event_id:'event-'+id,dr_number:'DR-001',pod_review_status:['APPROVED','PENDING','REJECTED','APPROVED'][i],pod_review_version:0,pod_rejection_reason:id==='d'?'Fixture rejection':null,uploaded_at:'2026-10-30T01:00:00Z',file_name:'pod-'+id+'.png',mime_type:'image/png',signed_url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+a0AAAAASUVORK5CYII=',ocr_text:composeSaved({fields:{dr:'DR-001',receiver:'Fixture Store',date:'2026-10-30',models:'REPEATED-MODEL'},raw:'Fixture',productSelections:[{allocation_id:id,line_item_id:'line-'+id,assignment_id:'truck',trip_stop_id:id==='e'?'s2':'s1',dr_number:'DR-001',model:'REPEATED-MODEL',quantity:5}]})}));
  const host=document.body.appendChild(document.createElement('div'));host.className='delivery-companion';const root=(DOM.createRoot??DOM.default.createRoot)(host);
  window.renderCargo=revision=>root.render(React.createElement(List,{token:'fixture',workspace:window.cargoFixture,refreshKey:revision}));
 });
 records=await page.evaluate(()=>window.cargoRecords);records.push({...records[0],id:'pod-b-page-2',display_order:1});await page.evaluate(()=>window.renderCargo(0));
 await page.locator('.delivery-cargo-disclosure>summary').click();
 const stop=page.locator('.delivery-cargo-stop').first(),otherStop=page.locator('.delivery-cargo-stop').nth(1);
 const header=stop.getByRole('button',{name:/1\. Fixture Store/}),otherHeader=otherStop.getByRole('button',{name:/2\. Other Store/});
 await header.getByText('4 products \u00b7 1 delivered \u00b7 3 POD records',{exact:true}).waitFor();
 assert.equal(await header.getAttribute('aria-expanded'),'false');assert.equal(await otherHeader.getAttribute('aria-expanded'),'true');
 assert.equal(await stop.locator('.delivery-cargo-stop-content').isVisible(),false);
 assert.equal(await stop.getByRole('button',{name:'Preview submitted POD pod-b.png'}).count(),0,'Collapsed POD interactions are excluded from accessibility navigation');
 await header.focus();await page.keyboard.press('Enter');assert.equal(await header.getAttribute('aria-expanded'),'true');assert.equal(await otherHeader.getAttribute('aria-expanded'),'true');
 await page.keyboard.press('Space');assert.equal(await header.getAttribute('aria-expanded'),'false');assert.equal(await otherHeader.getAttribute('aria-expanded'),'true');
 await header.click();await otherHeader.click();assert.equal(await header.getAttribute('aria-expanded'),'true');assert.equal(await otherHeader.getAttribute('aria-expanded'),'false');
 assert.equal(requests,1,'Toggling does not refetch already-loaded contents');
 await page.locator('[data-allocation-id=b][data-delivered=true]').waitFor();
 assert.deepEqual(await stop.locator('.delivery-cargo-product').evaluateAll(es=>es.map(e=>e.dataset.allocationId)),['b','a','c','d']);
 assert.equal(await stop.locator('[data-delivered=true]').count(),1);
 const style=await stop.locator('[data-allocation-id=b]').evaluate(e=>({background:getComputedStyle(e).backgroundColor,weight:getComputedStyle(e.querySelector('strong')).fontWeight}));assert.equal(style.background,'rgb(234, 246, 238)');assert.ok(Number(style.weight)>=600);
 for(const [id,status] of [['b','Approved'],['c','Pending'],['d','Rejected']]){const doc=stop.locator(`[data-pod-id=pod-${id}]`);assert.ok((await doc.locator('summary').innerText()).includes(status));assert.ok((await doc.locator('.delivery-document-meta').innerText()).includes(id==='b'?'2 photos':'1 photo'));}
 assert.equal(await stop.locator('[data-pod-id]').count(),3);assert.equal(requests,1,'One receipt request shared by all stops');
 const pod=stop.locator('[data-pod-id=pod-d]');await pod.locator('summary').click();await pod.getByText('Rejection reason: Fixture rejection',{exact:true}).waitFor();await pod.getByRole('button',{name:'Preview submitted POD pod-d.png'}).click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
 await header.click();
 records=records.map(r=>r.id==='pod-c'?{...r,pod_review_status:'APPROVED',pod_review_version:1}:r);
 await page.evaluate(()=>{window.cargoFixture={...window.cargoFixture,pod_cargo_reviews:window.cargoRecords.map(r=>r.id==='pod-c'?{...r,pod_review_status:'APPROVED',pod_review_version:1}:r)};window.renderCargo(1);});
 await stop.locator('[data-allocation-id=c][data-delivered=true]').waitFor({state:'attached'});assert.equal(await header.getAttribute('aria-expanded'),'false');assert.equal(await otherHeader.getAttribute('aria-expanded'),'false');await header.getByText('4 products \u00b7 2 delivered \u00b7 3 POD records',{exact:true}).waitFor();await header.click();assert.deepEqual(await stop.locator('.delivery-cargo-product').evaluateAll(es=>es.map(e=>e.dataset.allocationId)),['b','c','a','d']);
 assert.equal(await page.locator('.delivery-cargo-stop').nth(1).locator('[data-delivered=true]').count(),0);
 await page.evaluate(()=>{window.cargoFixture={...window.cargoFixture,milestones:[...window.cargoFixture.milestones,{id:'complete-2',event_type:'STOP_DEPARTURE',trip_stop_id:'s2',assignment_id:'truck',event_time:'2026-10-30T02:00:00Z'}]};window.renderCargo(1);});
 await otherHeader.getByText('1 product \u00b7 1 delivered \u00b7 1 POD record',{exact:true}).waitFor();assert.equal(await header.getAttribute('aria-expanded'),'true');assert.equal(await otherHeader.getAttribute('aria-expanded'),'false');
 const before=requests;
 await page.evaluate(()=>{window.removedStop=window.cargoFixture.stops[0];window.cargoFixture={...window.cargoFixture,stops:window.cargoFixture.stops.slice(1)};window.renderCargo(1);});await header.waitFor({state:'detached'});
 await page.evaluate(()=>{window.cargoFixture={...window.cargoFixture,stops:[window.removedStop,...window.cargoFixture.stops]};window.renderCargo(1);});await header.waitFor();assert.equal(await header.getAttribute('aria-expanded'),'false','Removed stop state is cleaned up');assert.equal(requests,before);
 await header.click();
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.evaluate(()=>{window.cargoFixture={...window.cargoFixture,assignment:{id:'next-truck',trip_id:'trip'},milestones:[]};window.renderCargo(1);});await stop.locator('.delivery-cargo-stop-toggle[aria-expanded=true]').waitFor();await otherStop.locator('.delivery-cargo-stop-toggle[aria-expanded=false]').waitFor();
 assert.deepEqual(errors,[]);return {passed:true,stableStopSorting:true,exactAllocationStatus:true,documentBadges:true,separateSameDrSubmissions:true,photoViewer:true,workspaceRefresh:true,independentStopToggles:true,defaultCurrentStop:true,defaultUnfinishedStop:true,keyboard:true,summaryCounts:true,staleStopCleanup:true,noToggleRequests:true,mobileOverflow:false,operationalWrites:0};
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{const page=await browser.newPage({viewport:{width:1280,height:900}});console.log(JSON.stringify(await verify(page),null,2));}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
