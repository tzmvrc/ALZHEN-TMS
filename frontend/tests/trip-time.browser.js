// Actual report editor; isolated timestamp writes and two sibling stops.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),writes=[],errors=[];
 const trip='123e4567-e89b-42d3-a456-000000000010',stop='123e4567-e89b-42d3-a456-000000000012',sibling='123e4567-e89b-42d3-a456-000000000013';
 let start='2026-10-16T15:45:23.000Z';p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"const auth={profile:{id:'fixture-admin',role:'ADMIN'},accessToken:'fixture-token',refreshSession:async()=>{}};export const useAuth=()=>auth;"}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};'}));
  await p.route('**/api/**',async r=>{const req=r.request(),url=new URL(req.url());let data=[];
   if(req.method()==='PATCH'){if(url.pathname!==`/api/trips/${trip}/stops/${stop}`)throw Error('Wrong physical stop');const body=req.postDataJSON();writes.push(body);start=body.start_unloading_time;data={id:stop,trip_id:trip,start_unloading_time:start};}
   else if(req.method()!=='GET')throw Error('Unexpected mutation');
   else if(url.pathname.endsWith('/dispatch-monitoring/columns'))data={columns:[{key:'start_unloading_time',title:'Unloading Start',type:'date'},{key:'finish_unloading_time',title:'Unloading Finish',type:'date'}]};
   else if(url.pathname.endsWith('/dispatch-monitoring'))data={rows:[{trip_id:trip,trip_stop_id:stop,start_unloading_time:start,finish_unloading_time:'2026-10-16T16:30:10.000Z'},{trip_id:trip,trip_stop_id:sibling,start_unloading_time:'2026-10-16T01:00:00Z',finish_unloading_time:null}],pagination:{page:1,total:2,totalPages:1,limit:50}};
   await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{await import('/src/index.css');const code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text(),React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]),{default:View}=await import('/src/components/admin/ReportDataView.tsx');const el=document.createElement('div');document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(MemoryRouter,null,React.createElement(View,{initialReport:'dispatch-monitoring',showReportPicker:false})));});
  const cells=p.locator('td[data-report-column-key=start_unloading_time]'),finish=p.locator('td[data-report-column-key=finish_unloading_time]');await cells.first().getByText('11:45 PM',{exact:true}).waitFor();await finish.first().getByText('12:30 AM',{exact:true}).waitFor();
  await cells.first().click();const input=cells.first().locator('input[type=time]');await input.fill('23:50');await input.press('Enter');await cells.first().getByText('11:50 PM',{exact:true}).waitFor();
  if(start!=='2026-10-16T15:50:23.000Z')throw Error('Event date or seconds changed');if(!await cells.nth(1).getByText('9:00 AM',{exact:true}).isVisible())throw Error('Sibling time changed');
  if(writes.length!==1||errors.length)throw Error(JSON.stringify({writes,errors}));return {isolated:true,manilaDisplay:true,timeInput:true,dateAndSecondsPreserved:true,midnightFinishDateUnchanged:true,siblingPreserved:true,writeRequests:writes.length,productionWrites:0,errors};
 }finally{await context.close();}
}
