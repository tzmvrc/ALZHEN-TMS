// Actual workspace, timeline and inspector; authoritative API and socket transport fixtures only.
async(page,options={})=>{
 const assert=(v,m)=>{if(!v)throw Error(m);},id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const trip=id(1),assignment=id(2),stop=id(3),errors=[],requests=[];
 const at=n=>new Date(Date.UTC(2026,9,27,0,n)).toISOString();
 const event=(n,type,title)=>({id:id(100+n),trip_id:trip,assignment_id:assignment,trip_stop_id:type.startsWith('WAREHOUSE')?null:stop,event_type:type,event_time:at(n),created_at:at(n),delivery_metadata:title?{title}:{},attachments:[],notes:null});
 let rows=[event(0,'WAREHOUSE_DEPARTURE'),event(1,'IN_TRANSIT'),...Array.from({length:60},(_,i)=>event(i+2,'CUSTOM_STATUS',i===55?'Traffic':i===56?'Vehicle breakdown':'Update '+i))];
 const assignments=[{id:assignment,trip_id:trip,stop_scope:'ALL',truck:{plate_number:'FIX-A',capacity_cbm:50},driver:{first_name:'Fixture',last_name:'Driver'}}];
 const stops=[{id:stop,trip_id:trip,stop_sequence:1,delivery_location:'Destination',delivery_status:'PENDING'}];
 const ops={loading:[],unloading:[],stops:[],backloads:[],offloads:[],exception_reports:[],report_evidence:[],event_rows:[]};
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await page.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"export const useAuth=()=>({profile:{id:'fixture',role:'ADMIN'},accessToken:'fixture-token'});"}));
 await page.route('**/src/services/collaboration.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:"const listeners=new Set();window.emitFixture=e=>listeners.forEach(f=>f(e));export const subscribeCollaborationEvents=f=>{listeners.add(f);return()=>listeners.delete(f)};export const collaborationSnapshot=()=>({bridgeHealthy:true,connected:true});export const joinCollaborationRoom=()=>()=>{};"}));
 for(const component of ['RoadRoutingPanel','../delivery/DeliveryCargoSummary']){
  const path=component.startsWith('../')?'delivery/DeliveryCargoSummary':'admin/'+component;
  await page.route('**/src/components/'+path+'.tsx*',r=>r.fulfill({contentType:'text/javascript',body:'export default function Fixture(){return null}'}));
 }
 await page.route('**/api/**',async r=>{
  const u=new URL(r.request().url());assert(r.request().method()==='GET','Unexpected write');requests.push(u.pathname);
  let data=[];
  if(u.pathname.endsWith('/convoy'))data={assignments,stops,cargo:[],allocations:[],responsibilities:[]};
  else if(u.pathname.endsWith('/events'))data=rows;
  else if(u.pathname.includes('/events/'))data={attachments:rows.find(e=>u.pathname.endsWith('/'+e.id))?.attachments??[],audit:[],quantities:[]};
  else if(u.pathname.includes('/reports/operations/trips/'))data=ops;
  await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
 });
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:options.motion??'reduce'});
 await page.goto('http://localhost:5173/tests/table-fixture.html');
 await page.evaluate(async fixture=>{
  const main=await(await fetch('/src/main.tsx')).text(),code=await(await fetch('/src/components/admin/TripTrackingWorkspace.tsx')).text();
  const React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),router=await import(code.match(/from ["']([^"']*react-router-dom[^"']*)["']/)[1]);
  await import('/src/index.css');const {default:Workspace}=await import('/src/components/admin/TripTrackingWorkspace.tsx');
  const container=document.body.appendChild(document.createElement('div'));container.style.cssText='max-width:1380px;margin:16px auto';
  (DOM.createRoot??DOM.default.createRoot)(container).render(React.createElement(router.BrowserRouter,null,React.createElement(Workspace,{trip:{id:fixture.trip,dispatch_number:'FIX-01',status:'IN_TRANSIT'},assignments:fixture.assignments,stops:fixture.stops,events:fixture.rows,operations:fixture.ops,origin:'Warehouse',destination:'Destination',progress:0,totalCbm:0,totalQty:0,onManage:()=>{},onOpenReport:()=>{},refreshKey:0})));
 },{trip,assignments,stops,rows,ops});
 const strip=page.getByRole('list',{name:'Delivery stop 1 milestones'});await strip.waitFor();await page.waitForTimeout(300);
 const latest=id(161);await strip.locator(`[data-milestone-key="${latest}"]`).waitFor();
 assert(await strip.locator('[data-milestone-key]').count()<25,'Timeline is not windowed');
 await page.waitForFunction(()=>{const nodes=Array.from(document.querySelectorAll('[aria-label="Delivery stop 1 milestones"] [data-milestone-key]')).filter(e=>e.isConnected&&e.getBoundingClientRect().width>0);return nodes.length>0&&nodes.every(e=>Math.abs(e.getBoundingClientRect().width-146)<1);});
 assert(await strip.locator('[data-milestone-key]').evaluateAll(nodes=>nodes.filter(e=>e.isConnected&&e.getBoundingClientRect().width>0).every(e=>Math.abs(e.getBoundingClientRect().width-146)<1)),'Milestones compressed');
 assert(await strip.locator('[data-tone=amber]').count()>0,'Traffic color missing');assert(await strip.locator('[data-tone=red]').count()>0,'Breakdown color missing');
 await strip.locator(`[data-milestone-key="${latest}"] button`).click();
 const inspector=page.getByRole('region',{name:'Selected milestone details'});await inspector.waitFor();assert(await inspector.getByText('None',{exact:true}).count()>=2,'Missing None labels');
 await inspector.getByRole('button',{name:'Back to route'}).click();
 await strip.evaluate(e=>{e.scrollTo({left:600,behavior:'instant'});});await page.waitForTimeout(100);const manual=await strip.evaluate(e=>e.scrollLeft);
 await page.evaluate(trip=>window.emitFixture({kind:'commit',commit:{source:'trip_events',tripId:trip}}),trip);await page.waitForTimeout(700);
 assert(Math.abs(await strip.evaluate(e=>e.scrollLeft)-manual)<3,'Unchanged snapshot overrides manual scroll');
 rows.push({...event(63,'CUSTOM_STATUS','Fresh saved status'),attachments:[{id:id(800),file_name:'saved-evidence.png',mime_type:'image/png',url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII='}]});
 const beforeY=await page.evaluate(()=>scrollY);await page.evaluate(trip=>window.emitFixture({kind:'commit',commit:{source:'trip_events',tripId:trip}}),trip);
 await strip.getByRole('button',{name:/Fresh saved status/}).waitFor();
 await page.waitForFunction(()=>{const b=Array.from(document.querySelectorAll('[data-milestone-key]')).find(e=>e.textContent.includes('Fresh saved status'));if(!b)return false;const r=b.getBoundingClientRect(),p=b.closest('ol').getBoundingClientRect();return Math.abs((r.left+r.right-p.left-p.right)/2)<3;});
 assert(await page.evaluate(()=>scrollY)===beforeY,'Timeline scrolls the page');
 const centered=await strip.getByRole('button',{name:/Fresh saved status/}).evaluate(e=>{const b=e.getBoundingClientRect(),p=e.closest('ol').getBoundingClientRect();return Math.abs((b.left+b.right-p.left-p.right)/2)<3});assert(centered,'New status not centered');
 await strip.getByRole('button',{name:/Fresh saved status/}).click();await inspector.getByRole('heading',{name:'Fresh saved status',exact:true}).waitFor();
 await inspector.getByRole('button',{name:'View saved-evidence.png',exact:true}).click();await page.getByRole('dialog',{name:'Evidence image preview'}).waitFor();await page.getByRole('button',{name:'Close image preview'}).click();
 await inspector.getByRole('button',{name:'Back to route'}).click();
 rows.push(event(64,'ARRIVED'),event(65,'UNLOADING_STARTED'),event(66,'UNLOADING_FINISHED'),event(67,'STOP_DEPARTURE'));
 await page.evaluate(trip=>window.emitFixture({kind:'commit',commit:{source:'trip_events',tripId:trip}}),trip);
 await strip.locator(`[data-milestone-key="${id(167)}"]`).waitFor();await page.waitForFunction(()=>{const e=document.querySelector('[aria-label="Delivery stop 1 milestones"]');return Math.abs(e.scrollWidth-e.clientWidth-e.scrollLeft)<3;});
 assert(await strip.evaluate(e=>Math.abs(e.scrollWidth-e.clientWidth-e.scrollLeft)<3),'Completed phase not at end');
 ops.backloads.push({id:id(900),trip_id:trip,trip_stop_id:stop,status:'PENDING',reported_at:at(68),comments:'Saved return cargo',reason:'Store return'});
 await page.evaluate(trip=>window.emitFixture({kind:'commit',commit:{source:'backloads',tripId:trip}}),trip);await page.waitForTimeout(650);
 await page.getByRole('button',{name:/Offload \/ Backload \/ Demurrage/}).click();
 await page.getByRole('button',{name:/Backload.*Store return/}).click();await inspector.getByRole('heading',{name:'Report Details'}).waitFor();await inspector.getByText('Store return',{exact:true}).waitFor();
 await page.screenshot({path:'.playwright-mcp/operational-timeline-realtime.png',fullPage:true});
 assert(errors.length===0,errors.join('; '));assert(requests.filter(p=>p.endsWith('/convoy')).length===1,'Event refresh unnecessarily reloads convoy');
 return {passed:true,productionWrites:0,checks:['60 status virtualization','fixed widths','severity colors','inspector None','manual scroll preservation','realtime insertion','centering without page scroll','completed end','scoped report refresh'],requests};
}
