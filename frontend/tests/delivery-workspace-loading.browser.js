// All network writes are intercepted. The trip snapshot comes from actual saved records.
async(page,saved)=>{
 const assert=(v,m)=>{if(!v)throw Error(m);};
 const errors=[],writes=[];let fail=true,holdFix=false,releaseFix;
 const workspace=saved.current??Object.values(saved.workspaces)[0];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__gpsMode='denied';
  Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
   getCurrentPosition:(ok,fail)=>window.__gpsMode==='valid'?ok({timestamp:Date.now(),coords:{latitude:10,longitude:123,accuracy:4}}):fail({code:1}),
   watchPosition:(ok,fail)=>{window.__gpsWatch=ok;window.__gpsError=fail;return 1;},clearWatch:()=>{}
  }});
 });
 await page.route('**/src/context/AuthContext.tsx*',route=>route.fulfill({contentType:'text/javascript',body:"const profile={id:'isolated-review',role:'TRUCKER',first_name:'Review',last_name:'Driver'};export const useAuth=()=>({profile,user:{id:profile.id},accessToken:'isolated-read-only',loading:false,isAuthenticated:true,isAdmin:false,logout:async()=>{window.__logoutCalled=true;}});export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/trucker';export const getRoleBasedLoginPath=()=>'/trucker/login';"}));
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;let data=[];
  if(request.method()!=='GET'){
   assert(path.startsWith('/api/tracking/'),'Unexpected operational write '+path);writes.push(path);
   if(path.endsWith('/fixes')&&holdFix)await new Promise(resolve=>{releaseFix=resolve;});
   data=path.endsWith('/start')?{session_id:'00000000-0000-4000-8000-000000000001'}:{saved:true};
  }else if(path==='/api/delivery/current'){
   if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'Delivery data could not be confirmed. Your draft is preserved.',error:{code:'DELIVERY_UNAVAILABLE'}})});
   data=workspace;
  }else if(path.endsWith('/events'))data={rows:[],next:null};
  else if(path.endsWith('/profile'))data={id:'isolated-review',first_name:'Review',last_name:'Driver',email:'review@example.invalid',role:'TRUCKER',is_admin:false,account_status:'ACTIVE',created_at:new Date().toISOString(),profile_picture_url:null,driver:null};
  else if(path.endsWith('/overview'))data={kind:'trucker',metrics:[],daily:[],trips:[],delivery_activity:[],coverage:'Isolated visual review'};
  else if(path.endsWith('/activity-stats'))data={daily:[],breakdown:[],coverage:'Isolated visual review'};
  else if(path.endsWith('/activity'))data={rows:[],pagination:{page:1,total:0,totalPages:1}};
  else if(path.endsWith('/me/session'))data={role:'TRUCKER',expires_at:null,last_login_at:null};
  else if(path==='/api/tracking/capabilities')data={enabled:true};
  else if(path==='/api/tracking/assignments')data=[{id:workspace.assignment.id,trip_id:workspace.assignment.trip_id,plate_number:workspace.assignment.truck.plate_number}];
  else if(path.startsWith('/api/notifications'))data={notifications:[],unread_count:0};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
 });
 await page.goto('http://localhost:5173/trucker');
 const retry=page.getByRole('button',{name:'Retry',exact:true});await retry.waitFor();fail=false;await retry.click();
 await page.getByRole('region',{name:'Trip information'}).waitFor();
 assert(await page.getByLabel('Your assignment',{exact:true}).count()===0,'Manual assignment picker remains');
 assert(await page.locator('.delivery-action-cards button').count()===3,'Expected three action cards');
 assert(await page.locator('.delivery-bottom-nav').count()===0,'Bottom navigation remains');
 assert(await page.getByText('Saved progress',{exact:true}).count()===0,'Saved Progress card remains');
 assert(await page.getByAltText('ALZHEN company logo').count()===1,'Company logo missing');
 assert(await page.locator('.delivery-top-nav').evaluate(e=>getComputedStyle(e).display==='grid'),'Top navigation styles missing');
 assert(await page.locator('.delivery-summary-grid').evaluate(e=>getComputedStyle(e).display==='grid'),'Summary card styles missing');
 assert(await page.locator('.delivery-next-panel').evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(11, 35, 67)'||getComputedStyle(e).backgroundColor==='rgb(11, 35, 65)'),'Navy next-action panel missing');
 assert(await page.locator('.delivery-next-panel .delivery-primary').evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(255, 212, 59)'),'Yellow next-action button missing');
 assert(await page.locator('.delivery-action-cards .delivery-action-decoration').first().evaluate(e=>getComputedStyle(e).position==='absolute'),'Action-card decorative styles missing');
 for(const width of [320,390,768]){await page.setViewportSize({width,height:700});await page.getByRole('button',{name:'POD notifications',exact:true}).click();await page.getByRole('region',{name:'Your notifications'}).waitFor();assert(await page.getByRole('region',{name:'Your notifications'}).evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}),'Notifications outside viewport '+width);await page.keyboard.press('Escape');}
 await page.setViewportSize({width:390,height:900});
 await page.getByRole('button',{name:'Share My Location',exact:true}).click();
 await page.getByRole('button',{name:'Retry Location',exact:true}).waitFor();
 assert(await page.getByLabel('Location sharing unavailable').count()===1,'Permission denial must remain visible');
 await page.evaluate(()=>window.__gpsMode='valid');holdFix=true;
 await page.getByRole('button',{name:'Retry Location',exact:true}).click();
 await page.waitForTimeout(150);
 assert(await page.getByLabel('Location sharing unavailable').count()===1,'Retry must not dismiss warning before a confirmed fix');
 for(let i=0;i<100&&!releaseFix;i++)await page.waitForTimeout(25);assert(releaseFix,'Fixture GPS request not received');holdFix=false;releaseFix();
 await page.getByText('Location sharing active',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Stop sharing',exact:true}).click();
 await page.getByLabel('Location sharing unavailable').waitFor();
 for(const label of ['Add Status','Upload POD','Submit Report']){
  await page.getByRole('button',{name:label,exact:true}).click();await page.locator('dialog').waitFor();
  if(label==='Add Status')await page.getByRole('combobox',{name:/^Status/}).selectOption('Fuel stop');
  if(label==='Upload POD')assert(await page.getByLabel('DR No.',{exact:true}).count()===1,'POD workflow missing DR review');
  if(label==='Submit Report'){await page.getByRole('combobox',{name:/^Report type/}).selectOption('OFFLOAD_REPORTED');await page.getByRole('combobox',{name:/^Report type/}).selectOption('BACKLOAD_REPORTED');}
  for(const width of [320,360,375,390,430,768]){
   await page.setViewportSize({width,height:650});assert(await page.locator('dialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1&&e.getBoundingClientRect().right<=innerWidth),'Workflow overflow '+label+' '+width);
  }
  await page.setViewportSize({width:320,height:390});await page.waitForFunction(()=>{const r=document.querySelector('dialog').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1});
  await page.setViewportSize({width:390,height:900});await page.getByRole('button',{name:'Close',exact:true}).last().click();
 }
 for(const tab of ['History','Reports']){await page.getByRole('button',{name:tab,exact:true}).click();for(const width of [320,360,375,390,430,768]){await page.setViewportSize({width,height:700});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Tab overflow '+tab+' '+width);}}
 await page.getByRole('button',{name:'My Trip',exact:true}).click();
 for(const width of [320,360,375,390,430,768,955]){await page.setViewportSize({width,height:900});await page.mouse.move(0,0);await page.waitForTimeout(200);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow at '+width);await page.screenshot({path:'.playwright-mcp/trucker-redesign-'+width+'.png',fullPage:true});}
 for(const view of ['profile','settings']){
  await page.goto('http://localhost:5173/trucker/'+view);await page.getByRole('button',{name:'Logout',exact:true}).waitFor();
  if(view==='profile')await page.getByRole('heading',{name:'Review Driver',exact:true}).waitFor();else await page.getByRole('heading',{name:'My Account',exact:true}).waitFor();
  for(const width of [320,360,375,390,430,768]){await page.setViewportSize({width,height:700});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Account overflow '+view+' '+width);}
  if(view==='settings')for(const name of ['Security','Profile','Appearance','Preferences']){await page.getByRole('button',{name,exact:true}).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Settings category overflow '+name);}
 }
 assert(errors.length===0,errors.join('; '));
 return {passed:true,realSavedTrip:true,isolatedAuthentication:true,productionWrites:0,fixtureTrackingRequests:writes.length,checks:['automatic assignment','retry','three workflows at all widths','short viewport dialogs','permission denial','warning retained until saved GPS','stop warning','top navigation','History and Reports layouts','320/360/375/390/430/768/955 layouts']};
}

