// Two independent browser contexts; actual Socket.IO transport, synthetic Auth/REST.
// Start backend/tests/fixtures/collaboration-browser-server.ts first. No live writes.
async(page)=>{
 const contexts=[],errors=[];let stage='initial';const draft=`ADMIN-${Date.now()}-UNSAVED`,saved=`STAFF-${Date.now()}-COMMITTED`,trip='123e4567-e89b-42d3-a456-000000000010',stop='123e4567-e89b-42d3-a456-000000000012';
 const make=async actor=>{
  const context=await page.context().browser().newContext({viewport:{width:1440,height:950}});contexts.push(context);const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>localStorage.setItem('alzhen.app-session.v1','fixture-session'));
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`const auth={profile:{id:'fixture-${actor}',role:'${actor==='admin'?'ADMIN':'STAFF'}'},accessToken:'${actor}',refreshSession:async()=>{}};export const useAuth=()=>auth;export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/login';`}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:"export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};"}));
  await p.route('**/src/services/collaboration.service.ts*',async r=>{const response=await r.fetch();const code=(await response.text()).replace(/const endpoint = [^;]+;/,'const endpoint = "http://127.0.0.1:5199";');await r.fulfill({response,body:code});});
  await p.route('**/api/**',async r=>{
   const request=r.request(),url=new URL(request.url());let data=[];
   if(request.method()==='PATCH'){
    if(url.pathname!==`/api/trips/${trip}/stops/${stop}`)throw Error('Wrong write identity');
    data=await(await fetch('http://127.0.0.1:5199/commit',{method:'POST',body:JSON.stringify({actor,value:request.postDataJSON().dispatch_number})})).json();
   }else if(request.method()!=='GET')throw Error('Unexpected fixture mutation');
   else if(url.pathname.includes('/realtime/records/'))data=await(await fetch('http://127.0.0.1:5199/record')).json();
   else if(url.pathname.endsWith('/dispatch-monitoring/columns'))data={columns:[{key:'dispatch_number',title:'Dispatch Number',type:'text'}]};
   else if(url.pathname.endsWith('/dispatch-monitoring')){const current=await(await fetch('http://127.0.0.1:5199/record')).json();data={rows:[{trip_id:trip,trip_stop_id:stop,dispatch_number:current.dispatch_number}],pagination:{page:1,limit:50,total:1,totalPages:1}};}
   await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/login');
  await p.evaluate(async actor=>{
   await import('/src/index.css');const code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
   const react=await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1]),React=react.default??react;
   const DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]);
   const {startCollaboration}=await import(code.match(/from ["']([^"']*collaboration\.service\.ts[^"']*)["']/)[1]);window.fixtureStop=startCollaboration(actor,`fixture-${actor}`,actor==='admin'?'ADMIN':'STAFF');
   const {default:View}=await import('/src/components/admin/ReportDataView.tsx');
   const root=document.createElement('div');root.id='collaboration-fixture';Object.assign(root.style,{position:'fixed',inset:'0',zIndex:'2000',overflow:'auto',background:'white'});document.body.append(root);
   (DOM.createRoot??DOM.default.createRoot)(root).render(React.createElement(MemoryRouter,null,React.createElement(View,{initialReport:'dispatch-monitoring',showReportPicker:false})));
  },actor);
  return p;
 };
 try{
  const admin=await make('admin'),staff=await make('staff');
  const root=p=>p.locator('#collaboration-fixture'),row=(p,value)=>root(p).getByRole('row').filter({has:p.getByRole('checkbox',{name:'Select row '+value,exact:true})});
  await root(admin).getByText('Live collaboration',{exact:true}).waitFor();await root(staff).getByText('Live collaboration',{exact:true}).waitFor();
  const initial=(await(await fetch('http://127.0.0.1:5199/record')).json()).dispatch_number;
  await row(admin,initial).locator('td').nth(1).click();
  const edit=p=>root(p).getByRole('textbox',{name:'Edit Dispatch Number',exact:true});
  await edit(admin).fill(draft);
  await root(staff).getByText('Fixture Admin · editing',{exact:true}).waitFor();
  await row(staff,initial).locator('td').nth(1).click();await edit(staff).fill(saved);await edit(staff).press('Enter');
  await root(admin).getByText(/Another collaborator saved this cell/).waitFor();
  if(await edit(admin).inputValue()!==draft)throw Error('Remote commit erased draft');
  await edit(admin).press('Enter');await row(staff,draft).waitFor();await row(admin,draft).waitFor();
  await admin.waitForTimeout(5200);await row(admin,draft).waitFor();await row(staff,draft).waitFor();
  const final=await(await fetch('http://127.0.0.1:5199/record')).json();if(final.collaboration_version<2)throw Error('Version did not advance');
  await root(admin).getByText('Fixture Staff',{exact:true}).waitFor();
  stage='reconnect';await fetch('http://127.0.0.1:5199/drop-staff',{method:'POST'});
  await root(staff).getByText('Collaboration reconnecting',{exact:true}).waitFor();
  await root(staff).getByText('Live collaboration',{exact:true}).waitFor();
  await root(admin).getByText('Fixture Staff',{exact:true}).waitFor();
  await staff.evaluate(()=>window.fixtureStop());await root(admin).getByText('Fixture Staff',{exact:true}).waitFor({state:'hidden'});
  if(errors.length)throw Error(errors.join('; '));
  return {isolated:true,realSocketTransport:true,mockedAuthAndPersistence:true,contexts:2,productionWrites:0,presence:true,conflictNotice:true,draftPreserved:true,lastSaveWins:true,fiveSecondPersistence:true,reconnect:true,logoutCleanup:true,version:final.collaboration_version,errors};
 }catch(error){throw Error(`${stage}: ${error.message}; page errors: ${JSON.stringify(errors)}`);}finally{await Promise.all(contexts.map(c=>c.close()));}
}
