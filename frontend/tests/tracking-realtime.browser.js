async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage();let reads=0,latitude=10,offline=false;
 try{
  await p.route('**/src/services/collaboration.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const subscribeCollaborationEvents=fn=>{window.trackingEvent=fn;return()=>{window.trackingEvent=null;};};'}));
  await p.route('**/api/**',r=>{
   if(r.request().method()!=='GET')throw Error('Read-only fixture');
   if(r.request().url().includes('/tracking/capabilities'))return r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{enabled:true}})});
   if(!r.request().url().includes('/tracking/active'))throw Error('Unexpected endpoint');
   reads++;if(offline)return r.abort('internetdisconnected');return r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{rows:[{assignmentId:'fixture-assignment',tripId:'fixture-trip',latitude}],next:null}})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{
   const code=await(await fetch('/src/components/admin/useTrackedAssignments.ts')).text(),main=await(await fetch('/src/main.tsx')).text();
   const React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {useTrackedAssignments}=await import('/src/components/admin/useTrackedAssignments.ts');
   function Probe(){const rows=useTrackedAssignments('fixture-token');return React.createElement('output',{'aria-label':'Latest latitude'},rows[0]?.latitude??'loading');}
   const el=document.createElement('div');document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(Probe));
  });
  await p.getByLabel('Latest latitude').filter({hasText:'10'}).waitFor();if(reads!==1)throw Error('Initial read duplicated');
  latitude=11;await p.evaluate(()=>window.trackingEvent({kind:'tracking'}));
  await p.getByLabel('Latest latitude').filter({hasText:'11'}).waitFor();if(reads!==2)throw Error('Commit did not bypass cached GPS');
  await p.evaluate(()=>window.trackingEvent({kind:'notification'}));if(reads!==2)throw Error('Unrelated event reloaded GPS');
  offline=true;await p.evaluate(()=>window.trackingEvent({kind:'tracking'}));
  await p.waitForTimeout(100);if(reads!==3||await p.getByLabel('Latest latitude').innerText()!=='11')throw Error('Network loss cleared valid marker');
  offline=false;latitude=12;await p.evaluate(()=>window.trackingEvent({kind:'connected'}));
  await p.getByLabel('Latest latitude').filter({hasText:'12'}).waitFor();if(reads!==4)throw Error('Reconnect failed');
  return {isolated:true,initialRequests:1,committedUpdateRequests:1,failedNetworkRequests:1,cachedMarkerRetained:true,reconnectRequests:1,unrelatedEventRequests:0,productionWrites:0};
 }finally{await context.close();}
}
