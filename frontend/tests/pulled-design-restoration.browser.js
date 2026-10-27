// Actual application shell and pages, with isolated read responses and no live writes.
async(page,saved)=>{
 const assert=(value,message)=>{if(!value)throw Error(message);},errors=[];
 const reviewer=saved.directory.staff.rows.find(row=>row.role==='ADMIN')??saved.directory.staff.rows[0];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/socket.io/**',r=>r.abort());
 await page.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`const profile=${JSON.stringify({...reviewer,role:'ADMIN'})};const auth={profile,user:{id:profile.id,email:profile.email,user_metadata:{}},accessToken:'isolated-review',loading:false,isAuthenticated:true,isAdmin:true,refreshSession:async()=>{},logout:async()=>{}};export const useAuth=()=>auth;export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/';export const getRoleBasedLoginPath=()=>'/login';`}));
 for(const name of ['LiveTripMap','OverviewMiniCalendar','RoadRoutingPanel'])await page.route(`**/src/components/admin/${name}.tsx*`,r=>r.fulfill({contentType:'text/javascript',body:"export default function Review(){return null}"}));
 const emptyPage={rows:[],pagination:{page:1,limit:50,total:0,totalPages:1}};
 await page.route('**/api/**',async r=>{
  const req=r.request(),url=new URL(req.url()),path=url.pathname;let data=[];
  assert(req.method()==='GET'||req.method()==='POST'&&['/api/trips/overview-details','/api/formulas/read'].includes(path),'Unexpected write '+path);
  if(path==='/api/trips')data=emptyPage;
  else if(path==='/api/trips/overview-details')data={events:[],images:[]};
  else if(path==='/api/notifications')data={notifications:[],unreadCount:0};
  else if(path==='/api/users/directory')data=saved.directory[url.searchParams.get('category')??'staff'];
  else if(path==='/api/users/device-sessions/summary')data=saved.summary;
  else if(path.endsWith('/device-sessions'))data={sessions:saved.sessions.filter(s=>path.includes(s.profile_id)),locked_at:null};
  else if(path.endsWith('/profile'))data={...reviewer,account_status:'ACTIVE',profile_picture_url:null,driver:null};
  else if(path.endsWith('/overview'))data={kind:'office',metrics:[],daily:[],trips:[],coverage:'Isolated review'};
  else if(path.endsWith('/activity-stats'))data={daily:[],breakdown:[],coverage:'Isolated review'};
  else if(path.endsWith('/activity'))data=emptyPage;
  else if(path.endsWith('/me/session'))data={role:'ADMIN',expires_at:null,last_login_at:null};
  else if(path.startsWith('/api/reports/'))data=emptyPage;
  else if(path==='/api/formulas/read')data={formulas:[],sources:[]};
  await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
 });
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1440,height:1000});await page.goto('http://localhost:5173/');
 await page.locator('.home-command-center').waitFor();
 assert(await page.locator('.home-metric-navy').evaluate(e=>['rgb(11, 35, 65)','rgb(11, 35, 67)'].includes(getComputedStyle(e).backgroundColor)),'Home navy card lost');
 await page.mouse.move(0,0);await page.screenshot({path:'.playwright-mcp/restored-admin-home-desktop.png',fullPage:false,timeout:15000});
 await page.getByRole('button',{name:'User menu',exact:true}).filter({visible:true}).click();
 const menu=page.getByRole('menu').filter({has:page.getByRole('menuitem',{name:'My Profile',exact:true})});await menu.waitFor();
 assert(await menu.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&r.top>=0;}),'Profile menu clipped');
 assert(await menu.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.left+r.width/2,r.top+20));}),'Profile menu hidden behind another layer');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Users',exact:true}).filter({visible:true}).click();
 await page.getByRole('button',{name:/View active sessions for/}).first().waitFor();
 assert(await page.getByRole('searchbox',{name:'Search users',exact:true}).count()===1,'Duplicate/missing Users search');
 assert(await page.getByRole('button',{name:/^Add user$/i}).count()===1,'Duplicate/missing Add user');
 await page.getByRole('button',{name:/View active sessions for/}).first().click();await page.getByRole('dialog',{name:'Active Sessions',exact:true}).waitFor();
 await page.screenshot({path:'.playwright-mcp/restored-admin-sessions.png',fullPage:false,timeout:15000});await page.getByRole('button',{name:'Close dialog',exact:true}).click();
 await page.getByRole('button',{name:/^Add user$/i}).click();const addDialog=page.getByRole('dialog',{name:'Add user',exact:true});await addDialog.waitFor();assert(await addDialog.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.left+r.width/2,r.top+20));}),'Account form hidden behind header');await addDialog.getByRole('button',{name:'Close',exact:true}).click();
 for(const width of [320,390,768]){
  await page.setViewportSize({width,height:800});await page.getByRole('button',{name:'Navigation',exact:true}).click();
  const nav=page.getByRole('navigation',{name:'Primary',exact:true}).filter({visible:true});
  assert(await nav.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}),'Mobile navigation outside viewport '+width);
  await page.keyboard.press('Escape');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Admin page overflow '+width);
 }
 await page.setViewportSize({width:320,height:390});await page.getByRole('button',{name:'Notifications',exact:true}).click();const notices=page.getByRole('dialog',{name:'Notifications',exact:true});await notices.waitFor();assert(await notices.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}),'Notifications clipped on short mobile screen');await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:800});await page.getByRole('button',{name:'Navigation',exact:true}).click();await page.getByRole('navigation',{name:'Primary',exact:true}).filter({visible:true}).getByRole('button',{name:'Home',exact:true}).click();
 await page.locator('.home-command-center').waitFor();await page.screenshot({path:'.playwright-mcp/restored-admin-home-mobile.png',fullPage:false,timeout:15000});
 assert(errors.length===0,errors.join('; '));return {passed:true,productionWrites:0,checks:['actual application shell','navy home metric','profile menu bounds','single topbar search/add','active sessions modal','mobile navigation and page bounds','mobile Home'],errors};
}
