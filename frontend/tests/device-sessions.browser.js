// Uses read-only directory/session snapshots. Security writes affect this fixture only.
async(page,saved)=>{
 const assert=(v,m)=>{if(!v)throw Error(m);};const errors=[],writes=[];
 const target=saved.directory.staff.rows.find(r=>saved.summary.find(s=>s.id===r.id)?.active_sessions>0);assert(target,'No saved account with active sessions');
 const name=[target.first_name,target.last_name].filter(Boolean).join(' ');let sessions=saved.sessions.filter(s=>s.profile_id===target.id).map((s,i)=>({...s,current_device:i===0})),locked_at=null;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`export const useAuth=()=>({profile:{id:'${target.id}',role:'ADMIN'},accessToken:'isolated-admin'});export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/login';export const getRoleBasedLoginPath=()=>'/login';`}));
 await page.route('**/src/services/realtime.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const subscribeToAdminRealtime=()=>()=>{};'}));
 await page.route('**/api/**',async route=>{
  const req=route.request(),u=new URL(req.url());let data=[];
  if(req.method()!=='GET'){
   assert(u.pathname===`/api/users/${target.id}/device-security`||u.pathname===`/api/users/${target.id}/security/password`,'Unexpected mutation '+u.pathname);
   const body=req.postDataJSON();assert(body.confirmed===true,'Unconfirmed security action');writes.push({path:u.pathname,action:body.action??'password'});
   if(body.action==='revoke')sessions=sessions.filter(s=>s.id!==body.session_id);
   if(body.action==='lock'){sessions=[];locked_at=new Date().toISOString();}
   if(body.action==='unlock')locked_at=null;
   data={saved:true};
  }else if(u.pathname==='/api/users/directory')data=saved.directory[u.searchParams.get('category')??'staff'];
  else if(u.pathname==='/api/users/device-sessions/summary')data=saved.summary.map(s=>s.id===target.id?{...s,active_sessions:sessions.length,locked_at}:s);
  else if(u.pathname===`/api/users/${target.id}/device-sessions`)data={sessions,locked_at};
  await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
 });
 await page.goto('http://localhost:5173/tests/table-fixture.html');
 await page.evaluate(async()=>{
  await import('/src/index.css');const code=await(await fetch('/src/pages/Admin/views/TruckersView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
  const React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),router=await import(code.match(/from ["']([^"']*react-router-dom[^"']*)["']/)[1]),{default:View}=await import('/src/pages/Admin/views/TruckersView.tsx');
  const el=document.createElement('div');el.id='security-review';Object.assign(el.style,{height:'95vh',display:'flex',flexDirection:'column',padding:'12px',background:'white'});document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(router.BrowserRouter,null,React.createElement(View)));
 });
 const cell=page.getByRole('button',{name:`View active sessions for ${name}`,exact:true});await cell.waitFor();assert(Number(await cell.textContent())===sessions.length,'Count differs from backend snapshot');
 assert(await cell.locator('.session-count-link').evaluate(e=>getComputedStyle(e).textDecorationLine.includes('underline')&&getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)'),'Count is not a plain underlined link');
 const box=await cell.boundingBox();await cell.click({position:{x:box.width-5,y:box.height/2}});
 await page.getByRole('dialog').waitFor();await page.getByText('This device',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();await cell.focus();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();
 for(const width of [320,360,375,390,430,768]){await page.setViewportSize({width,height:700});assert(await page.getByRole('dialog').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&e.scrollWidth<=e.clientWidth+1}),'Session modal overflow '+width);}
 await page.setViewportSize({width:1280,height:900});
 await page.screenshot({path:'.playwright-mcp/admin-device-sessions.png',fullPage:true});
 const first=sessions[0];await page.getByRole('button',{name:`Log Out ${first.browser_name} on ${first.operating_system}`,exact:true}).first().click();assert(writes.length===0,'Revoked before confirmation');
 await page.getByRole('button',{name:'Confirm Log Out',exact:true}).click();await page.getByLabel('Confirm security action').waitFor({state:'detached'});
 await page.getByRole('button',{name:'Lock Account',exact:true}).click();await page.getByRole('button',{name:'Confirm Lock Account',exact:true}).click();await page.getByText('Account locked',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Unlock Account',exact:true}).click();await page.getByRole('button',{name:'Confirm Unlock Account',exact:true}).click();await page.getByText('0 active sessions',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Change Password',exact:true}).click();await page.getByLabel('Your Admin password',{exact:true}).waitFor();await page.getByRole('button',{name:'Cancel',exact:true}).click();
 assert(errors.length===0,errors.join('; '));return {passed:true,savedDirectoryData:true,productionWrites:0,fixtureActions:writes.map(w=>w.action),checks:['backend session count','clickable cell','device details','current device badge','confirmation before revoke','lock account','unlock without reviving sessions','secure password form']};
}
