async(page)=>{
 // Offline UI regression only. All API requests stay in this browser's fixture
 // router. This is not a login or a verification of production permissions.
 const assert=(condition,message)=>{if(!condition)throw Error(message);};
 const actor={id:'f0241024-0000-4000-9000-000000000001',first_name:'Isolated',last_name:'UI fixture',email:'fixture@example.invalid',role:'ADMIN',is_admin:true,account_status:'ACTIVE'};
 const auth=route=>route.fulfill({contentType:'application/javascript',body:`export function AuthProvider({children}){return children;}export const getRoleBasedHomePath=()=>'/';export const useAuth=()=>(${JSON.stringify({user:{id:actor.id},profile:actor,accessToken:'isolated-ui-fixture',loading:false})});`});
 const profile=route=>route.fulfill({json:{success:true,data:{...actor,driver:null}}});
 const columns=route=>{const report=new URL(route.request().url()).pathname.split('/')[3];return route.fulfill({path:'C:/Users/WarL0cK/Documents/Coding projects/ALZHEN TMS/.playwright-mcp/spreadsheet-columns/'+report+'.json'});};
 const empty=route=>{const path=new URL(route.request().url()).pathname;if(path.startsWith('/api/table-layouts/'))return route.fulfill({json:{success:true,data:[]}});if(path==='/api/trips'||path.startsWith('/api/reports/')&&!path.endsWith('/columns'))return route.fulfill({json:{success:true,data:{rows:[],pagination:{page:1,limit:50,total:0,totalPages:1}}}});return route.fulfill({json:{success:true,data:[]}});};
 await page.route('**/src/context/AuthContext.tsx*',auth);
 await page.route('http://localhost:5000/api/**',empty);
 await page.route('**/api/users/*/profile',profile);
 await page.route('**/api/reports/*/columns*',columns);
 await page.goto("http://localhost:5175/");
 try{
  // Run the real application and grid components, with the narrower dataset
  // handler above this catch-all. No fixture write can reach a backend.
  const result=await (async()=>{


 // Isolated browser fixtures: no synthetic operational rows are inserted.
 const assert=(condition,message)=>{if(!condition)throw Error(message);};
 const bases={report:{rows:[{trip_id:'f0241024-0001-4000-9000-000000000100',_trip_id:'f0241024-0001-4000-9000-000000000100',trip_stop_id:'f0241024-0001-4000-9000-000000000111',_trip_stop_id:'f0241024-0001-4000-9000-000000000111',assignment_id:'f0241024-0001-4000-9000-000000000101',_assignment_id:'f0241024-0001-4000-9000-000000000101',quantity:'12',cbm:'3.6',loading_date:'2026-10-24',warehouse_name:'Demo Valenzuela',store_name:'Demo Quezon City',trip_status:'IN_PROGRESS'}]},database:{location_verification_supported:true,rows:[{id:'fixture',created_at:'2026-10-24T00:00:00Z',status:'ACTIVE'}]}};
 const uuid=i=>`f0241024-0000-4000-9000-${String(i).padStart(12,'0')}`;
 const reportRows=Array.from({length:10000},(_,i)=>({...bases.report.rows[0],_trip_line_item_id:uuid(i+1),trip_line_item_id:uuid(i+1),dispatch_number:`PERF DEMO ${String(i+1).padStart(5,'0')}`,remarks:'Isolated browser performance fixture'}));
 const databaseRows=Array.from({length:10000},(_,i)=>({...bases.database.rows[0],id:uuid(i+1),name:`PERF DEMO ${String(i+1).padStart(5,'0')}`,code:`PERF-${i+1}`}));
 const requests=[],mutations=[],designWrites=[];
 const handler=async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(path.startsWith('/api/auth/'))return route.fallback();
  if(request.method()!=='GET'){
   if(path.endsWith('/formulas/read'))return route.fulfill({json:{success:true,data:{formulas:[],sources:[]}}});
   if(request.method()==='POST'&&path==='/api/master-data/warehouses/selection'){const input=request.postDataJSON();return route.fulfill({json:{success:true,data:{search:input.search??'',before:new Date().toISOString(),total:databaseRows.length,ids:[],next:null}}});}
   if(request.method()==='PATCH'&&path.startsWith('/api/table-layouts/')){const body=request.postDataJSON();designWrites.push({path,body});const parts=path.split('/').map(decodeURIComponent);return route.fulfill({json:{success:true,data:{table_key:parts[3],column_key:parts.at(-1),width_px:body.initial_width_px??body.width_px??180,revision:(body.expected_revision??0)+1,design:body.patch??{}}}});}
   if(request.method()==='PATCH'&&path.startsWith('/api/master-data/warehouses/')){
    const id=path.split('/').pop(),row=databaseRows.find(r=>r.id===id);assert(row,'Only fixture records may be edited');Object.assign(row,request.postDataJSON());mutations.push(id);return route.fulfill({json:{success:true,data:row}});
   }
   if(path.includes('/api/')&&['POST','PATCH','DELETE','PUT'].includes(request.method())&&!path.endsWith('/overview-details'))return route.abort('blockedbyclient');
   return route.fallback();
  }
  const report=path==='/api/reports/dispatch-monitoring',database=path==='/api/master-data/warehouses';
  if(!report&&!database)return route.fallback();
  const source=report?reportRows:databaseRows,needle=(url.searchParams.get('search')??'').toLowerCase();
  let rows=source.filter(row=>!needle||Object.values(row).some(value=>String(value??'').toLowerCase().includes(needle)));
  const sort=url.searchParams.get('sort_by')??url.searchParams.get('sort'),direction=url.searchParams.get('sort_order')??url.searchParams.get('direction');
  if(sort)rows=[...rows].sort((a,b)=>String(a[sort]??'').localeCompare(String(b[sort]??''))*(direction==='desc'?-1:1)||a.id?.localeCompare(b.id??'')||0);
  const current=Math.max(1,Number(url.searchParams.get('page')??1)),limit=Number(url.searchParams.get('limit')??50);
  requests.push({module:report?'report':'database',sourceLines:url.searchParams.get('source_lines')==='true',page:current,limit,search:needle});
  return route.fulfill({json:{success:true,data:{...(report?bases.report:bases.database),rows:rows.slice((current-1)*limit,current*limit),pagination:{page:current,limit,total:rows.length,totalPages:Math.ceil(rows.length/limit)}}}});
 };
 await page.route('http://localhost:5000/api/**',handler);
 const viewport=()=>page.locator('.spreadsheet-viewport:visible').last();
 const results={fixtureRecords:20000,requests:0};
 try{
  await page.reload();await page.getByRole('button',{name:'Trips',exact:true}).waitFor({state:'visible',timeout:60000});await page.getByRole('button',{name:'Trips',exact:true}).click();await page.getByRole('tab',{name:'Master List',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('tr[data-virtual-index]').length>0);
  assert(requests.filter(r=>r.module==='report'&&r.sourceLines).every(r=>r.limit<=50),'Initial report request must be bounded');
  const start=Date.now();let lastLoaded=0;
  for(let i=0;i<24;i++){
   const previous=requests.length;
   await viewport().evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'));});
   await page.waitForFunction(()=>document.querySelectorAll('tr[data-virtual-index]').length>0);
   for(let attempt=0;attempt<30&&requests.length===previous;attempt++)await page.waitForTimeout(25);
   await page.waitForTimeout(120);
   lastLoaded=Math.max(...requests.filter(r=>r.module==='report'&&r.sourceLines).map(r=>r.page*r.limit));
   if(lastLoaded>=500)break;
  }
  const mounted=await page.locator('tr[data-virtual-index]:visible').count();
  results.requests=requests.length;results.lastLoaded=lastLoaded;results.diagnostics=await page.evaluate(()=>({footer:document.body.innerText.slice(-450),viewports:[...document.querySelectorAll(".spreadsheet-viewport")].filter(e=>e.clientHeight>0).map(e=>({h:e.clientHeight,s:e.scrollHeight,top:e.scrollTop}))}));
  assert(lastLoaded>=500,'Scrolling must automatically load further pages');assert(mounted<120,'Virtualization must bound mounted DOM rows');
  results.report={loaded:lastLoaded,mountedRows:mounted,scrollMs:Date.now()-start};
  const search=page.getByLabel('Search rows or columns',{exact:true});await search.fill('PERF DEMO 09999');await search.press('Enter');
  await page.locator('tr[data-virtual-index]').filter({hasText:'PERF DEMO 09999'}).waitFor({state:'visible',timeout:15000});assert(requests.some(r=>r.search==='perf demo 09999'),'Search must reach the server adapter');
  results.report.unloadedSearch=true;await search.fill('');
  await page.getByRole('button',{name:'Database',exact:true}).click();await page.getByRole('tab',{name:'Warehouses',exact:true}).click();
  await page.waitForTimeout(500);
  for(let i=0;i<6;i++){await viewport().evaluate(e=>{e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event('scroll'));});await page.waitForTimeout(120);}
  results.database={pages:Math.max(0,...requests.filter(r=>r.module==='database').map(r=>r.page)),mountedRows:await page.locator('tr[data-virtual-index]:visible').count()};
  assert(results.database.pages>1,'Database must load on scroll');assert(results.database.mountedRows<120,'Database must virtualize');
  await viewport().evaluate(e=>{e.scrollTop=Math.max(0,e.scrollTop-e.clientHeight*2);});await page.waitForTimeout(500);
  const key=await viewport().evaluate(e=>{const bounds=e.getBoundingClientRect();const cells=[...e.querySelectorAll('td[data-database-cell$="|name"]')].filter(cell=>{const r=cell.getBoundingClientRect();return r.top>bounds.top+70&&r.bottom<bounds.bottom;});return cells[Math.floor(cells.length/2)]?.getAttribute('data-database-cell');});assert(key,'A visible editable fixture cell must exist');const recordId=key.split('|')[0];const cell=page.locator(`[data-database-cell="${key}"]`);
  await cell.dblclick();const editor=cell.locator('input');await editor.fill('PERF confirmed edit');await editor.press('Enter');
  await cell.filter({hasText:'PERF confirmed edit'}).waitFor({state:'visible'});assert(mutations.includes(recordId),'Enter must save a deep-row edit');
  const resizedRow=cell.locator('xpath=..');const before=await resizedRow.evaluate(e=>e.getBoundingClientRect().height);
  const handle=resizedRow.getByRole('separator',{name:'Resize row height',exact:true});const box=await handle.boundingBox();assert(box,'Row resize handle must be present after scrolling');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+28,{steps:5});await page.mouse.up();await page.waitForTimeout(300);
  assert(designWrites.some(w=>w.body.patch?.rowHeights?.[recordId]),'Row height must save against the stable record ID');
  assert(await resizedRow.evaluate(e=>e.getBoundingClientRect().height)>before,'All cells must grow with their row');results.database.deepEditAndResize=true;
  const gutter=page.getByRole('button',{name:'Select row',exact:false}).last();await gutter.click();const all=page.getByRole('checkbox',{name:'Select all matching rows',exact:true});await all.click();
  await page.getByText('10000 records selected',{exact:true}).waitFor({state:'visible'});results.database.sheetWideSelection=true;await all.click();await page.getByRole('button',{name:'Select all matching rows',exact:true}).waitFor({state:'visible'});

  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
  results.mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert(!results.mobileOverflow,'No mobile page overflow');
  await page.screenshot({path:'.playwright-mcp/spreadsheet-scale-mobile.png',fullPage:false});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'.playwright-mcp/spreadsheet-scale-desktop.png',fullPage:false});
  results.requests=requests.length;results.databaseFixtureWrites=mutations.length;results.designFixtureWrites=designWrites.length;return results;
 }catch(error){throw Error(error.message+'; partial metrics: '+JSON.stringify(results));}finally{await page.unroute('http://localhost:5000/api/**',handler);await page.setViewportSize({width:1440,height:1000});await page.reload();}

  })();
  return {isolated:true,...result};
 }finally{await page.goto('about:blank');await page.unrouteAll({behavior:'ignoreErrors'});await page.goto('http://localhost:5173/login');}
}
