// Current convoy panel and Tracker projection; synthetic REST only, no live writes.
async(page)=>{
 const context=await page.context().browser().newContext({viewport:{width:1440,height:1000}}),p=await context.newPage(),errors=[],writes=[];
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const trip=id(10),stop=id(20),assignment=id(40),item=id(30);let widthWrites=0;
 const assignments=[40,41].map((n,i)=>({id:id(n),trip_id:trip,truck_id:id(5+i),driver_id:id(7+i),stop_scope:'ALL',collaboration_version:1,unassigned_at:null,truck:{plate_number:'FIX-'+(i?'B':'A'),capacity_cbm:i?35:50},driver:{first_name:'Driver',last_name:i?'B':'A'},trucking_company:{name:'Fixture company'}}));
 const stops=[20,21].map((n,i)=>({id:id(n),trip_id:trip,stop_sequence:i+1,dr_number:'DR-'+n}));
 const data={assignments,stops,cargo:[{id:item,trip_id:trip,trip_stop_id:stop,quantity:10,cbm:80,customer_model:'Physical cargo',dr_number:'DR-20'}],allocations:[{id:id(60),trip_id:trip,assignment_id:assignment,trip_line_item_id:item,quantity:6,allocated_cbm:50,collaboration_version:1}],responsibilities:[],totals:{total_cbm:80,assigned_cbm:50,remaining_cbm:30}};
 p.on('pageerror',error=>errors.push(error.message));
 try{
  await p.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"const a={profile:{id:'fixture-admin',role:'ADMIN'},user:{user_metadata:{}},accessToken:'fixture-token'};export const useAuth=()=>a;"}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:"export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};"}));
  await p.route('**/api/**',async r=>{
   const req=r.request(),url=new URL(req.url());let result=[];
   if(url.pathname.endsWith('/convoy'))result=data;
   else if(url.pathname.endsWith('/convoy/allocations')){
    const body=req.postDataJSON();writes.push({path:url.pathname,body});
    if(body.changes[0].assignment_id!==assignment||body.changes[0].trip_line_item_id!==item)throw Error('Wrong physical allocation target');
    Object.assign(data.allocations[0],body.changes[0],{collaboration_version:2});data.totals.assigned_cbm=45;data.totals.remaining_cbm=35;result=data.allocations;
   }else if(url.pathname.endsWith('/transmittal-tracker/page')){
    const rows=stops.flatMap(s=>assignments.map(a=>({trip_id:trip,trip_stop_id:s.id,assignment_id:a.id,assigned_plate_number:a.truck.plate_number,driver_name:a.driver.first_name+' '+a.driver.last_name,warehouse_code:'WH',delivered_to:'Store '+s.stop_sequence,plate_number:'REPORTED-STOP-PLATE',delivery_receipt_no:s.dr_number,sales_order_no:'',transmittal_ref:'REF',date_created:'',status:'Completed',lbc_waybill_no:'',shipping_date_via_lbc:'',remarks:'',loading_date:'',date_delivered:'',cells:{},legacy_conflicts:[]})));
    result={table_id:id(90),access:{canView:true,canEdit:true,canManage:true,isAdmin:true},columns:[],rows,pagination:{page:1,limit:50,total:4,totalPages:1}};
   }else if(url.pathname.includes('/table-layouts/')&&req.method()==='PATCH'){
    const body=req.postDataJSON();widthWrites++;result={table_key:'transmittal-tracker',column_key:'assigned_plate_number',width_px:body.width_px,revision:1,design:{}};
   }else if(url.pathname.endsWith('/formulas/read'))result={formulas:[],sources:[]};
   else if(req.method()!=='GET')throw Error('Unexpected fixture mutation '+url.pathname);
   await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:result})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async trip=>{
   const main=await(await fetch('/src/main.tsx')).text(),React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   await import('/src/index.css');const {default:Panel}=await import('/src/components/admin/TripConvoyPanel.tsx');
   window.fixtureReact=React;window.fixtureRoot=(DOM.createRoot??DOM.default.createRoot)(document.body.appendChild(document.createElement('div')));window.fixtureRoot.render(React.createElement(Panel,{token:'fixture-token',tripId:trip,onClose:()=>{}}));
  },trip);
  await p.getByLabel('Truck assignment',{exact:true}).waitFor();
  if(await p.getByLabel('Truck assignment',{exact:true}).locator('option').count()!==3)throw Error('Assignments missing');
  await p.getByLabel('Allocated CBM '+item,{exact:true}).fill('45');await p.waitForTimeout(250);
  if(writes.length)throw Error('Cargo was persisted before confirmation');
  await p.getByRole('button',{name:'Confirm cargo allocations',exact:true}).click();
  await p.getByText('Remaining: 35 CBM',{exact:false}).waitFor();if(writes.length!==1)throw Error('Duplicate allocation save');
  await p.getByRole('button',{name:'Close',exact:true}).waitFor();
  await p.evaluate(async()=>{const {default:Tracker}=await import('/src/components/admin/TransmittalTrackerView.tsx');window.fixtureRoot.render(window.fixtureReact.createElement(Tracker));});
  await p.locator('td[data-tracker-field="driver_name"]').first().waitFor();
  if(await p.locator('tr.report-data-row:not([data-spreadsheet-blank])').count()!==4)throw Error('Tracker did not render four normal assignment/stop rows');
  if(await p.locator('td[data-tracker-field="assigned_plate_number"]').filter({hasText:'FIX-A'}).count()!==2)throw Error('Truck projections are incorrect');
  if(await p.locator('td[data-tracker-field="plate_number_override"]').filter({hasText:'REPORTED-STOP-PLATE'}).count()!==4)throw Error('Stop reported plate was overwritten');
  if(await p.getByLabel('Tracker pagination').count())throw Error('Unnecessary single-page footer remains');
  await p.locator('td[data-tracker-field="driver_name"]').first().click();
  if(await p.getByRole('textbox',{name:/Edit Assigned Driver/}).count())throw Error('Assignment identity became a stop override editor');
  const sizes=await p.locator('th [data-spreadsheet-header-title]').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).fontSize));
  if(sizes.some(size=>size!=='12px'))throw Error('Header font was shrunk '+JSON.stringify(sizes));
  const grip=await p.getByRole('separator',{name:'Resize Assigned Plate column',exact:true}).boundingBox();
  await p.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await p.mouse.down();await p.mouse.move(grip.x-130,grip.y+grip.height/2,{steps:5});await p.mouse.up();
  await p.waitForTimeout(250);
  const heading=await p.locator('th[data-spreadsheet-column="assigned_plate_number"]').evaluate(head=>{const title=head.querySelector('[data-spreadsheet-header-title]');return {width:head.getBoundingClientRect().width,height:head.getBoundingClientRect().height,font:getComputedStyle(title).fontSize,whiteSpace:getComputedStyle(title).whiteSpace};});
  if(heading.font!=='12px'||heading.width>80||heading.height<=32||heading.whiteSpace!=='normal'||widthWrites!==1)throw Error('Narrow header did not wrap with fixed font '+JSON.stringify({heading,widthWrites}));
  await p.screenshot({path:'C:/Users/WarL0cK/Documents/Coding projects/ALZHEN TMS/frontend/tests/artifacts/convoy-tracker-projection.png',fullPage:true});
  await p.evaluate(async()=>{const {SpreadsheetColumnConfiguration:Config}=await import('/src/components/admin/SpreadsheetColumnConfiguration.tsx');window.Config=Config;window.fixtureRoot.render(window.fixtureReact.createElement(Config,{title:'Issue / Report Type',columnKey:'issue_report_type',onSave:value=>{window.savedInput=value;},onClose:()=>{}}));});
  await p.getByLabel('Input type',{exact:true}).selectOption('DROPDOWN');await p.getByRole('button',{name:'Add option',exact:true}).click();
  await p.getByRole('textbox',{name:'Option label',exact:true}).fill('Custom issue');await p.getByRole('button',{name:'Done',exact:true}).click();
  const saved=await p.evaluate(()=>window.savedInput);if(saved?.type!=='DROPDOWN'||saved.options?.[0]?.label!=='Custom issue'||!saved.options[0].value)throw Error('Custom input configuration failed');
  await p.evaluate(()=>window.fixtureRoot.render(window.fixtureReact.createElement(window.Config,{title:'Driver',columnKey:'driver_name',onSave:()=>{throw Error('Relationship configuration changed');},onClose:()=>{}})));
  if(!await p.getByLabel('Input type',{exact:true}).isDisabled())throw Error('Relationship source type became configurable');
  if(errors.length)throw Error(errors.join('; '));
  return {isolated:true,productionWrites:0,explicitCargoConfirmation:true,oneAllocationRequest:true,physicalTarget:assignment,trackerRows:4,separateAssignedAndReportedPlate:true,driverReadOnlyInStopProjection:true,emptyFooterRemoved:true,fixedHeaderFont:true,narrowHeader:heading,widthWrites,customInputConfiguration:true,relationshipTypeProtected:true,errors};
 }finally{await context.close();}
}
