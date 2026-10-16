// Real spreadsheet editors with isolated Auth/API fixtures. No production writes.
async(page)=>{
 const context=await page.context().browser().newContext({viewport:{width:1440,height:950}}),p=await context.newPage();
 const trip='123e4567-e89b-42d3-a456-000000000010',stop='123e4567-e89b-42d3-a456-000000000012';
 const rows=[1,2,3].map(n=>({trip_id:trip,trip_stop_id:`123e4567-e89b-42d3-a456-00000000001${n}`,dispatch_number:`DSP-${n}`}));
 const writes=[],errors=[];let malformed=false;
 p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"const auth={profile:{id:'fixture-admin',role:'ADMIN'},accessToken:'fixture-token',refreshSession:async()=>{}};export const useAuth=()=>auth;export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/login';"}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:"export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};"}));
  await p.route('**/api/**',async r=>{
   const request=r.request(),url=new URL(request.url());let data=[];
   if(url.pathname.endsWith('/dispatch-monitoring/columns'))data={columns:[{key:'dispatch_number',title:'Dispatch Number',type:'text'}]};
   else if(url.pathname.endsWith('/dispatch-monitoring'))data={rows:rows.map(row=>({...row})),pagination:{page:1,limit:50,total:3,totalPages:1}};
   if(request.method()==='PATCH') {
    if(url.pathname!==`/api/trips/${trip}/stops/${stop}`)throw Error('Wrong physical write target');
    const value=request.postDataJSON().dispatch_number;writes.push(value);
    if(malformed)data={id:stop,trip_id:trip};
    else{rows[1].dispatch_number=value;data={id:stop,trip_id:trip,dispatch_number:value};}
   } else if(request.method()!=='GET')throw Error('Unexpected fixture mutation');
   await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/login');
  await p.evaluate(async()=>{
   await import('/src/index.css');const code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
   const react=await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1]),React=react.default??react;
   const DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]);
   const {default:View}=await import('/src/components/admin/ReportDataView.tsx');
   const root=document.createElement('div');root.id='edit-persistence-fixture';Object.assign(root.style,{position:'fixed',inset:'0',zIndex:'2000',overflow:'auto',background:'white'});document.body.append(root);
   (DOM.createRoot??DOM.default.createRoot)(root).render(React.createElement(MemoryRouter,null,React.createElement(View,{initialReport:'dispatch-monitoring',showReportPicker:false})));
  });
  const root=p.locator('#edit-persistence-fixture');
  const row=value=>root.getByRole('row').filter({has:p.getByRole('checkbox',{name:'Select row '+value,exact:true})});
  await row('DSP-2').locator('td').nth(1).click();const editor=root.getByRole('textbox',{name:'Edit Dispatch Number',exact:true});
  await editor.fill('DSP-SAVED');await editor.press('Enter');await row('DSP-SAVED').waitFor();
  await p.waitForTimeout(5200);await row('DSP-SAVED').waitFor();
  await row('DSP-1').waitFor();await row('DSP-3').waitFor();
  malformed=true;await row('DSP-SAVED').locator('td').nth(1).click();await editor.fill('UNCONFIRMED');await editor.press('Enter');
  await root.getByText(/server did not confirm this cell/).waitFor();
  if(await editor.inputValue()!=='UNCONFIRMED')throw Error('Failed confirmation lost draft');
  await editor.press('Escape');await row('DSP-SAVED').waitFor();
  if(writes.length!==2)throw Error('Duplicate Enter/blur submission');
  if(errors.length)throw Error(errors.join('; '));
  return {mocked:true,productionWrites:0,delayedPersistence:true,siblingsPreserved:true,missingCanonicalValueRejectsSaved:true,draftPreserved:true,escapeCancels:true,writeRequests:writes.length,errors};
 }catch(error){throw Error(`${error.message}\nFixture: ${await p.locator('#edit-persistence-fixture').innerText().catch(()=> 'Not mounted')}\nErrors: ${JSON.stringify(errors)}`);}finally{await context.close();}
}
