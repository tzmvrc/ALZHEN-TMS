// Actual report editor; isolated timestamp writes and two sibling stops.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),writes=[],errors=[];
 const trip='123e4567-e89b-42d3-a456-000000000010',stop='123e4567-e89b-42d3-a456-000000000012',sibling='123e4567-e89b-42d3-a456-000000000013';
 const loadingId='123e4567-e89b-42d3-a456-000000000014';let failNext=false;let finish=null;let start='2026-10-16T15:45:23.000Z';p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"const auth={profile:{id:'fixture-admin',role:'ADMIN'},accessToken:'fixture-token',refreshSession:async()=>{}};export const useAuth=()=>auth;"}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};'}));
  await p.route('**/src/services/realtime.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:`const listeners=new Set();window.fixtureRealtime=event=>listeners.forEach(fn=>fn(event));export const subscribeToAdminRealtime=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};export const REPORT_REALTIME_TABLES={combined:['loading_reports'],dispatch:['loading_reports'],'dispatch-monitoring':['loading_reports']};`}));
  await p.route('**/api/**',async r=>{const req=r.request(),url=new URL(req.url());let data=[];
   if(req.method()==='PATCH'){if(url.pathname!==`/api/reports/operations/loading/${trip}/reports/${loadingId}`)throw Error('Wrong physical loading report');const body=req.postDataJSON();writes.push(body);if(failNext){failNext=false;await r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture loading write failed'})});return;}if('loading_start_at' in body)start=body.loading_start_at;if('loading_finished_at' in body)finish=body.loading_finished_at;data={id:loadingId,trip_id:trip,loading_start_at:start,loading_finished_at:finish};}
   else if(req.method()!=='GET')throw Error('Unexpected mutation');
   else if(url.pathname.endsWith('/dispatch-monitoring/columns'))data={columns:[{key:'loading_start_at',title:'Loading Start',type:'date'},{key:'loading_finished_at',title:'Loading Finish',type:'date'}]};
   else if(url.pathname.endsWith('/dispatch-monitoring'))data={rows:[{trip_id:trip,trip_stop_id:stop,loading_report_id:loadingId,loading_start_at:start,loading_finished_at:finish},{trip_id:trip,trip_stop_id:sibling,loading_report_id:loadingId,loading_start_at:start,loading_finished_at:finish}],pagination:{page:1,total:2,totalPages:1,limit:50}};
   await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });await p.goto('http://localhost:5173/tests/table-fixture.html');
  async function mount(){await p.evaluate(async()=>{await import('/src/index.css');const code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text(),React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]),{default:View}=await import('/src/components/admin/ReportDataView.tsx');const el=document.createElement('div');document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(MemoryRouter,null,React.createElement(View,{initialReport:'dispatch-monitoring',showReportPicker:false})));});}await mount();
  const cells=p.locator('td[data-report-column-key=loading_start_at]'),finishCells=p.locator('td[data-report-column-key=loading_finished_at]');await cells.first().getByText('11:45 PM',{exact:true}).waitFor();
  await cells.first().click();const input=cells.first().locator('input[type=time]');await input.fill('23:50');await input.press('Enter');await cells.first().getByText('11:50 PM',{exact:true}).waitFor();
  if(start!=='2026-10-16T15:50:23.000Z')throw Error('Event date or seconds changed');await cells.nth(1).getByText('11:50 PM',{exact:true}).waitFor();
  await finishCells.first().click();const blank=finishCells.first().locator('input[type=datetime-local]');await blank.fill('2026-10-17T00:35');await blank.blur();await finishCells.first().getByText('12:35 AM',{exact:true}).waitFor();if(finish!=='2026-10-16T16:35:00.000Z')throw Error('Blank milestone date shifted');
  await cells.first().click();const cancel=cells.first().locator('input[type=time]');await cancel.fill('22:00');await cancel.press('Escape');await cells.first().getByText('11:50 PM',{exact:true}).waitFor();
  failNext=true;await finishCells.first().click();const failed=finishCells.first().locator('input[type=time]');await failed.fill('00:40');await failed.press('Enter');
  await p.getByText('Something went wrong. Please try again later.',{exact:true}).waitFor();if(await failed.inputValue()!=='00:40'||finish!=='2026-10-16T16:35:00.000Z')throw Error('Failed save discarded draft or changed saved timestamp');await failed.press('Escape');
  // A remote persisted update is deferred until this local draft is cancelled.
  await cells.first().click();const draft=cells.first().locator('input[type=time]');await draft.fill('22:10');
  start='2026-10-16T15:55:23.000Z';await p.evaluate(()=>window.fixtureRealtime({kind:'batch',tables:['loading_reports']}));
  await p.waitForTimeout(900);if(await draft.inputValue()!=='22:10')throw Error('Realtime erased active draft');
  await draft.press('Escape');await cells.first().getByText('11:55 PM',{exact:true}).waitFor();
  await p.waitForTimeout(5100);await cells.first().getByText('11:55 PM',{exact:true}).waitFor();
  await p.reload();await mount();await cells.first().getByText('11:55 PM',{exact:true}).waitFor();await finishCells.first().getByText('12:35 AM',{exact:true}).waitFor();
  if(writes.length!==3||errors.length)throw Error(JSON.stringify({writes,errors}));return {isolated:true,manilaDisplay:true,timeInput:true,dateAndSecondsPreserved:true,midnightFinishDatePreserved:true,sharedLoadingIdentity:true,blankDateExplicit:true,blurSaves:true,escapeCancels:true,realtimeDraftPreserved:true,realtimeRefresh:true,fiveSecondPersistence:true,reload:true,failedSaveRetainsDraft:true,writeRequests:writes.length,productionWrites:0,errors};
 }finally{await context.close();}
}
