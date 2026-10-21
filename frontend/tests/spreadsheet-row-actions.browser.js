// Exact physical child writes, partial failure and role UI using fake API data only.
async(page)=>{
 const contexts=[],errors=[],deletes=[],patches=[],results=[],requests=[];let stage="init";
 const uuid=n=>'123e4567-e89b-42d3-a456-'+String(n).padStart(12,'0');
 const make=async(report,role='ADMIN',master=false,physicalCalls=false)=>{stage=`${report}:${role}:${master}`;
  const context=await page.context().browser().newContext({viewport:{width:1440,height:1000}});contexts.push(context);const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  let rejectSecond=true;const deleted=new Set(),rows=[0,1].map(n=>({trip_id:uuid(10),trip_stop_id:uuid(20+n),trip_line_item_id:uuid(30+n),store_call_id:uuid(40+n),_store_call_version:2,dispatch_number:'DSP-'+n,quantity:10,remarks:'Cargo',store_call_remarks:'Call '+n,date_assigned:'2026-10-20',status:'READY'}));
  await p.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`const a={profile:{id:'fixture-${role}',role:'${role}'},accessToken:'fixture-${role}',refreshSession:async()=>{}};export const useAuth=()=>a;`}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:"export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};"}));
  await p.route('**/api/**',async r=>{const q=r.request(),path=new URL(q.url()).pathname;requests.push({method:q.method(),path});let data=[];
   if(path===`/api/reports/${report}/columns`)data={columns:report==='store-calling'?[{key:'store_call_remarks',title:'Call Remarks',type:'text'},{key:'date_assigned',title:'Date Assigned',type:'date'}]:[{key:'dispatch_number',title:'Dispatch',type:'text'},{key:'quantity',title:'Quantity',type:'number'},{key:'remarks',title:'Remarks',type:'text'}]};
   else if(path===`/api/reports/${report}`)data={rows:rows.filter(x=>!deleted.has(physicalCalls?x.store_call_id:x.trip_line_item_id)),pagination:{page:1,limit:50,total:rows.length-deleted.size,totalPages:1}};
   else if(path.endsWith('/formulas/read'))data={formulas:[],sources:[]};
   else if(path.endsWith('/deletion-capabilities'))data={storeCalls:physicalCalls,emptyStops:false};
   else if(path.endsWith('/capabilities'))data={enabled:true};
   if(q.method()==='DELETE'&&physicalCalls){
    if(!/^\/api\/store-calls\/[^/]+$/.test(path)||q.postDataJSON().expected_version!==2)throw Error('Wrong physical call identity or version');
    const id=path.split('/').at(-1);if(!rows.some(row=>row.store_call_id===id))throw Error('Unknown call');deletes.push({path,body:q.postData()});await new Promise(resolve=>setTimeout(resolve,150));
    if(id===uuid(41)&&rejectSecond){rejectSecond=false;return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture dependency'})});}deleted.add(id);data={id,trip_id:uuid(10)};
   }else if(q.method()==='DELETE'){
    if(!/^\/api\/trips\/[^/]+\/stops\/[^/]+\/line-items\/[^/]+$/.test(path))throw Error('Unsafe deletion '+path);
    const id=path.split('/').at(-1),row=rows.find(x=>x.trip_line_item_id===id);if(!row||!path.includes('/'+row.trip_stop_id+'/')||!path.includes('/'+row.trip_id+'/'))throw Error('Physical parent mismatch');
    deletes.push({path,body:q.postData()});await new Promise(resolve=>setTimeout(resolve,150));
    if(id===uuid(31)&&rejectSecond){rejectSecond=false;return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture protected record'})});}
    deleted.add(id);data={id};
   }else if(q.method()==='PATCH'){
    const payload=q.postDataJSON();patches.push({path,payload});
    if(report!=='store-calling'||path!==`/api/store-calls/${uuid(40)}`)throw Error('Wrong source edit '+path);
    Object.assign(rows[0],{store_call_remarks:payload.remarks});data={id:uuid(40),trip_id:uuid(10),trip_stop_id:uuid(20),...payload};
   }else if(q.method()!=='GET'&&!path.endsWith('/formulas/read'))throw Error('Unexpected write '+path);
   await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async({report,master})=>{await import('/src/index.css');const main=await(await fetch('/src/main.tsx')).text(),code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text();const React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]),{default:View}=await import('/src/components/admin/ReportDataView.tsx'),{ToastProvider}=await import('/src/components/ui/Toast.tsx');const el=document.body.appendChild(document.createElement('div'));(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(MemoryRouter,null,React.createElement(ToastProvider,null,React.createElement(View,{initialReport:report,transactionView:master,showReportPicker:false}))));},{report,master});
  if(role==='TRUCKER')await p.getByText('Flexible tables are available to ADMIN and STAFF accounts.',{exact:true}).waitFor();else await p.locator('td[data-report-column-key]').first().waitFor();return p;
 };
 try{
  const p=await make('dispatch');await p.getByRole('button',{name:'Select spreadsheet row 1',exact:true}).click();await p.getByRole('checkbox',{name:'Select spreadsheet row 2',exact:true}).check();
  await p.getByRole('button',{name:'Delete selected line items only',exact:true}).click();const dialog=p.getByRole('alertdialog',{name:'Delete selected line items'});
  if(await dialog.locator('input[type=password]').count())throw Error('Password reentry');
  await dialog.getByRole('heading',{name:'Delete 2 selected line items?'}).waitFor();const confirm=dialog.getByRole('button',{name:'Delete selected line items',exact:true});await confirm.click();if(!await dialog.getByRole('button',{name:'Deleting...',exact:true}).isDisabled())throw Error('Missing submission lock');
  await dialog.getByRole('heading',{name:'Delete 1 selected line item?'}).waitFor();if(deletes.length!==2)throw Error('Duplicate bulk requests');
  if(await p.getByRole('checkbox',{name:'Select spreadsheet row 1',exact:true}).isChecked()!==true)throw Error('Failed target selection lost');
  await dialog.getByRole('button',{name:'Delete selected line items',exact:true}).click();await dialog.waitFor({state:'hidden'});if(deletes.length!==3)throw Error('Retry repeated successful target');
  results.push('exact child scope, one confirmation, partial failure retains selection, retry only failed item');
  const staff=await make('dispatch-monitoring','STAFF',true);await staff.getByRole('button',{name:'Select spreadsheet row 1',exact:true}).click();if(await staff.getByRole('button',{name:/Delete Entire Trip|Delete selected line items only/}).count())throw Error('Staff main sheet exposed a delete fallback');results.push('Staff cannot delete parent or substitute a child delete in Master List');
  const trucker=await make('dispatch','TRUCKER');if(await trucker.getByRole('button',{name:/Edit selected row|Delete selected line items only/}).count())throw Error('Trucker action exposed');results.push('Trucker actions hidden');
  const calls=await make('store-calling');const target=calls.locator('td[data-report-column-key="store_call_remarks"]').first();await target.click();const bar=calls.getByLabel('Formula or cell value');await bar.fill('Confirmed call');await bar.press('Enter');await target.getByText('Confirmed call',{exact:true}).waitFor();if(patches.length!==1||patches[0].payload.remarks!=='Confirmed call')throw Error('Call source save wrong');
  await calls.getByRole('button',{name:'Select spreadsheet row 1',exact:true}).click();await calls.getByRole('button',{name:'Edit selected row',exact:true}).waitFor();if(await calls.getByRole('button',{name:/Delete/}).count())throw Error('Call deletion substituted cargo');results.push('Store Calling exact source editing and no unsafe delete');
  const physical=await make('store-calling','ADMIN',false,true);await physical.getByRole('button',{name:'Select spreadsheet row 1',exact:true}).click();await physical.getByRole('checkbox',{name:'Select spreadsheet row 2',exact:true}).check();await physical.getByRole('button',{name:'Delete selected store calls only',exact:true}).click();const callDialog=physical.getByRole('alertdialog',{name:'Delete selected store calls'});if(await callDialog.locator('input[type=password]').count())throw Error('Physical delete requested password');const beforeCalls=deletes.length;await callDialog.getByRole('button',{name:'Delete selected records',exact:true}).click();await callDialog.getByRole('heading',{name:'Delete 1 selected store calls?'}).waitFor();if(!await physical.getByRole('checkbox',{name:'Select spreadsheet row 1',exact:true}).isChecked())throw Error('Failed physical target selection lost');if(deletes.length!==beforeCalls+2)throw Error('Duplicate physical submissions');await callDialog.getByRole('button',{name:'Delete selected records',exact:true}).click();await callDialog.waitFor({state:'hidden'});if(deletes.length!==beforeCalls+3)throw Error('Physical retry repeated success');results.push('Capability-enabled store-call deletion: exact identity/version, partial selection retained, retry only failure');
  if(errors.length)throw Error(errors.join(';'));return {isolated:true,productionWrites:0,results,deleteRequests:deletes,sourcePatches:patches,errors};
 }catch(e){throw Error(stage+': '+e.message+' errors='+JSON.stringify(errors)+' requests='+JSON.stringify(requests.slice(-12))+' ui='+(await contexts.at(-1).pages()[0].locator('body').innerText()).slice(-1500));}finally{for(const context of contexts)await context.close();}
}
