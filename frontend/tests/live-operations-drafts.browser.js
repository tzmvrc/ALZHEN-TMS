// Real Operations and sockets in two contexts. Read-only synthetic APIs; no flex rows created.
async(page)=>{
 const contexts=[],errors=[];let writes=0;
 const trip='123e4567-e89b-42d3-a456-000000000010',stop='123e4567-e89b-42d3-a456-000000000012';
 const make=async actor=>{
  const context=await page.context().browser().newContext({viewport:{width:1700,height:1000}});contexts.push(context);const p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));
  await p.addInitScript(()=>localStorage.setItem('alzhen.app-session.v1','fixture-session'));
  await p.route('**/src/context/AuthContext.tsx*',route=>route.fulfill({contentType:'text/javascript',body:`export const useAuth=()=>({profile:{id:'fixture-${actor}',role:'${actor==='admin'?'ADMIN':'STAFF'}'},accessToken:'${actor}'});`}));
  await p.route('**/src/lib/supabase.ts*',route=>route.fulfill({contentType:'text/javascript',body:'export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};'}));
  await p.route('**/src/services/collaboration.service.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/const endpoint = [^;]+;/,'const endpoint = "http://127.0.0.1:5199";')});});
  await p.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url());if(request.method()!=='GET'){writes++;throw Error('Unexpected write during draft');}let data=[];
   if(url.pathname.endsWith('/operations/page'))data={trips:[{id:trip}],trip_options:[],stops:[],loading:[],unloading:[],backloads:[],offloads:[],event_rows:[{id:'unloading:'+stop,source_type:'UNLOADING',source_record_id:stop,trip_id:trip,trip_stop_id:stop,dispatch_number:'DSP-A',assignment_id:null,date:'2026-10-19T00:00:00Z',plate_number:'FIX-A',driver_name:'Fixture',route:'Test route',dr_number:'DR-A',quantity:1,total_cbm:1,report_type:'Unloading',report_types:['Unloading'],event_type_records:[],offload_records:[],backload_records:[],line_items:[],loading_timestamps:null,unloading_timestamps:null,remarks:'Initial',reason:null,reported_by:null,stop_sequence:1,scope_label:'Stop A'}],pagination:{page:1,limit:50,total:1,totalPages:1}};
   await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async actor=>{
   await import('/src/index.css');const code=await(await fetch('/src/components/admin/OperationsReportsView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
   const React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   // Resolve the exact collaboration module used by the table's presence hook.
   const presenceCode=await(await fetch('/src/components/admin/useSpreadsheetCollaboration.tsx')).text();
   const collaboration=await import(presenceCode.match(/from ["']([^"']*collaboration\.service\.ts[^"']*)["']/)[1]);window.fixtureCollaboration=collaboration;window.fixtureStop=collaboration.startCollaboration(actor,`fixture-${actor}`,actor==='admin'?'ADMIN':'STAFF');
   const {default:View}=await import('/src/components/admin/OperationsReportsView.tsx'),el=document.createElement('div');document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(View,{mode:'management'}));
  },actor);
  await p.getByRole('checkbox',{name:'Select row DSP-A',exact:true}).waitFor();return p;
 };
 try{
  const admin=await make('admin'),staff=await make('staff');
  await admin.getByRole('row').filter({has:admin.getByRole('checkbox',{name:'Select row DSP-A',exact:true})}).getByText('DSP-A',{exact:true}).click();const input=admin.getByRole('textbox',{name:'Edit Dispatch Number',exact:true});await input.fill('UNSAVED OPERATIONS');
  await staff.waitForFunction(()=>[...document.querySelectorAll('[data-live-draft]')].some(node=>node.getAttribute('data-live-draft-value')==='UNSAVED OPERATIONS'));
  await input.press('Escape');await staff.locator('[data-live-draft]').waitFor({state:'hidden'});
  if(writes||errors.length)throw Error(JSON.stringify({writes,errors}));return {contexts:2,actualOperations:true,realSocketTransport:true,physicalStopIdentity:true,typingWrites:0,cancelWrites:0,productionWrites:0};
 }finally{await Promise.all(contexts.map(context=>context.close()));}
}

