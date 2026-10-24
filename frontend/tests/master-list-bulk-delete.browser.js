// Master List selection and impact preview only. Every API call is intercepted.
async(page,role='ADMIN')=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),errors=[],impacts=[];let writes=0;
 const rows=Array.from({length:30},(_,index)=>({trip_id:`123e4567-e89b-42d3-a456-${String(index+1).padStart(12,'0')}`,dispatch_number:`FIXTURE-${index+1}`,transaction_dr_number:`DR-${index+1}`}));
 p.on('pageerror',error=>errors.push(error.message));
 try{
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`const auth={profile:{id:"fixture",role:${JSON.stringify(role)}},accessToken:"fixture-token",refreshSession:async()=>{}};export const useAuth=()=>auth;`}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};'}));
  await p.route('**/api/**',async r=>{
   const req=r.request(),url=new URL(req.url());let data=[];
   if(req.method()==='POST'&&url.pathname==='/api/reports/formulas/read')data={formulas:[],sources:[]};
   else if(req.method()==='POST'&&url.pathname==='/api/trips/whole-delete/impact'){
    const ids=req.postDataJSON().trip_ids;impacts.push(ids);
    data={trips:ids.map(id=>({id,dispatch_number:rows.find(row=>row.trip_id===id)?.dispatch_number})),counts:{trip_stops:ids.length,trip_line_items:ids.length},blockers:['Fixture: preview only'],can_delete:false};
   }else if(req.method()!=='GET'){writes++;await r.abort();return;}
   else if(url.pathname.endsWith('/dispatch-monitoring/columns'))data={columns:[{key:'dispatch_number',title:'Dispatch Number',type:'text'},{key:'transaction_dr_number',title:'DR Number',type:'text'}]};
   else if(url.pathname.endsWith('/dispatch-monitoring'))data={rows,pagination:{page:1,limit:200,total:30,totalPages:1}};
   await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{
   await import('/src/index.css');
   const code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text(),React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]),{default:View}=await import('/src/components/admin/ReportDataView.tsx');
   const el=document.createElement('div');document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(MemoryRouter,null,React.createElement(View,{initialReport:'dispatch-monitoring',transactionView:true,allTripRecords:true,showReportPicker:false})));
  });
  await p.getByRole('button',{name:'Select spreadsheet row 1',exact:true}).waitFor();
  let action=p.getByRole('button',{name:'Delete Selected Trips',exact:true});
  if(role!=='ADMIN'){
   if(await action.count())throw Error('Non-admin whole-trip delete exposed');
   await p.getByRole('button',{name:'Select all matching rows',exact:true}).click();
   await p.getByRole('checkbox',{name:'Select all matching rows',exact:true}).waitFor();
   if(await action.count())throw Error('Non-admin selection exposed whole-trip delete');
   return {isolated:true,role,adminRestrictionPreserved:true,productionWrites:writes};
  }
  if(await action.count())throw Error('Bulk delete remains visible without selection');
  await p.getByRole('button',{name:'Select all matching rows',exact:true}).click();
  await p.getByRole('checkbox',{name:'Select all matching rows',exact:true}).waitFor();
  if(await action.count())throw Error('Bulk delete remains visible for 30 selected trips');
  for(let index=30;index>20;index--)await p.getByRole('checkbox',{name:`Select spreadsheet row ${index}`,exact:true}).uncheck();
  if(await action.count())throw Error('Bulk delete remains visible for 20 selected trips');
  // A mixed checkbox becomes checked first; a second click clears the selection.
  const all=p.getByRole('checkbox',{name:'Select all matching rows',exact:true});await all.click();
  await p.waitForFunction(()=>document.querySelector('input[aria-label="Select all matching rows"]')?.getAttribute('aria-checked')==='true');await all.click();
  await p.getByRole('button',{name:'Select all matching rows',exact:true}).waitFor();
  if(await action.count())throw Error('Clearing selection revived bulk delete');
  await p.getByRole('button',{name:'Select spreadsheet row 1',exact:true}).click();
  action=p.getByRole('button',{name:'Delete Entire Trip',exact:true});
  if(await action.isDisabled())throw Error('Single-trip deletion disabled');
  await action.click();const dialog=p.getByRole('alertdialog');await dialog.getByRole('heading',{name:'Delete Entire Trip',exact:true}).waitFor();
  if(impacts.length!==1||JSON.stringify(impacts[0])!==JSON.stringify([rows[0].trip_id]))throw Error('Wrong single-trip deletion scope');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  if(writes||errors.length)throw Error(JSON.stringify({writes,errors}));
  return {isolated:true,bulkDeleteRemoved:true,clearSelection:true,singleTripAction:true,productionWrites:0};
 }finally{await context.close();}
}
