// Actual Socket.IO and report grids. All business data are isolated fixtures.
async(page)=>{
 const contexts=[],errors=[];let removed=false;
 const trip='123e4567-e89b-42d3-a456-000000000010';
 try{
  const pages=[];
  for(const actor of ['admin','staff']){
   const context=await page.context().browser().newContext();contexts.push(context);const p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));
   await p.addInitScript(()=>localStorage.setItem('alzhen.app-session.v1','fixture-session'));
   await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`export const useAuth=()=>({profile:{id:'fixture-${actor}',role:'${actor==='admin'?'ADMIN':'STAFF'}'},accessToken:'${actor}'});`}));
   await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};'}));
   await p.route('**/src/services/collaboration.service.ts*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace(/const endpoint = [^;]+;/,'const endpoint = "http://127.0.0.1:5199";')});});
   await p.route('**/api/**',async r=>{
    if(r.request().method()!=='GET')throw Error('No business writes in this fixture');const path=new URL(r.request().url()).pathname;let data=[];
    if(path.endsWith('/combined/columns'))data={columns:[{key:'dispatch_number',title:'Dispatch Number',type:'text'},{key:'remarks',title:'Remarks',type:'text'}]};
    if(path.endsWith('/combined'))data={rows:[...(removed?[]:[{trip_id:trip,trip_stop_id:'123e4567-e89b-42d3-a456-000000000012',dispatch_number:'A',remarks:'Receipt stop A'},{trip_id:trip,trip_stop_id:'123e4567-e89b-42d3-a456-000000000013',dispatch_number:'B',remarks:'Receipt stop B'}]),{trip_id:'123e4567-e89b-42d3-a456-000000000030',trip_stop_id:'123e4567-e89b-42d3-a456-000000000031',dispatch_number:'UNRELATED',remarks:'Keep me'}],pagination:{page:1,limit:50,total:removed?1:3,totalPages:1}};
    await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
   });
   await p.goto('http://localhost:5173/tests/table-fixture.html');await p.evaluate(async actor=>{
    await import('/src/index.css');const code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
    const React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]);
    const {startCollaboration,collaborationSnapshot,subscribeCollaborationEvents}=await import(code.match(/from ["']([^"']*collaboration\.service\.ts[^"']*)["']/)[1]);startCollaboration(actor,`fixture-${actor}`,actor==='admin'?'ADMIN':'STAFF');window.fixtureCollaborationSnapshot=collaborationSnapshot;window.fixtureCommits=[];subscribeCollaborationEvents(event=>{if(event.kind==="commit")window.fixtureCommits.push(event.commit);});
    const {default:View}=await import('/src/components/admin/ReportDataView.tsx');const el=document.createElement('div');el.id='delete-realtime-fixture';document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(MemoryRouter,null,React.createElement(View,{initialReport:'combined',showReportPicker:false})));
   },actor);
  }
  for(const p of pages)await p.locator('#delete-realtime-fixture tbody tr').nth(2).waitFor();
  for(const p of pages)await p.waitForFunction(()=>window.fixtureCollaborationSnapshot?.().connected&&window.fixtureCollaborationSnapshot?.().viewers?.combined?.length===2);
  const staff=pages[1];await staff.locator('td[data-report-column-key=remarks]').nth(2).click();const editor=staff.getByRole('textbox',{name:'Edit Remarks',exact:true});await editor.fill('Unrelated draft survives');await staff.waitForTimeout(400);
  removed=true;await fetch('http://127.0.0.1:5199/trip-deleted',{method:'POST'});
  for(const p of pages)await p.waitForFunction(()=>document.querySelectorAll('#delete-realtime-fixture tbody tr').length===1);
  if(await editor.inputValue()!=='Unrelated draft survives')throw Error('Unrelated draft replaced');await editor.press('Escape');await staff.getByText('Keep me',{exact:true}).waitFor();
  if(errors.length)throw Error(errors.join(';'));return {contexts:2,realSocket:true,committedParentDelete:true,siblingStopsRemoved:true,unrelatedDraftPreserved:true,productionWrites:0};
 }catch(error){throw Error(error.message+' '+JSON.stringify({errors,states:await Promise.all(contexts.map(async context=>{const p=context.pages()[0];return p.evaluate(()=>({rows:document.querySelectorAll('#delete-realtime-fixture tbody tr').length,snapshot:window.fixtureCollaborationSnapshot?.(),commits:window.fixtureCommits}));}))}));}finally{await Promise.all(contexts.map(c=>c.close()));}
}
