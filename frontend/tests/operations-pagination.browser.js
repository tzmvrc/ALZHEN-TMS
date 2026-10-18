// Actual Operations screen; bounded server fixture with 101 Offloads and one Backload.
async(page)=>{
 const context=await page.context().browser().newContext({viewport:{width:1500,height:1000}}),p=await context.newPage(),requests=[],errors=[];
 const trip='00000000-0000-4000-8000-000000000001';
 const make=(i,type='OFFLOAD')=>{const id=`00000000-0000-4000-8000-${String(i+100).padStart(12,'0')}`,stop=`00000000-0000-4000-8000-00000000001${i%2+1}`,report={id,trip_id:trip,trip_stop_id:stop,reason:'Fixture',comments:i===101?'Across page needle':`Fixture ${i}`,items:[{id,offload_id:id,trip_line_item_id:null,quantity:i,total_cbm:0}]};return {id:`${type.toLowerCase()}:${id}`,source_type:type,source_record_id:id,loading_report_id:null,unloading_report_id:null,trip_id:trip,trip_stop_id:stop,trip_number:1,dispatch_number:`DSP-${i}`,assignment_id:null,date:'2026-10-17T00:00:00Z',plate_number:'FIX-1',driver_name:'Fixture Driver',route:'Fixture route',dr_number:`DR-${i}`,quantity:i,total_cbm:0,report_type:type==='OFFLOAD'?'Offload':'Backload',report_types:[type==='OFFLOAD'?'Offload':'Backload'],event_type_records:[{id,source_type:type,event_type:type==='OFFLOAD'?'Offload':'Backload'}],offload_records:type==='OFFLOAD'?[report]:[],backload_records:type==='BACKLOAD'?[report]:[],line_items:[],loading_timestamps:null,unloading_timestamps:null,remarks:report.comments,reason:'Fixture',reported_by:null,stop_sequence:i%2+1,scope_label:'Fixture'};};
 let rows=[...Array.from({length:101},(_,i)=>make(i+1)),make(102,'BACKLOAD')];
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"const auth={profile:{id:'fixture-admin',role:'ADMIN'},accessToken:'fixture-token'};export const useAuth=()=>auth;"}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};'}));
  await p.route('**/src/services/realtime.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:'const listeners=new Set();window.signal=()=>listeners.forEach(fn=>fn({kind:"batch",tables:["offloads"]}));export const subscribeToAdminRealtime=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};'}));
  await p.route('**/api/**',async r=>{const req=r.request(),url=new URL(req.url());let data=[];
   if(url.pathname.endsWith('/operations/overview'))throw Error('Unbounded overview requested');
   if(url.pathname.endsWith('/operations/page')){
    requests.push(url.search);const q=url.searchParams,search=(q.get('search')??'').toLowerCase(),filter=q.get('filter'),size=Number(q.get('limit')),number=Number(q.get('page')),sort=q.get('sort_by'),direction=q.get('sort_order')==='asc'?1:-1;
    const all=rows.filter(row=>(filter==='All'||row.report_type===filter)&&(!search||[row.dispatch_number,row.remarks].some(v=>v.toLowerCase().includes(search)))).sort((a,b)=>sort==='quantity'?(a.quantity-b.quantity)*direction:a.source_record_id.localeCompare(b.source_record_id));
    data={trips:[{id:trip}],trip_options:[],stops:[],loading:[],unloading:[],backloads:[],offloads:[],event_rows:all.slice((number-1)*size,number*size),pagination:{page:number,limit:size,total:all.length,totalPages:Math.max(1,Math.ceil(all.length/size))}};
   }else if(url.pathname.endsWith('/operations/reports/delete')){
    const input=req.postDataJSON();if(input.current_password!=="fixture-password")throw Error("Password missing");
    const targets=input.targets;rows=rows.filter(row=>!targets.some(target=>target.source_type===row.source_type&&target.record_id===row.source_record_id));
    data={outcomes:targets.map(target=>({...target,success:true,result:{...target,cleanup_pending:false}}))};
   }
   else if(req.method()!=='GET')throw Error('Unexpected mutation '+url.pathname);
   await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{await import('/src/index.css');const code=await(await fetch('/src/components/admin/OperationsReportsView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text(),React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{default:View}=await import('/src/components/admin/OperationsReportsView.tsx');const el=document.createElement('div');document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(View,{mode:'management'}));});
  const ready=async(text)=>{await p.getByText(text,{exact:false}).waitFor();await p.waitForFunction(()=>!document.body.innerText.includes('Refreshing…')&&!document.body.innerText.includes('Refreshing reports…'));};
  await ready('102 reports · Page 1 of 3');
  await p.getByRole('checkbox',{name:'Select row DSP-1',exact:true}).check();await p.getByRole('button',{name:'Next',exact:true}).click();await ready('Page 2 of 3');if(!await p.getByRole('button',{name:'Delete selected reports',exact:true}).isDisabled())throw Error('Hidden page selection survived');
  const before=requests.length;await p.getByRole('button',{name:'Previous',exact:true}).click();await ready('Page 1 of 3');if(requests.length!==before)throw Error('Cached page refetched');
  const search=p.getByRole('combobox',{name:'Search rows or columns'});await search.fill('Across page needle');await search.press('Enter');await ready('1 reports · Page 1 of 1');await p.getByRole('checkbox',{name:'Select row DSP-101',exact:true}).waitFor();
  await search.fill('No-such-fixture-record');await search.press('Enter');await ready('0 reports · Page 1 of 1');await p.getByText('No operational report rows available',{exact:true}).waitFor();if(await p.locator('table').count())throw Error('Empty page kept a grid');
  await search.fill('');await search.press('Enter');await ready('102 reports · Page 1 of 3');await p.getByRole('button',{name:'Backload',exact:true}).click();await ready('1 reports · Page 1 of 1');await p.getByRole('checkbox',{name:'Select row DSP-102',exact:true}).waitFor();
  await p.getByRole('button',{name:'Offload',exact:true}).click();await ready('101 reports · Page 1 of 3');
  await p.getByRole('columnheader').filter({hasText:'Quantity'}).getByRole('button',{name:'Quantity',exact:true}).click();await ready('101 reports · Page 1 of 3');await p.waitForFunction(()=>document.querySelector('tbody input[type=checkbox]')?.getAttribute('aria-label')==='Select row DSP-1');
  await p.getByRole('columnheader').filter({hasText:'Quantity'}).getByRole('button',{name:/Quantity/}).first().click();await p.waitForFunction(()=>document.querySelector('tbody input[type=checkbox]')?.getAttribute('aria-label')==='Select row DSP-101');await p.getByRole('columnheader').filter({hasText:'Quantity'}).getByRole('button',{name:/Quantity/}).first().click();await p.waitForFunction(()=>document.querySelector('tbody input[type=checkbox]')?.getAttribute('aria-label')==='Select row DSP-1');
  await p.getByRole('button',{name:'Next',exact:true}).click();await ready('Page 2 of 3');await p.getByRole('button',{name:'Next',exact:true}).click();await ready('Page 3 of 3');
  await p.getByRole('checkbox',{name:'Select row DSP-101',exact:true}).check();await p.getByRole('button',{name:'Delete selected reports',exact:true}).click();await p.getByLabel('Current account password').fill('fixture-password');await p.getByRole('alertdialog').getByRole('button',{name:'Delete 1 report',exact:true}).click();await ready('100 reports · Page 2 of 2');
  const remarks=p.locator('tbody tr').filter({has:p.getByRole('checkbox',{name:'Select row DSP-51',exact:true})}).getByText('Fixture 51',{exact:true});await remarks.click();const draft=p.locator('tbody textarea');await draft.fill('UNSAVED OPERATIONS DRAFT');if(!await p.getByRole('button',{name:'Previous',exact:true}).isDisabled())throw Error('Page navigation enabled during edit');
  rows=rows.map(row=>row.dispatch_number==='DSP-51'?{...row,remarks:'Remote confirmed'}:row);await p.evaluate(()=>window.signal());await p.waitForTimeout(500);if(await draft.inputValue()!=='UNSAVED OPERATIONS DRAFT')throw Error('Realtime erased paged draft');await draft.press('Escape');await p.getByText('Remote confirmed',{exact:true}).waitFor();
  if(errors.length)throw Error(errors.join('\n'));
  return {isolated:true,fixtureRows:102,pageRequests:requests.length,cachedReturnRequests:0,crossPageSearch:true,emptyResult:true,classificationFilter:true,serverSort:true,pageSelectionCleared:true,lastPageDeletionCorrected:true,realtimeRefresh:true,activeDraftPreserved:true,productionWrites:0,errors};
 }catch(error){throw Error(String(error)+'; requests='+JSON.stringify(requests)+'; pageErrors='+JSON.stringify(errors)+'; UI='+(await p.locator('body').innerText()).slice(0,3000));}finally{await context.close();}
}
