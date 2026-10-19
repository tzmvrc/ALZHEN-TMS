// Actual grids and Socket.IO; synthetic roles and fixture-only appearance writes.
async(page)=>{
 let stage='mount';const contexts=[],pages=[],errors=[],counts={designWrites:0,businessWrites:0,reportReads:0};
 const trip='123e4567-e89b-42d3-a456-000000000010',stop='123e4567-e89b-42d3-a456-000000000012';
 const mount=async(p,actor)=>p.evaluate(async actor=>{
  await import('/src/index.css');const code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
  const react=await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1]),React=react.default??react,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]);
  const {startCollaboration}=await import(code.match(/from ["']([^"']*collaboration\.service\.ts[^"']*)["']/)[1]);startCollaboration(actor,`fixture-${actor}`,actor==='admin'?'ADMIN':'STAFF');
  const {default:View}=await import('/src/components/admin/ReportDataView.tsx');const root=document.createElement('div');root.id='design-fixture';Object.assign(root.style,{position:'fixed',inset:'0',zIndex:'100',overflow:'auto',background:'white'});document.body.append(root);const viewRoot=(DOM.createRoot??DOM.default.createRoot)(root);window.mountTripMode=(transactionView=false)=>viewRoot.render(React.createElement(MemoryRouter,null,React.createElement(View,{key:String(transactionView),initialReport:transactionView?'dispatch-monitoring':'combined',transactionView,showReportPicker:false,onOpenTrip:(tripId,stopId)=>{window.openedTrip={tripId,stopId};}})));window.mountTripMode();
 },actor);
 const make=async actor=>{
  const context=await page.context().browser().newContext({viewport:{width:1400,height:950}});contexts.push(context);const p=await context.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>localStorage.setItem('alzhen.app-session.v1','fixture-session'));
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`const auth={profile:{id:'fixture-${actor}',role:'${actor==='admin'?'ADMIN':'STAFF'}'},accessToken:'${actor}',refreshSession:async()=>{}};export const useAuth=()=>auth;export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/login';`}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:"export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};"}));
  await p.route('**/src/services/collaboration.service.ts*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace(/const endpoint = [^;]+;/,'const endpoint = "http://127.0.0.1:5199";')});});
  await p.route('**/api/**',async r=>{
   const req=r.request(),url=new URL(req.url()),parts=url.pathname.split('/').map(decodeURIComponent);let data=[];
   if(parts[2]==='table-layouts'){
    if(req.method()==='GET')data=await(await fetch(`http://127.0.0.1:5199/layout?table=${encodeURIComponent(parts[3])}`)).json();
    else{if(req.method()!=='PATCH')throw Error('Unexpected layout mutation');counts.designWrites++;const response=await fetch('http://127.0.0.1:5199/layout',{method:'POST',body:JSON.stringify({...req.postDataJSON(),patch:req.postDataJSON().patch??{},initial_width_px:req.postDataJSON().width_px??req.postDataJSON().initial_width_px,table:parts[3],column:parts[4]==='design'?parts[5]:parts[4]})});data=await response.json();if(!response.ok)return r.fulfill({status:response.status,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture design conflict'})});}
   }else if(req.method()!=='GET'){counts.businessWrites++;throw Error('No business writes authorized in this fixture');}
   else if((url.pathname.endsWith('/combined/columns')||url.pathname.endsWith('/dispatch-monitoring/columns')))data={columns:[{key:'dispatch_number',title:'Dispatch Number',type:'text'},{key:'remarks',title:'Remarks',type:'text'}]};
   else if((url.pathname.endsWith('/combined')||url.pathname.endsWith('/dispatch-monitoring'))){counts.reportReads++;data={rows:[{trip_id:trip,trip_stop_id:stop,dispatch_number:'DSP-FIXTURE',remarks:'Fixture remarks'},{trip_id:trip,trip_stop_id:'123e4567-e89b-42d3-a456-000000000013',dispatch_number:'DSP-SIBLING',remarks:'Sibling'}],pagination:{page:1,limit:50,total:1,totalPages:1}};}
   await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });await p.goto('http://localhost:5173/tests/table-fixture.html');await mount(p,actor);return p;
 };

 const cell=p=>p.locator('#design-fixture td[data-report-column-key=trip_details]').first();
 const menu=async p=>{await p.locator('#design-fixture').getByRole('button',{name:'Actions for TRIP DETAILS',exact:true}).click();return p.getByRole('menu',{name:'TRIP DETAILS column actions',exact:true});};
 const style=async(p,property,value)=>{stage=`style ${property}=${value}`;return p.waitForFunction(({property,value})=>{const cell=document.querySelector('#design-fixture td[data-report-column-key=trip_details]');return cell&&getComputedStyle(cell)[property]===value;},{property,value});};
 try{
  await fetch('http://127.0.0.1:5199/layout-reset',{method:'POST'});
  const admin=await make('admin'),staff=await make('staff');await cell(admin).waitFor();await cell(staff).waitFor();await admin.waitForTimeout(400);
  if(await admin.locator('#design-fixture tbody tr').first().locator('td').last().getAttribute('data-report-column-key')!=='trip_details')throw Error('Trip Details not last by default');
  const links=admin.locator('#design-fixture td[data-report-column-key=trip_details] a');if(await links.count()!==2)throw Error('Missing multi-stop links');
  if(await links.nth(0).getAttribute('href')!==`/trips/${trip}?stop=${stop}`||!(await links.nth(1).getAttribute('href')).endsWith('000000000013'))throw Error('Wrong physical route');
  await links.first().click();const opened=await admin.evaluate(()=>window.openedTrip);if(opened.tripId!==trip||opened.stopId!==stop||await cell(admin).locator('input').count())throw Error('Action navigated incorrectly or edited a cell');
  if(await admin.getByRole('button',{name:'Edit selected row',exact:true}).count())throw Error('Action click selected a row');
  const resize=admin.getByRole('separator',{name:'Resize TRIP DETAILS column',exact:true}),box=await resize.boundingBox();await admin.mouse.move(box.x+2,box.y+10);await admin.mouse.down();await admin.mouse.move(box.x+62,box.y+10);await admin.mouse.up();
  const width=await cell(admin).evaluate(node=>node.getBoundingClientRect().width);await staff.waitForFunction(width=>Math.abs(document.querySelector('#design-fixture td[data-report-column-key=trip_details]').getBoundingClientRect().width-width)<2,width);
  const actionMenu=await menu(admin);if(await actionMenu.getByRole('menuitem',{name:'Sort ascending',exact:true}).count())throw Error('Action column exposes data sorting');await actionMenu.getByRole('menuitem',{name:'Pin',exact:true}).click();await style(staff,'position','sticky');await style(staff,'right','0px');
  await (await menu(admin)).getByRole('menuitem',{name:'Unpin',exact:true}).click();await style(staff,'position','relative');
  await (await menu(admin)).getByRole('menuitem',{name:'Edit Column',exact:true}).click();await admin.getByLabel('Column display color',{exact:true}).fill('#fef3c7');await admin.getByRole('button',{name:'Done',exact:true}).click();await style(staff,'backgroundColor','rgb(254, 243, 199)');
  await cell(admin).click({position:{x:8,y:8}});await admin.getByRole('button',{name:'Bold selected cells',exact:true}).click();await style(staff,'fontWeight','700');if(await cell(admin).locator('input').count())throw Error('Action cell is editable');
  await (await menu(admin)).getByRole('menuitem',{name:'Hide Column',exact:true}).click();await cell(staff).waitFor({state:'hidden'});
  await admin.getByText('Hidden columns (1)',{exact:true}).click();await admin.getByRole('button',{name:'Restore TRIP DETAILS',exact:true}).click();await cell(staff).waitFor();
  await admin.getByRole('button',{name:'Drag to reorder TRIP DETAILS',exact:true}).dragTo(admin.getByRole('button',{name:'Drag to reorder Dispatch Number',exact:true}));
  stage='shared order';await staff.waitForFunction(()=>document.querySelector('#design-fixture tbody tr td:nth-child(2)')?.getAttribute('data-report-column-key')==='trip_details');
  await (await menu(admin)).getByRole('menuitem',{name:'Pin',exact:true}).click();await staff.waitForFunction(()=>{const cell=document.querySelector('#design-fixture td[data-report-column-key=trip_details]');const selection=document.querySelector('#design-fixture tbody tr td');return getComputedStyle(cell).position==='sticky'&&Math.abs(parseFloat(getComputedStyle(cell).left)-selection.getBoundingClientRect().width)<1;});
  await staff.reload();await mount(staff,'staff');await style(staff,'fontWeight','700');await style(staff,'backgroundColor','rgb(254, 243, 199)');await staff.waitForFunction(()=>{const cell=document.querySelector('#design-fixture td[data-report-column-key=trip_details]');const selection=document.querySelector('#design-fixture tbody tr td');return getComputedStyle(cell).position==='sticky'&&Math.abs(parseFloat(getComputedStyle(cell).left)-selection.getBoundingClientRect().width)<1;});
  const before=counts.reportReads,search=staff.getByRole('combobox',{name:'Search rows or columns',exact:true});await search.fill('TRIP DETAILS');await staff.getByRole('option',{name:'TRIP DETAILS',exact:true}).click();if(counts.reportReads!==before)throw Error('Column Finder refetched rows');
  await admin.evaluate(()=>window.mountTripMode(true));await cell(admin).waitFor();if(await admin.locator('#design-fixture tbody tr').first().locator('td').last().getAttribute('data-report-column-key')!=='trip_details')throw Error('Trips column not registered');
  if(errors.length||counts.businessWrites)throw Error(JSON.stringify({errors,counts}));
  return {contexts:2,combinedAndTrips:true,exactTripAndStop:true,multiStop:true,ordinaryColumn:true,sharedWidth:width,sharedColor:true,sharedFont:true,sharedVisibility:true,sharedOrder:true,leftAndRightPinning:true,refreshPersistence:true,columnFinder:true,contextMenuCoexists:true,noActionEditing:true,noActionRowSelection:true,productionWrites:0,...counts};
 }catch(error){throw Error(stage+': '+error.message+'; errors='+JSON.stringify(errors)+'; cells='+JSON.stringify(await Promise.all(pages.map(p=>p.locator('#design-fixture td[data-report-column-key=trip_details]').first().evaluate(n=>({style:n.getAttribute('style'),rect:n.getBoundingClientRect().toJSON()})).catch(()=>null)))));}finally{await Promise.all(contexts.map(c=>c.close()));}
}
