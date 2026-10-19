// Two independent browser contexts; actual Socket.IO transport, synthetic Auth/REST.
// Start backend/tests/fixtures/collaboration-browser-server.ts first. No live writes.
async(page)=>{
 const contexts=[],errors=[],writes=[],latencies=[];let failNext=false;let stage='initial';const fromA=`ADMIN-${Date.now()}`,fromB=`STAFF-${Date.now()}`,trip='123e4567-e89b-42d3-a456-000000000010',stop='123e4567-e89b-42d3-a456-000000000012';
 const mount=async(p,actor)=>p.evaluate(async actor=>{
   await import('/src/index.css');const code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
   const react=await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1]),React=react.default??react;
   const DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]);
   const collaboration=await import(code.match(/from ["']([^"']*collaboration\.service\.ts[^"']*)["']/)[1]);window.fixtureCollaboration=collaboration;window.fixtureStop=collaboration.startCollaboration(actor,`fixture-${actor}`,actor==='admin'?'ADMIN':'STAFF');
   const {default:View}=await import('/src/components/admin/ReportDataView.tsx');
   const root=document.createElement('div');root.id='collaboration-fixture';Object.assign(root.style,{position:'fixed',inset:'0',zIndex:'2000',overflow:'auto',background:'white'});document.body.append(root);
   (DOM.createRoot??DOM.default.createRoot)(root).render(React.createElement(MemoryRouter,null,React.createElement(View,{initialReport:'dispatch-monitoring',showReportPicker:false})));
  },actor);
 const make=async actor=>{
  const context=await page.context().browser().newContext({viewport:{width:1440,height:950}});contexts.push(context);const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>localStorage.setItem('alzhen.app-session.v1','fixture-session'));
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`const auth={profile:{id:'fixture-${actor}',role:'${actor==='admin'?'ADMIN':'STAFF'}'},accessToken:'${actor}',refreshSession:async()=>{}};export const useAuth=()=>auth;export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/login';`}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:"export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};"}));
  await p.route('**/src/services/collaboration.service.ts*',async r=>{const response=await r.fetch();const code=(await response.text()).replace(/const endpoint = [^;]+;/,'const endpoint = "http://127.0.0.1:5199";');await r.fulfill({response,body:code});});
  await p.route('**/api/**',async r=>{
   const request=r.request(),url=new URL(request.url());let data=[];
   if(request.method()==='PATCH'){
    writes.push({actor,body:request.postDataJSON()});
    if(failNext){failNext=false;return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'Isolated save failure'})});}
    if(url.pathname!==`/api/trips/${trip}/stops/${stop}`)throw Error('Wrong write identity');
    data=await(await fetch('http://127.0.0.1:5199/commit',{method:'POST',body:JSON.stringify({actor,value:request.postDataJSON().dispatch_number})})).json();
   }else if(request.method()!=='GET')throw Error('Unexpected fixture mutation');
   else if(url.pathname.includes('/realtime/records/'))data=await(await fetch('http://127.0.0.1:5199/record')).json();
   else if(url.pathname.endsWith('/dispatch-monitoring/columns'))data={columns:[{key:'dispatch_number',title:'Dispatch Number',type:'text'}]};
   else if(url.pathname.endsWith('/dispatch-monitoring')){const current=await(await fetch('http://127.0.0.1:5199/record')).json();data={rows:[{trip_id:trip,trip_stop_id:stop,dispatch_number:current.dispatch_number}],pagination:{page:1,limit:50,total:1,totalPages:1}};}
   await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/login');
  await mount(p,actor);
  return p;
 };
 try{
  const admin=await make('admin'),staff=await make('staff');
  const root=p=>p.locator('#collaboration-fixture'),edit=p=>root(p).getByRole('textbox',{name:'Edit Dispatch Number',exact:true});
  const record=async()=>await(await fetch('http://127.0.0.1:5199/record')).json();
  for(const p of [admin,staff])await p.waitForFunction(async()=>window.fixtureCollaboration.collaborationSnapshot().connected);
  const before=await record();
  const open=async p=>root(p).getByRole('row').filter({has:p.getByRole('checkbox',{name:'Select row '+before.dispatch_number,exact:true})}).locator('td').nth(1).click();
  const preview=async(p,value)=>p.waitForFunction(value=>[...document.querySelectorAll('[data-live-draft]')].some(node=>node.getAttribute('data-live-draft-value')===value),value);
  await open(admin);await edit(admin).fill('');
  let text='';for(const letter of 'Live'){const started=Date.now();text+=letter;await edit(admin).pressSequentially(letter);await preview(staff,text);if(await staff.locator('[data-cell-presence]').count()!==1||await staff.locator('[data-live-draft]').innerText().then(t=>t.includes('Fixture Admin')))throw Error('Duplicate draft username indicator');latencies.push(Date.now()-started);}
  if(writes.length||JSON.stringify(await record())!==JSON.stringify(before))throw Error('Typing wrote persisted data');
  await edit(admin).press('Escape');await staff.locator('[data-live-draft]').waitFor({state:'hidden'});
  if(writes.length)throw Error('Cancel saved');
  await open(admin);await edit(admin).fill(fromA);await preview(staff,fromA);
  await open(staff);await edit(staff).fill(fromB);await preview(admin,fromB);
  if(await edit(admin).inputValue()!==fromA||await edit(staff).inputValue()!==fromB)throw Error('Competing draft overwrote input');
  stage='competing-save';await edit(staff).press('Enter');await root(admin).getByText(/Another collaborator saved this cell/).first().waitFor();
  if(await edit(admin).inputValue()!==fromA)throw Error('Competing save erased draft');
  await edit(admin).press('Enter');
  for(const p of [admin,staff])await root(p).getByRole('checkbox',{name:'Select row '+fromA,exact:true}).waitFor();
  await admin.waitForTimeout(5200);if((await record()).dispatch_number!==fromA)throw Error('Five-second persistence failed');
  stage='browser-refresh';await staff.reload();await mount(staff,'staff');await root(staff).getByRole('checkbox',{name:'Select row '+fromA,exact:true}).waitFor();
  const reopen=()=>root(admin).getByRole('row').filter({has:admin.getByRole('checkbox',{name:'Select row '+fromA,exact:true})}).locator('td').nth(1).click();
  stage='failed-save';await reopen();await edit(admin).fill('failed-draft');await preview(staff,'failed-draft');failNext=true;await edit(admin).press('Enter');
  await root(admin).locator('input[aria-label="Edit Dispatch Number"]').waitFor();
  await root(admin).getByText('Something went wrong. Please try again later.',{exact:true}).waitFor();
  await staff.locator('[data-live-draft-phase=failed]').waitFor();
  if(await edit(admin).inputValue()!=='failed-draft'||(await record()).dispatch_number!==fromA)throw Error('Failed save was applied or erased draft');
  await edit(admin).press('Escape');await staff.locator('[data-live-draft]').waitFor({state:'hidden'});
  stage='reconnect';await reopen();await edit(admin).fill('reconnect-draft');await preview(staff,'reconnect-draft');
  await fetch('http://127.0.0.1:5199/drop-staff',{method:'POST'});
  await staff.waitForFunction(async()=>!window.fixtureCollaboration.collaborationSnapshot().connected);
  await staff.waitForFunction(async()=>window.fixtureCollaboration.collaborationSnapshot().connected);
  await preview(staff,'reconnect-draft');
  if((await record()).dispatch_number!==fromA)throw Error('Reconnect persisted a draft');
  stage='token-refresh';await admin.evaluate(async()=>{window.fixtureStop=window.fixtureCollaboration.startCollaboration('admin-refresh','fixture-admin','ADMIN');});
  await admin.waitForFunction(async()=>window.fixtureCollaboration.collaborationSnapshot().connected);
  await preview(staff,'reconnect-draft');
  await edit(admin).fill('after-token-refresh');await preview(staff,'after-token-refresh');
  if(writes.length!==3)throw Error('Token refresh triggered a save');
  await edit(admin).press('Escape');await staff.locator('[data-live-draft]').waitFor({state:'hidden'});
  stage='logout';await root(staff).getByRole('row').filter({has:staff.getByRole('checkbox',{name:'Select row '+fromA,exact:true})}).locator('td').nth(1).click();await edit(staff).fill('logout-draft');await preview(admin,'logout-draft');
  await staff.evaluate(()=>window.fixtureStop());await admin.locator('[data-live-draft]').waitFor({state:'hidden'});if(writes.length!==3)throw Error('Logout saved a draft');
  if(errors.length)throw Error(errors.join('; '));
  return {isolated:true,realSocketTransport:true,mockedAuthAndPersistence:true,contexts:2,productionWrites:0,letterByLetter:true,typingApiWrites:0,cancelApiWrites:0,independentSameCellDrafts:true,conflictNotice:true,saveFailurePreservesDraft:true,fiveSecondPersistence:true,reconnectSnapshot:true,tokenRefresh:true,browserRefresh:true,logoutCleanup:true,remotePreviewLatencyMs:latencies,saveAttempts:writes.length};
 }catch(error){const diagnostics=await Promise.all(contexts.map(async c=>({text:(await c.pages()[0].locator('#collaboration-fixture').innerText()).slice(-2000),inputs:await c.pages()[0].locator('#collaboration-fixture input').evaluateAll(xs=>xs.map(x=>({label:x.getAttribute('aria-label'),value:x.value})))})));throw Error(`${stage}: ${error.message}; page errors: ${JSON.stringify(errors)}; writes: ${JSON.stringify(writes)}; diagnostics: ${JSON.stringify(diagnostics)}`);}finally{await Promise.all(contexts.map(c=>c.close()));}
}
