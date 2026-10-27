// Shared production toolbar/ColumnFinder/Settings. All backend transport is isolated.
async(page)=>{
 const assert=(v,m)=>{if(!v)throw Error(m);},errors=[],measurements=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"const auth={profile:{id:'fixture-admin',role:'ADMIN'},accessToken:'fixture',refreshSession:async()=>{},logout:async()=>{}};export const useAuth=()=>auth;"}));
 await page.route('**/src/components/ui/Toast.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"const toast={addToast:()=>{}};export const useToast=()=>toast;"}));
 await page.route('**/src/services/collaboration.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:"const people=[{userId:'a',name:'Viewer One',color:'#2678b9'},{userId:'b',name:'Viewer Two',color:'#16846c'}];const snapshot={connected:true,viewers:{trips:people,'users:staff':people,'master:warehouses':people}};export const collaborationSnapshot=()=>snapshot;export const subscribeCollaboration=()=>()=>{};export const subscribeCollaborationEvents=()=>()=>{};export const joinCollaborationRoom=()=>()=>{};"}));
 await page.route('**/api/**',async r=>{assert(r.request().method()==='GET','Unexpected database write');const path=new URL(r.request().url()).pathname;let data=[];
  if(path.endsWith('/profile'))data={id:'fixture-admin',role:'ADMIN',first_name:'Fixture',last_name:'Admin',email:'fixture@example.org',contact_number:'',profile_picture_url:null};
  else if(path.endsWith('/session'))data={role:'ADMIN',expires_at:null,last_login_at:null};
  else if(path.endsWith('/operational-emails'))data={settings:{enabled:true,version:1,testing_recipient_email:null},configuration:{configured:true,enabled:true,sender:'ALZHEN TMS <onboarding@resend.dev>',testing_domain:true},recipients:[],history:Array.from({length:20},(_,i)=>({id:String(i),report_type:'TEST',recipient_email:'delivered@resend.dev',state:'SENT',provider_status:'delivered',attempts:1,created_at:'2026-10-27T01:00:00Z',sent_at:'2026-10-27T01:00:00Z'}))};
  await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
 });
 await page.goto('http://localhost:5173/tests/table-fixture.html');
 await page.evaluate(async()=>{
  const main=await(await fetch('/src/main.tsx')).text(),code=await(await fetch('/src/components/admin/SidebarNav.tsx')).text(),React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),routerCode=await(await fetch('/src/pages/Account/SettingsPage.tsx')).text(),router=await import(routerCode.match(/from ["']([^"']*react-router-dom[^"']*)["']/)[1]);
  await import('/src/index.css');await import('/src/workspace.css');const {default:Sidebar}=await import('/src/components/admin/SidebarNav.tsx'),{default:Finder}=await import('/src/components/admin/ColumnFinder.tsx'),{default:Settings}=await import('/src/pages/Account/SettingsPage.tsx');
  // Import the same Vite-resolved registries as the toolbar, including HMR versions.
  const registry=async name=>import(code.match(new RegExp('from ["\\\']([^"\\\']*'+name+'[^"\\\']*)["\\\']'))[1]);
  const {useRegisterTopbarSearch,TopbarSearchRegistration}=await registry('topbarSearch'),{useRegisterTopbarAction}=await registry('topbarActions'),{useRegisterTopbarView}=await registry('topbarView'),{setPageSection}=await registry('pageSection');
  setPageSection('trips','Master List');setPageSection('truckers','Admin & Staff');setPageSection('billing','Invoices');setPageSection('database','Warehouses');
  function Fixture(){const [active,setActive]=React.useState('trips'),[queries,setQueries]=React.useState({}),viewport=React.useRef(null);window.switchToolbar=setActive;
   const scope=({trips:'trips:Master List',truckers:'users:Admin & Staff',billing:'billing:Invoices',database:'database:Warehouses',overview:'overview',settings:'settings'})[active];
   useRegisterTopbarSearch(scope,active!=='trips'&&active!=='settings'?{kind:'field',value:queries[active]??'',placeholder:'Search '+active,label:'Search '+active,onChange:value=>setQueries(q=>({...q,[active]:value}))}:null);
   useRegisterTopbarView(scope,active==='trips'?{value:'table',onChange:()=>{}}:null);
   useRegisterTopbarAction(scope,'export',active==='trips'?{label:'Export',onClick:()=>{}}:null);
   useRegisterTopbarAction(scope,'add',['trips','truckers','billing','database'].includes(active)?{label:'Add record',onClick:()=>{}}:null);
   return React.createElement('div',{className:'al-workspace'},React.createElement('div',{className:'al-workspace-grid relative z-10 w-full'},React.createElement(Sidebar,{activeId:active,entries:[{id:'overview',label:'Home'},{id:'trips',label:'Trips'},{id:'truckers',label:'Users'},{id:'billing',label:'Billing'},{id:'database',label:'Database'},{id:'settings',label:'Settings'}],onNavigate:setActive,canAccessNotifications:true,userName:'Fixture Admin',userRole:'ADMIN'}),React.createElement('main',{className:'al-workspace-main'},active==='settings'?React.createElement(React.Fragment,null,React.createElement(Settings),React.createElement('div',{style:{height:'1000px'}})):React.createElement('section',null,active==='trips'&&React.createElement(TopbarSearchRegistration,{scope},React.createElement(Finder,{columns:[],viewport,getHeader:()=>null,onReveal:()=>{},rowSearch:{value:queries[active]??'',onSearch:value=>setQueries(q=>({...q,[active]:value}))}})),React.createElement('div',{ref:viewport},React.createElement('output',{'aria-label':'Filtered records'},['Matching record','Other record'].filter(s=>s.toLowerCase().includes((queries[active]??'').toLowerCase())).join(', ')))))));
  }
  (DOM.createRoot??DOM.default.createRoot)(document.body.appendChild(document.createElement('div'))).render(React.createElement(router.BrowserRouter,null,React.createElement(Fixture)));
 });
 const header=page.getByRole('banner',{name:'Application header'});
 const change=async active=>{await page.evaluate(active=>window.switchToolbar(active),active);await page.waitForTimeout(100);};
 const search=()=>header.locator('input');
 for(const width of [1920,1440,1024,768,430,390,360,320]){
  await page.setViewportSize({width,height:900});let reference=null;
  for(const active of ['trips','truckers','billing','database']){
   await change(active);await search().waitFor();const box=await search().evaluate(e=>{const shell=e.closest('.al-quick-search')??e;const r=shell.getBoundingClientRect(),s=getComputedStyle(shell);return {width:r.width,height:r.height,radius:s.borderRadius,left:r.left,right:r.right};});
   {reference??=box;assert(Math.abs(box.width-reference.width)<2,active+' width differs from Trips at '+width);assert(box.width<=341,'Search expanded beyond reference width');}assert(box.height===40&&box.radius==='999px','Search height/radius changed '+active);measurements.push({viewport:width,active,...box});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal page overflow '+active+' '+width);
   const bell=header.getByRole('button',{name:'Notifications',exact:true});assert(await bell.evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),'Notification clipped');
   const avatars=header.locator('.al-toolbar-viewers');if(await avatars.count())assert(await avatars.evaluate((e,x)=>e.getBoundingClientRect().right<=x+1,box.left),'Search overlaps avatars');
   assert(box.width>=100,'Search unusably narrow '+active+' '+width);
  }
 }
 await page.setViewportSize({width:1440,height:900});
 for(const active of ['trips','truckers','billing','database']){await change(active);await search().fill('Matching');if(active==='trips')await search().press('Enter');await page.getByLabel('Filtered records').getByText('Matching record',{exact:true}).waitFor();await header.getByRole('button',{name:'Clear search',exact:true}).click();await page.getByLabel('Filtered records').getByText('Matching record, Other record',{exact:true}).waitFor();}
 await change('overview');assert(await header.locator('input').count()===0,'Home still has a search bar');
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:900});await change('settings');await page.getByRole('button',{name:'My Account',exact:true}).click();await page.getByRole('textbox',{name:'First name',exact:true}).waitFor();await page.evaluate(()=>scrollTo(0,0));await page.evaluate(()=>document.fonts.ready);await page.mouse.move(2,880);await page.waitForTimeout(220);const before=await header.screenshot({path:`.playwright-mcp/nav-before-${width}.png`});await page.evaluate(()=>scrollTo(0,260));await page.waitForTimeout(100);assert((await header.boundingBox()).y===0,'Header not sticky');const after=await header.screenshot({path:`.playwright-mcp/nav-after-${width}.png`});assert(before.equals(after),'Settings profile bleeds through header '+width);
  await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:'Operational Report Emails',exact:true}).click();await page.getByRole('region',{name:'Email delivery history'}).waitFor();await page.mouse.move(2,880);await page.waitForTimeout(220);const emailBefore=await header.screenshot();await page.evaluate(()=>scrollTo(0,500));await page.waitForTimeout(100);assert(emailBefore.equals(await header.screenshot()),'Email settings bleed through header '+width);
  await header.getByRole('button',{name:'Notifications',exact:true}).click();const popup=page.getByRole('dialog',{name:'Notifications',exact:true});await popup.waitFor();assert(await popup.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.left+20,r.top+20));}),'Notification popup covered');await page.keyboard.press('Escape');
  if(width<1024){await header.getByRole('button',{name:'User menu',exact:true}).click();await page.getByRole('menuitem',{name:'My Profile',exact:true}).waitFor();await page.keyboard.press('Escape');}
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Settings overflow '+width);const bounds=await page.locator('.account-panel').evaluateAll(nodes=>nodes.map(e=>({width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,classes:e.className})));assert(bounds.every(r=>r.right<=width+1),'Clipped Settings panel '+width+' '+JSON.stringify(bounds));
  await page.screenshot({path:`.playwright-mcp/settings-nav-${width}.png`});await page.evaluate(()=>scrollTo(0,0));
 }
 await page.setViewportSize({width:1440,height:900});await change('database');await page.screenshot({path:'.playwright-mcp/admin-search-standardized.png'});
 assert(errors.length===0,errors.join('; '));return {passed:true,productionWrites:0,checks:['shared search sizes','search/clear callbacks','Home search removed','avatars and bell alignment','pixel-identical navbar across Settings scroll','profile/email panels','notifications/profile popovers','responsive 320-1920px'],measurements};
}
