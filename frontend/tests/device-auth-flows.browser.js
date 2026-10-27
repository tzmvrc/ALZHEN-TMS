// Real AuthProvider and pages. Auth and API transport are isolated; no live account changes.
async(page,workspace)=>{
 const assert=(v,m)=>{if(!v)throw Error(m);};const errors=[];let locked=false,revoked=false,logins=0,logouts=0,bootstraps=0;
 const id='00000000-0000-4000-8000-000000000042',email='isolated-driver@example.invalid',password='Isolated-UI-test-only-942!';
 const now=Math.floor(Date.now()/1000),jwt=`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,aud:'authenticated',role:'authenticated',iat:now,exp:now+3600,session_id:'00000000-0000-4000-8000-000000000043'})).toString('base64url')}.isolated-signature`;
 const profile={id,role:'TRUCKER',is_admin:false,first_name:'Isolated',last_name:'Driver',profile_picture_path:null},user={id,aud:'authenticated',role:'authenticated',email,user_metadata:{first_name:'Isolated'},app_metadata:{provider:'email'},created_at:new Date().toISOString()};
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/socket.io/**',r=>r.abort());
 await page.route('**/auth/v1/**',r=>new URL(r.request().url()).pathname.endsWith('/logout')?r.fulfill({status:204}):r.fulfill({contentType:'application/json',body:JSON.stringify(user)}));
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data;
  const deny=(code,status)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({success:false,code,message:code==='ACCOUNT_LOCKED'?'Your account has been locked by an administrator. Please contact your administrator for assistance.':'This device session has been logged out. Please sign in again.'})});
  if(path==='/api/auth/login'){
   if(locked)return deny('ACCOUNT_LOCKED',403);logins++;revoked=false;
   const body=req.postDataJSON();assert(body.email===email&&body.password===password,'Unexpected credentials');assert(typeof body.device_identifier==='string','Missing random device label');
   data={authUser:user,profile,session:{access_token:jwt,refresh_token:'isolated-refresh-token',token_type:'bearer',expires_in:3600},appSessionId:'A'.repeat(43),expiresAt:null};
  }else if(path==='/api/auth/session/bootstrap'||path==='/api/auth/session/heartbeat'){
   if(locked)return deny('ACCOUNT_LOCKED',403);if(revoked)return deny('SESSION_REVOKED',401);
   if(path.endsWith('/bootstrap')){bootstraps++;data={authUser:user,profile,role:'TRUCKER',expiresAt:null};}else data={active:true};
  }else if(path==='/api/auth/logout'){logouts++;revoked=true;data={};}
  else if(path==='/api/delivery/current')data=workspace;
  else if(path==='/api/tracking/capabilities')data={enabled:false};
  else if(path.startsWith('/api/notifications'))data={notifications:[],unreadCount:0};
  else if(path.startsWith('/api/users/'))return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'Isolated account details are intentionally unavailable.'})});
  else if(req.method()!=='GET')throw Error('Unexpected write '+path);
  else data=[];
  await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
 });
 const signIn=async()=>{await page.locator('#email').fill(email);await page.locator('#password').fill(password);await page.getByRole('checkbox',{name:'Remember Me'}).check();await page.getByRole('button',{name:'Login to Portal',exact:true}).click();await page.waitForURL('**/trucker');await page.getByRole('region',{name:'Trip information'}).waitFor();};
 for(const path of ['/login','/trucker/login']){
  await page.goto('http://localhost:5173'+path);await page.getByRole('checkbox',{name:'Remember Me'}).waitFor();
  assert(await page.locator('#email').getAttribute('autocomplete')==='username','Password manager username hint missing');assert(await page.locator('#password').getAttribute('autocomplete')==='current-password','Password manager password hint missing');
  for(const width of [320,360,375,390,430,768,1280]){await page.setViewportSize({width,height:700});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Login overflow '+path+' '+width);}
 }
 await signIn();
 const appSession=await page.evaluate(()=>localStorage.getItem('alzhen.app-session.v1'));assert(appSession==='A'.repeat(43),'Missing secure app identifier');
 await page.reload();await page.getByRole('region',{name:'Trip information'}).waitFor();assert(logins===1&&bootstraps>0,'Browser restore must bootstrap rather than log in again');
 for(const view of ['profile','settings']){
  await page.goto('http://localhost:5173/trucker/'+view);await page.getByRole('button',{name:'Logout',exact:true}).click();await page.waitForURL('**/trucker/login');assert(await page.locator('#email').inputValue()===email,'Remembered email lost');assert(await page.locator('#password').inputValue()==='','Password was restored from an insecure store');await signIn();
 }
 assert(logouts===2,'Profile and Settings must revoke the tracked backend session');
 revoked=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForURL('**/trucker/login');
 await page.goto('http://localhost:5173/trucker');await page.waitForURL('**/trucker/login');await signIn();
 locked=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForURL('**/account-locked');await page.getByRole('heading',{name:'Account Locked',exact:true}).waitFor();assert(await page.getByRole('region',{name:'Trip information'}).count()===0,'Dashboard visible behind lock screen');
 await page.getByRole('link',{name:'Back to sign in'}).click();await page.locator('#email').fill(email);await page.locator('#password').fill(password);await page.getByRole('button',{name:'Login to Portal',exact:true}).click();await page.waitForURL('**/account-locked');
 locked=false;await page.getByRole('link',{name:'Back to sign in'}).click();await signIn();
 const values=await page.evaluate(()=>Object.values(localStorage).join(' '));assert(!values.includes(password),'Plaintext password leaked to browser storage');
 await page.goto('http://localhost:5173/trucker/settings');await page.getByRole('button',{name:'Logout',exact:true}).click();await page.waitForURL('**/trucker/login');
 await page.locator('#email').fill(email);await page.locator('#password').fill(password);await page.getByRole('checkbox',{name:'Remember Me'}).uncheck();await page.getByRole('button',{name:'Login to Portal',exact:true}).click();await page.waitForURL('**/trucker');
 assert(await page.evaluate(()=>localStorage.getItem('alzhen.remembered-email'))===null,'Remember Me disabled retains email');
 assert(errors.length===0,errors.join('; '));return {passed:true,realAuthProvider:true,productionWrites:0,logins,logouts,bootstraps,checks:['restore valid session','remember email only','Profile logout','Settings logout','remote revocation redirects','protected route after logout','locked screen without dashboard','locked login denied','unlock requires fresh login']};
}
