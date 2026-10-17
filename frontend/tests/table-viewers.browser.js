// Actual viewer widget and Socket.IO server, isolated fixture identities.
async(page)=>{
 const contexts=[],errors=[];let stage="initial";
 const make=async(actor,table="trips")=>{
  const context=await page.context().browser().newContext();contexts.push(context);const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>localStorage.setItem('alzhen.app-session.v1','fixture-session'));
  await p.route('**/src/services/collaboration.service.ts*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace(/const endpoint = [^;]+;/,'const endpoint = "http://127.0.0.1:5199";')});});
  await p.route('**/api/**',()=>{throw Error('Viewer presence must not query business data');});
  const mount=async()=>p.evaluate(async({actor,table})=>{
   await import('/src/index.css');const code=await(await fetch('/src/components/admin/TableViewers.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
   const React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),collab=await import(code.match(/from ["']([^"']*collaboration\.service\.ts[^"']*)["']/)[1]),{default:View}=await import('/src/components/admin/TableViewers.tsx');
   const root=(DOM.createRoot??DOM.default.createRoot)(document.body.appendChild(document.createElement('div')));window.__table=table=>root.render(React.createElement(View,{table}));window.__connect=()=>collab.startCollaboration(actor,`fixture-${actor}`,actor==='admin'?'ADMIN':'STAFF');window.__disconnect=window.__connect();window.__table(table);
  },{actor,table});await p.goto('http://localhost:5173/tests/table-fixture.html');await mount();return {p,mount};
 };
 try{
  const a=await make('admin'),b=await make('staff');await a.p.getByRole('button',{name:'2 people viewing this table',exact:true}).waitFor();await b.p.getByRole('button',{name:'2 people viewing this table',exact:true}).click();await b.p.getByRole('dialog',{name:'People viewing this table'}).getByText('Fixture Admin',{exact:true}).waitFor();await b.p.getByRole('dialog').getByText('Fixture Staff',{exact:true}).waitFor();
  const tab=await make('admin');await tab.p.getByRole('button',{name:'2 people viewing this table',exact:true}).waitFor();await a.p.getByRole('button',{name:'2 people viewing this table',exact:true}).waitFor();
  await b.p.evaluate(()=>window.__table('combined'));await a.p.getByRole('button',{name:'1 people viewing this table',exact:true}).waitFor();await b.p.getByRole('button',{name:'1 people viewing this table',exact:true}).waitFor();
  await b.p.evaluate(()=>window.__table('trips'));await a.p.getByRole('button',{name:'2 people viewing this table',exact:true}).waitFor();
  await b.p.reload();await b.mount();await a.p.getByRole('button',{name:'2 people viewing this table',exact:true}).waitFor();
  stage='forced disconnect';await fetch('http://127.0.0.1:5199/disconnect-staff',{method:'POST'});await a.p.getByRole('button',{name:'1 people viewing this table',exact:true}).waitFor();await a.p.getByRole('button',{name:'2 people viewing this table',exact:true}).waitFor();
  await b.p.evaluate(()=>window.__disconnect());await a.p.getByRole('button',{name:'1 people viewing this table',exact:true}).waitFor();await b.p.evaluate(()=>{window.__disconnect=window.__connect();});await a.p.getByRole('button',{name:'2 people viewing this table',exact:true}).waitFor();
  if(errors.length)throw Error(errors.join('; '));return {isolated:true,actualSocketTransport:true,adminAndStaff:true,currentUserIncluded:true,tableIsolation:true,multipleTabsDeduplicated:true,refresh:true,disconnectReconnect:true,namePopover:true,productionWrites:0,errors};
 }catch(error){throw Error(`${stage}: ${error.message}; ${errors.join(";")}`);}finally{await Promise.all(contexts.map(c=>c.close()));}
}
