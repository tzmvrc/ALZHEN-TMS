// Actual grids and Socket.IO; synthetic roles and fixture-only appearance writes.
async(page)=>{
 const contexts=[],errors=[],counts={designWrites:0,businessWrites:0,reportReads:0};
 const trip='123e4567-e89b-42d3-a456-000000000010',stop='123e4567-e89b-42d3-a456-000000000012';
 const mount=async(p,actor)=>p.evaluate(async actor=>{
  await import('/src/index.css');const code=await(await fetch('/src/pages/Admin/views/MasterDataView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
  const react=await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1]),React=react.default??react,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
  const {startCollaboration}=await import('/src/services/collaboration.service.ts');startCollaboration(actor,`fixture-${actor}`,actor==='admin'?'ADMIN':'STAFF');
  const {default:View}=await import('/src/pages/Admin/views/MasterDataView.tsx');const root=document.createElement('div');root.id='design-fixture';Object.assign(root.style,{position:'fixed',inset:'0',zIndex:'2000',overflow:'auto',background:'white'});document.body.append(root);(DOM.createRoot??DOM.default.createRoot)(root).render(React.createElement(View));
 },actor);
 const make=async actor=>{
  const context=await page.context().browser().newContext({viewport:{width:1400,height:950}});contexts.push(context);const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>localStorage.setItem('alzhen.app-session.v1','fixture-session'));
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`const auth={profile:{id:'fixture-${actor}',role:'${actor==='admin'?'ADMIN':'STAFF'}'},accessToken:'${actor}',refreshSession:async()=>{}};export const useAuth=()=>auth;export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/login';`}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:"export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};"}));
  await p.route('**/src/services/collaboration.service.ts*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace(/const endpoint = [^;]+;/,'const endpoint = "http://127.0.0.1:5199";')});});
  await p.route('**/api/**',async r=>{
   const req=r.request(),url=new URL(req.url()),parts=url.pathname.split('/').map(decodeURIComponent);let data=[];
   if(parts[2]==='table-layouts'){
    if(req.method()==='GET')data=await(await fetch(`http://127.0.0.1:5199/layout?table=${encodeURIComponent(parts[3])}`)).json();
    else{if(req.method()!=='PATCH'||parts[4]!=='design')throw Error('Unexpected layout mutation');counts.designWrites++;const response=await fetch('http://127.0.0.1:5199/layout',{method:'POST',body:JSON.stringify({...req.postDataJSON(),table:parts[3],column:parts[5]})});data=await response.json();if(!response.ok)return r.fulfill({status:response.status,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture design conflict'})});}
   }else if(req.method()!=='GET'){counts.businessWrites++;throw Error('No business writes authorized in this fixture');}
   else if(url.pathname.startsWith('/api/master-data/')){counts.reportReads++;data={rows:[{id:'fixture-warehouse',code:'FIX',name:'Fixture Warehouse',address:'Fixture Address',status:'ACTIVE'}],pagination:{page:1,total:1,totalPages:1}};}
   else if(url.pathname.endsWith('/dispatch-monitoring/columns'))data={columns:[{key:'dispatch_number',title:'Dispatch Number',type:'text'},{key:'remarks',title:'Remarks',type:'text'}]};
   else if(url.pathname.endsWith('/dispatch-monitoring')){counts.reportReads++;data={rows:[{trip_id:trip,trip_stop_id:stop,dispatch_number:'DSP-FIXTURE',remarks:'Fixture remarks'}],pagination:{page:1,limit:50,total:1,totalPages:1}};}
   await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });await p.goto('http://localhost:5173/tests/table-fixture.html');await mount(p,actor);return p;
 };
 const root=p=>p.locator('#design-fixture');
 const cell=(p,key)=>root(p).locator(`tbody tr:first-child td[data-management-column="${key}"]`);
 const options=async(p,key)=>{await root(p).getByRole('button',{name:`${key} column options`,exact:true}).click();};
 const waitStyle=async(p,key,property,value)=>p.waitForFunction(({key,property,value})=>{const el=document.querySelector(`td[data-management-column="${key}"]`);return el&&getComputedStyle(el)[property]===value;},{key,property,value});
 try{
  await fetch('http://127.0.0.1:5199/layout-reset',{method:'POST'});
  const admin=await make('admin'),staff=await make('staff');await cell(admin,'code').waitFor();await cell(staff,'code').waitFor();await admin.waitForTimeout(500);
  await options(admin,'Code');await admin.getByRole('menuitem',{name:'Move right',exact:true}).click();
  await staff.waitForFunction(()=>document.querySelector('tbody tr td')?.getAttribute('data-management-column')==='name');
  if(await cell(staff,'code').innerText()!=='FIX')throw Error('Reorder mismatched record fields');
  await options(admin,'Code');await admin.getByRole('menuitem',{name:'Pin left',exact:true}).click();await waitStyle(staff,'code','position','sticky');await waitStyle(staff,'code','left','0px');
  await options(admin,'Name');await admin.getByRole('menuitem',{name:'Pin right',exact:true}).click();await waitStyle(staff,'name','position','sticky');await waitStyle(staff,'name','right','0px');
  await cell(staff,'address').click();const draft=cell(staff,'address').locator('input,textarea');await draft.fill('UNSAVED ADDRESS');
  await options(admin,'Address');await admin.getByRole('menuitem',{name:'Column color',exact:true}).click();await admin.getByRole('button',{name:'Set column color #bfdbfe',exact:true}).click();await admin.getByRole('button',{name:'Done',exact:true}).click();
  await admin.waitForTimeout(500);if(await draft.inputValue()!=='UNSAVED ADDRESS')throw Error('Remote design erased draft');
  if(await cell(staff,'address').evaluate(e=>getComputedStyle(e).backgroundColor)==='rgb(191, 219, 254)')throw Error('Remote layout applied while editing');
  await draft.press('Escape');await waitStyle(staff,'address','backgroundColor','rgb(191, 219, 254)');
  // A remote layout change is also deferred during a local drag.
  const handle=root(staff).getByRole('separator',{name:'Resize Address',exact:true});await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();await staff.mouse.move(box.x+box.width/2,box.y+box.height/2);await staff.mouse.down();await staff.mouse.move(box.x+20,box.y+box.height/2);
  await options(admin,'Address');await admin.getByRole('menuitem',{name:'Column color',exact:true}).click();await admin.getByRole('button',{name:'Set column color #fef2f2',exact:true}).click();await admin.getByRole('button',{name:'Done',exact:true}).click();await admin.waitForTimeout(500);
  await waitStyle(staff,'address','backgroundColor','rgb(191, 219, 254)');await staff.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel')));await staff.mouse.up();await waitStyle(staff,'address','backgroundColor','rgb(254, 242, 242)');
  await root(admin).getByRole('button',{name:'Hide Code column',exact:true}).click();await staff.waitForFunction(()=>getComputedStyle(document.querySelector('td[data-management-column="code"]')).display==='none');
  await root(admin).locator('summary').filter({hasText:'Hidden columns'}).click();await root(admin).getByRole('button',{name:'Restore all',exact:false}).click();await cell(staff,'code').waitFor();
  await staff.reload();await mount(staff,'staff');await waitStyle(staff,'address','backgroundColor','rgb(254, 242, 242)');await waitStyle(staff,'code','position','sticky');
  if(errors.length)throw Error(errors.join('; '));return {isolated:true,actualSocketTransport:true,roles:['ADMIN','STAFF'],order:true,leftRightPinning:true,color:true,visibility:true,reloadPersistence:true,activeDraftPreserved:true,remoteLayoutDeferredDuringResize:true,...counts,errors};
 }finally{await Promise.all(contexts.map(c=>c.close()));}
}
