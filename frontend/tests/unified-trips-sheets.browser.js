// Actual five report grids and source-save adapters; every API is isolated.
async(page)=>{
 const context=await page.context().browser().newContext({viewport:{width:1440,height:950}}),p=await context.newPage(),errors=[],requests=[],writes=[],formulas=new Map();
 const trip='123e4567-e89b-42d3-a456-000000000010',stop='123e4567-e89b-42d3-a456-000000000012';
 const row={trip_id:trip,_trip_id:trip,trip_stop_id:stop,dispatch_number:'DSP-BASE',trip_number:'TRIP-BASE',trip_line_item_id:'123e4567-e89b-42d3-a456-000000000013',store_call_id:'123e4567-e89b-42d3-a456-000000000014',remarks:'Original',quantity:100,cbm:250};
 p.on('pageerror',error=>errors.push(error.message));
 try{
  await p.route('**/*',route=>{const url=new URL(route.request().url());return url.hostname==='localhost'||url.hostname==='127.0.0.1'?route.continue():route.abort();});
  await p.route('**/src/context/AuthContext.tsx*',route=>route.fulfill({contentType:'text/javascript',body:"const auth={profile:{id:'fixture-admin',role:'ADMIN'},accessToken:'fixture-token',refreshSession:async()=>{}};export const useAuth=()=>auth;"}));
  await p.route('**/src/lib/supabase.ts*',route=>route.fulfill({contentType:'text/javascript',body:"export const supabase={channel(){return{on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};"}));
  await p.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url()),path=url.pathname;requests.push(path);let data=[];
   const report=/\/reports\/(dispatch-monitoring|dispatch|trip-booking|store-calling)(\/columns)?$/.exec(path);
   if(report)data=report[2]?{columns:[{key:'dispatch_number',title:'Dispatch Number',type:'text'},{key:'quantity',title:'Quantity',type:'number'},{key:'cbm',title:'CBM',type:'number'},{key:'remarks',title:'Remarks',type:'text'}]}:{rows:[{...row}],pagination:{page:1,limit:50,total:1,totalPages:1}};
   else if(path.endsWith('/formulas/read'))data={formulas:[...formulas.values()].filter(item=>item.table_key===request.postDataJSON().table_key),sources:[]};
   else if(path.endsWith('/formulas/save')){const body=request.postDataJSON();data=body.changes.map(change=>{const key=body.table_key+':'+change.row_identity+':'+change.column_key,old=formulas.get(key);const value={id:old?.id??'fixture-'+formulas.size,table_key:body.table_key,row_identity:change.row_identity,column_key:change.column_key,formula_expression:change.expression,reference_bindings:change.references,version:(old?.version??0)+1,is_deleted:change.expression===null};formulas.set(key,value);return value;});}
   else if(path.endsWith('/capabilities'))data={enabled:false};
   if(request.method()==='PATCH'){
    if(path!==`/api/trips/${trip}/stops/${stop}`)throw Error('Unexpected source target '+path);
    const payload=request.postDataJSON();writes.push(payload);row.dispatch_number=payload.dispatch_number??row.dispatch_number;data={id:stop,trip_id:trip,...payload};
   }else if(request.method()!=='GET'&&!path.endsWith('/formulas/read')&&!path.endsWith('/formulas/save'))throw Error('Unexpected fixture mutation '+path);
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{
   const main=await(await fetch('/src/main.tsx')).text(),code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text();
   const React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]);await import('/src/index.css');const {default:Workspace}=await import('/src/components/admin/ReportsWorkspace.tsx');
   const root=(DOM.createRoot??DOM.default.createRoot)(document.body.appendChild(document.createElement('div')));window.stopFixture=()=>root.unmount();root.render(React.createElement(MemoryRouter,null,React.createElement(Workspace,{initialReport:'combined'})));
  });
  const sheets=[['Trips','dispatch-monitoring'],['Dispatch Monitoring','dispatch-monitoring'],['Dispatch Report','dispatch'],['Trip Booking','trip-booking'],['Store Calling','store-calling']];
  for(const [label,key] of sheets){
   await p.getByRole('tab',{name:label,exact:true}).click();const panel=p.getByRole('tabpanel');await panel.locator('td[data-report-column-key="dispatch_number"]').first().click();
   const value='DSP-'+label.replaceAll(' ','-');const bar=panel.getByLabel('Formula or cell value');const sourceEditor=panel.getByRole('textbox',{name:'Edit Dispatch Number',exact:true});await sourceEditor.fill('DRAFT-'+label);if(await bar.inputValue()!=='DRAFT-'+label)throw Error('Source draft not mirrored in formula bar: '+label);await sourceEditor.press('End');await sourceEditor.press('=');if(await bar.inputValue()!=='DRAFT-'+label+'=')throw Error('An equals sign inside normal text incorrectly entered formula mode');await bar.fill(value);await bar.press('Enter');await panel.getByRole('textbox',{name:'Formula or cell value'}).waitFor();
   await p.waitForFunction(()=>!document.querySelector('[role="tabpanel"] input[aria-label="Formula or cell value"]')?.readOnly);
   await panel.locator('td[data-report-column-key="dispatch_number"]').getByText(value,{exact:true}).waitFor({timeout:5000}).catch(async error=>{throw Error(JSON.stringify({stage:label,writes,row,bar:await bar.inputValue(),text:(await panel.innerText()).slice(-1200),errors,requests}));});
   await panel.locator('td[data-report-column-key="remarks"]').first().click();
   if(label==='Trips'){
    await panel.getByRole('textbox',{name:'Edit Remarks',exact:true}).press('=');
    const inline=panel.locator('input[data-formula-inline]');await panel.locator('td[data-report-column-key="quantity"]').click();await inline.press('+');await panel.locator('td[data-report-column-key="cbm"]').click();
    if(await inline.inputValue()!=='=B1+C1'||await bar.inputValue()!=='=B1+C1')throw Error('In-cell reference entry not synchronized');await inline.press('Enter');
   }else {await bar.fill('=B1+C1');await bar.press('Enter');} await panel.locator('td[data-report-column-key="remarks"]').getByText('350',{exact:true}).waitFor();if(await bar.inputValue()!=='=B1+C1')throw Error('Saved expression lost in '+label);
  }
  if(formulas.size!==5||row.remarks!=='Original')throw Error('Overlay/source separation failed');
  const uniqueSources=[...new Set(requests.filter(path=>/^\/api\/reports\/(dispatch-monitoring|dispatch|trip-booking|store-calling)$/.test(path)))];
  if(uniqueSources.length!==4)throw Error('Wrong report sources');if(writes.length<4)throw Error('Source edits missing');if(errors.length)throw Error(errors.join(';'));
  await p.evaluate(()=>window.stopFixture());return{isolated:true,sheets:5,uniqueSources,writes:writes.length,formulaOverlays:formulas.size,sourceDraftSynchronization:true,inCellFormulaStart:true,sourceIdentityVerified:true,productionWrites:0,errors};
 }finally{await context.close();}
}
