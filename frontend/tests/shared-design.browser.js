// Actual grids and Socket.IO; synthetic roles and fixture-only appearance writes.
async(page)=>{
 const contexts=[],errors=[],counts={designWrites:0,businessWrites:0,reportReads:0};
 const trip='123e4567-e89b-42d3-a456-000000000010',stop='123e4567-e89b-42d3-a456-000000000012';
 const mount=async(p,actor)=>p.evaluate(async actor=>{
  await import('/src/index.css');const code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
  const react=await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1]),React=react.default??react,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]);
  const {startCollaboration}=await import(code.match(/from ["']([^"']*collaboration\.service\.ts[^"']*)["']/)[1]);startCollaboration(actor,`fixture-${actor}`,actor==='admin'?'ADMIN':'STAFF');
  const {default:View}=await import('/src/components/admin/ReportDataView.tsx');const root=document.createElement('div');root.id='design-fixture';Object.assign(root.style,{position:'fixed',inset:'0',zIndex:'2000',overflow:'auto',background:'white'});document.body.append(root);(DOM.createRoot??DOM.default.createRoot)(root).render(React.createElement(MemoryRouter,null,React.createElement(View,{initialReport:'dispatch-monitoring',showReportPicker:false})));
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
   else if(url.pathname.endsWith('/dispatch-monitoring/columns'))data={columns:[{key:'dispatch_number',title:'Dispatch Number',type:'text'},{key:'remarks',title:'Remarks',type:'text'}]};
   else if(url.pathname.endsWith('/dispatch-monitoring')){counts.reportReads++;data={rows:[{trip_id:trip,trip_stop_id:stop,dispatch_number:'DSP-FIXTURE',remarks:'Fixture remarks'}],pagination:{page:1,limit:50,total:1,totalPages:1}};}
   await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });await p.goto('http://localhost:5173/login');await mount(p,actor);return p;
 };
 const cell=p=>p.locator('#design-fixture td[data-report-column-key=dispatch_number]');
 const style=async(p,property,value)=>p.waitForFunction(({property,value})=>{const cell=document.querySelector('#design-fixture td[data-report-column-key=dispatch_number]');return cell&&getComputedStyle(cell)[property]===value;},{property,value});
 try{
  await fetch('http://127.0.0.1:5199/layout-reset',{method:'POST'});
  const admin=await make('admin'),staff=await make('staff');await cell(admin).waitFor();await cell(staff).waitFor();await admin.waitForTimeout(400);
  await cell(admin).click();await cell(admin).locator('input').press('Escape');await admin.locator('#design-fixture').getByRole('button',{name:'Bold selected cells',exact:true}).click();await style(staff,'fontWeight','700');
  await cell(staff).click();await cell(staff).locator('input').fill('UNSAVED-DRAFT');
  await admin.locator('#design-fixture').getByRole('combobox',{name:'Font size',exact:true}).selectOption('16');await admin.waitForTimeout(400);
  if(await cell(staff).locator('input').inputValue()!=='UNSAVED-DRAFT')throw Error('Appearance event erased draft');
  await cell(staff).locator('input').press('Escape');await style(staff,'fontSize','16px');
  const search=admin.locator('#design-fixture').getByRole('combobox',{name:'Search rows or columns',exact:true});const before=counts.reportReads;await search.fill('Remarks');await admin.getByRole('option',{name:'Remarks',exact:true}).click();await admin.waitForTimeout(450);if(counts.reportReads!==before)throw Error('Column search filtered report rows');
  await search.fill('DSP');await search.press('Enter');await admin.waitForTimeout(450);if(counts.reportReads<=before)throw Error('Row search did not query server');
  await staff.reload();await mount(staff,'staff');await style(staff,'fontWeight','700');await style(staff,'fontSize','16px');
  if(errors.length)throw Error(errors.join('; '));return {isolated:true,actualSocketTransport:true,roles:['ADMIN','STAFF'],sharedBold:true,sharedFontSize:true,refreshPersistence:true,draftPreserved:true,columnSearchDoesNotFilter:true,rowSearchQueriesServer:true,...counts,errors};
 }finally{await Promise.all(contexts.map(c=>c.close()));}
}
