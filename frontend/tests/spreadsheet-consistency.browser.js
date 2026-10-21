// Isolated real six-sheet workspace; no network access outside local mocked APIs.
async(page)=>{
 const context=await page.context().browser().newContext({viewport:{width:1440,height:1000}}),p=await context.newPage(),errors=[],requests=[],mutations=[];
 const uuid=n=>'123e4567-e89b-42d3-a456-'+String(n).padStart(12,'0');
 const rows=Array.from({length:220},(_,i)=>({trip_id:uuid(10+i),_trip_id:uuid(10+i),trip_stop_id:uuid(1000+i),trip_line_item_id:uuid(2000+i),store_call_id:uuid(3000+i),dispatch_number:'DSP-'+i,remarks:'Fixture '+i,store_call_remarks:'Call '+i,quantity:100,cbm:250}));
 p.on('pageerror',error=>errors.push(error.message));
 try{
 await p.route('**/*',r=>{const u=new URL(r.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)?r.continue():r.abort();});
 await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"const a={profile:{id:'fixture-admin',role:'ADMIN',first_name:'Fixture',last_name:'Admin'},user:{user_metadata:{}},accessToken:'fixture-token',refreshSession:async()=>{}};export const useAuth=()=>a;"}));
 await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:"export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};"}));
 await p.route('**/api/**',async r=>{const q=r.request(),u=new URL(q.url()),path=u.pathname;requests.push({method:q.method(),path});let data=[];
 const match=/\/reports\/(dispatch-monitoring|dispatch|trip-booking|store-calling)(\/columns)?$/.exec(path);
 if(match)data=match[2]?{columns:[{key:'dispatch_number',title:'Dispatch Number',type:'text'},{key:'quantity',title:'Quantity',type:'number'},{key:'cbm',title:'CBM',type:'number'},{key:match[1]==='store-calling'?'store_call_remarks':'remarks',title:'Remarks',type:'text'}]}:{rows:rows.slice(),pagination:{page:1,limit:250,total:rows.length,totalPages:1}};
 else if(path.endsWith('/transmittal-tracker/page'))data={table_id:uuid(9),access:{canView:true,canEdit:true,canManage:true,isAdmin:true},columns:[],rows:rows.slice(0,12).map(x=>({...x,warehouse_code:'WH',delivered_to:'Store',plate_number:'FIX-001',driver_name:'Driver',delivery_receipt_no:'DR',transmittal_ref:'REF',status:'Completed',cells:{},legacy_conflicts:[]})),pagination:{page:1,limit:50,total:12,totalPages:1}};
 else if(path.endsWith('/formulas/read'))data={formulas:[],sources:[]};
 else if(path.endsWith('/capabilities'))data={enabled:true};
 if(!['GET','OPTIONS'].includes(q.method())&&!path.endsWith('/formulas/read')){mutations.push({method:q.method(),path});return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture mutation blocked'})});}
 await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});});
 await p.goto('http://localhost:5173/tests/table-fixture.html');
 await p.evaluate(async()=>{const main=await(await fetch('/src/main.tsx')).text(),code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text();const React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]);await import('/src/index.css');const {default:Workspace}=await import('/src/components/admin/ReportsWorkspace.tsx');const el=document.body.appendChild(document.createElement('div'));Object.assign(el.style,{height:'100vh'});const root=(DOM.createRoot??DOM.default.createRoot)(el);window.stopFixture=()=>root.unmount();root.render(React.createElement(MemoryRouter,null,React.createElement(Workspace,{initialReport:'combined'})));});
 const labels=['Master List','Dispatch Monitoring','Dispatch Report','Trip Booking','Store Calling','Transmittal Tracker'],switchMs=[];
 for(const label of labels){const start=Date.now();await p.getByRole('tab',{name:label,exact:true}).click();await p.getByRole('tabpanel').locator('tbody td[data-report-column-key],tbody td[data-tracker-field]').first().waitFor({timeout:15000});switchMs.push({label,ms:Date.now()-start});}
 await p.waitForTimeout(1500);const warmSwitchMs=[];const readCount=requests.filter(x=>/^\/api\/reports\/(dispatch-monitoring|dispatch|trip-booking|store-calling)$/.test(x.path)).length;for(const label of labels){const t=Date.now();await p.getByRole('tab',{name:label,exact:true}).click();await p.getByRole('tabpanel').locator('tbody td[data-report-column-key],tbody td[data-tracker-field]').first().waitFor();warmSwitchMs.push({label,ms:Date.now()-t});}const repeatReportReads=requests.filter(x=>/^\/api\/reports\/(dispatch-monitoring|dispatch|trip-booking|store-calling)$/.test(x.path)).length-readCount;await p.getByRole('tab',{name:'Master List',exact:true}).click();await p.waitForTimeout(500);const panel=p.getByRole('tabpanel');const metrics=await panel.evaluate(async el=>{const cells=[...el.querySelectorAll('td[data-report-column-key]')];const timings=[];for(let i=0;i<20;i++){const t=performance.now();cells[i%cells.length].dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',button:0}));await new Promise(requestAnimationFrame);timings.push(performance.now()-t);}return {selectionFrameMs:timings,renderedRows:el.querySelectorAll('tbody tr[data-virtual-index]').length,headerTransforms:[...el.querySelectorAll('[data-spreadsheet-header-title]')].map(x=>getComputedStyle(x).transform)};});
 const before=requests.length;for(let i=0;i<10;i++)await panel.locator('td[data-report-column-key]').nth(i).click();await p.waitForTimeout(250);const after=requests.slice(before);
 // A retained sheet must not reset its local query/selection or scroll geometry.
 const search=panel.getByRole('combobox',{name:'Search rows or columns'});await search.fill('DSP');await search.press('Enter');await panel.getByRole('button',{name:'Select spreadsheet row 1',exact:true}).click();
 await panel.locator('.spreadsheet-viewport').evaluate(el=>{el.scrollTop=300;});await p.waitForTimeout(100);
 const savedScroll=await panel.locator('.spreadsheet-viewport').evaluate(el=>el.scrollTop);
 await p.getByRole('tab',{name:'Dispatch Monitoring',exact:true}).click();if(await p.getByRole('tabpanel').getByRole('button',{name:'Edit selected row',exact:true}).count())throw Error('Selection leaked between sheets sharing a report projection');
 await p.getByRole('tab',{name:'Master List',exact:true}).click();await panel.getByRole('button',{name:'Edit selected row',exact:true}).waitFor();
 const restoredScroll=await panel.locator('.spreadsheet-viewport').evaluate(el=>el.scrollTop);if(Math.abs(savedScroll-restoredScroll)>1||await search.inputValue()!=='DSP')throw Error('Retained sheet reset: '+JSON.stringify({savedScroll,restoredScroll,query:await search.inputValue()}));
 await panel.locator('.spreadsheet-viewport').evaluate(el=>{el.scrollTop=0;});await search.fill('');await search.press('Enter');await p.waitForTimeout(100);
 const retention={savedScroll,restoredScroll,queryPreserved:true,selectionPreserved:true,selectionIsolated:true};
 const actionChecks=[];
 for(const label of labels){
  await p.getByRole('tab',{name:label,exact:true}).click();const grid=p.getByRole('tabpanel');
  const gutter=label==='Transmittal Tracker'?'Select row 1':'Select spreadsheet row 1';
  await grid.getByRole('button',{name:gutter,exact:true}).click();
  const edit=grid.getByRole('button',{name:'Edit selected row',exact:true});await edit.waitFor();
  if(await edit.innerText())throw Error('Edit action contains visible text');if(!await edit.evaluate(el=>el.classList.contains('rounded-full')))throw Error('Edit is not circular');if(await grid.getByRole('button',{name:'Show filters',exact:true}).count())throw Error('Filter icon remains');const weights=await grid.locator('th[data-header-column-key],thead th [data-spreadsheet-header-title]').evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).fontWeight));if(weights.some(weight=>Number(weight)<700))throw Error('Header not bold: '+label+' '+weights);
  await edit.click();const dialog=p.getByRole('dialog').filter({has:p.getByRole('button',{name:'Cancel',exact:true})});await dialog.waitFor();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  const remove=grid.getByRole('button',{name:label==='Transmittal Tracker'?'Reset selected transmittal overrides':label==='Master List'?'Delete Entire Trip':'Delete selected line items only',exact:true});
  if(label==='Store Calling'){if(await grid.locator('[data-report-toolbar-actions] button[title*="Delete"]').count())throw Error('Store call offered unsafe deletion');}
  else {await remove.waitFor();if(await remove.innerText())throw Error('Delete action contains visible text');if(!await remove.evaluate(el=>el.classList.contains('rounded-full')))throw Error('Action not circular');}
  const transform=await grid.locator('[data-spreadsheet-header-title]').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).transform));if(transform.some(value=>value!=='none'))throw Error('Angled header in '+label);
  if(label==='Transmittal Tracker'){
   const head=grid.getByRole('checkbox',{name:'Clear selected rows and exit row selection'}),body=grid.getByRole('checkbox',{name:'Select row 1',exact:true});
   const h=await head.boundingBox(),b=await body.boundingBox();if(Math.abs(h.x+h.width/2-b.x-b.width/2)>1||h.width!==b.width||h.height!==b.height)throw Error('Tracker checkbox misalignment');
   const height=await body.locator('xpath=ancestor::tr').evaluate(row=>{row.style.height='70px';return row.getBoundingClientRect().height;});
   const aligned=await body.evaluate(box=>{const a=box.getBoundingClientRect(),r=box.closest('td').getBoundingClientRect();return Math.abs(a.y+a.height/2-r.y-r.height/2);});if(aligned>1)throw Error('Checkbox not centered after row resize');
   await grid.locator('.spreadsheet-viewport').evaluate(el=>{el.scrollTop=80;el.scrollLeft=250;});
   await p.screenshot({path:'frontend/tests/artifacts/tracker-checkbox-alignment.png'});
   actionChecks.push({sheet:label,edit:true,resetOverrides:true,parentDelete:false,gutterWidth:h.width,centerDelta:Math.abs(h.x+h.width/2-b.x-b.width/2),resizedRowHeight:height,verticalCenterDelta:aligned});
  }else actionChecks.push({sheet:label,edit:true,delete:label!=='Store Calling'});
  await p.screenshot({path:'frontend/tests/artifacts/sheet-'+label.toLowerCase().replaceAll(' ','-')+'.png'});
  await grid.getByRole('checkbox',{name:'Clear selected rows and exit row selection'}).click();
  if(await grid.getByRole('button',{name:'Edit selected row',exact:true}).count())throw Error('Edit remained without selection');
 }
 await p.getByRole('tab',{name:'Master List',exact:true}).click();
 await p.screenshot({path:'frontend/tests/artifacts/spreadsheet-consistency.png',fullPage:true});
 if(errors.length)throw Error(errors.join(';'));
 return {isolated:true,productionWrites:0,switchMs,warmSwitchMs,repeatReportReads,retention,actionChecks,...metrics,requestsDuringClicks:after,mutations,errors};
 }catch(error){throw Error(error.message+' errors='+JSON.stringify(errors)+' requests='+JSON.stringify(requests.slice(-15)));}finally{await context.close();}
}
