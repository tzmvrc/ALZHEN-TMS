// Actual Users UI; all account/trucker data and Realtime events are isolated.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),calls=[],errors=[];let version=1;
 const summary=()=>({id:'driver-a',profile_id:'trucker-a',first_name:'Fixture',last_name:'Trucker',full_name:`Fixture Trucker ${version}`,contact_number:`contact-${version}`,email:'trucker@example.invalid',status:version===1?'ACTIVE':'INACTIVE',profile_picture_path:null,assigned_truck_id:'truck-a',plate_number:'FIX-1',active_trip_id:'trip-a',active_trip_number:'DSP-A',current_trip_status:'IN_PROGRESS',delivery_status:'Pending',loading_date:'2026-10-19'});
 p.on('pageerror',error=>errors.push(error.message));
 try{
  await p.route('**/src/context/AuthContext.tsx*',route=>route.fulfill({contentType:'text/javascript',body:"const auth={profile:{id:'fixture-admin',role:'ADMIN'},accessToken:'fixture-token'};export const useAuth=()=>auth;"}));
  await p.route('**/src/lib/supabase.ts*',route=>route.fulfill({contentType:'text/javascript',body:'export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};'}));
  await p.route('**/src/services/realtime.service.ts*',route=>route.fulfill({contentType:'text/javascript',body:'const listeners=new Set();export const subscribeToAdminRealtime=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};window.userSignal=()=>listeners.forEach(fn=>fn({kind:"batch",tables:["profiles","drivers"]}));'}));
  await p.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url());if(req.method()!=='GET')throw Error('Unexpected mutation');calls.push(url.pathname+url.search);let data=[];
   if(version===2&&['/api/users','/api/truckers'].includes(url.pathname))await new Promise(resolve=>setTimeout(resolve,200));
   if(url.pathname==='/api/users')data=[{id:'admin-a',role:'ADMIN',first_name:'Fixture',last_name:'Admin',is_admin:true,email:'admin@example.invalid',driver:null},{id:'staff-a',role:'STAFF',first_name:'Fixture',last_name:'Staff',is_admin:false,email:'staff@example.invalid',driver:null},{id:'trucker-a',role:'TRUCKER',first_name:'Fixture',last_name:'Trucker',is_admin:false,email:'trucker@example.invalid',driver:{id:'driver-a'}}];
   if(url.pathname==='/api/truckers')data={rows:version===3?[]:[summary()],pagination:{page:1,limit:100,total:version===3?0:1,totalPages:1}};
   if(url.pathname==='/api/truckers/driver-a'){await new Promise(resolve=>setTimeout(resolve,300));const row=summary();data={...row,driver_id:row.id,truck:{id:'truck-a',plate_number:'FIX-1',truck_number:null,make:'Enriched Make',model:'Fixture Model',status:'ACTIVE'},active_trip:{id:'trip-a',trip_number:'DSP-A',dispatch_number:'DSP-A',status:'IN_PROGRESS',loading_date:'2026-10-19',estimated_delivery_date:null,route:'Enriched route',delivery_status:'Pending'},trip_history:[]};}
   await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{
   await import('/src/index.css');const path='/src/pages/Admin/views/TruckersView.tsx',code=await(await fetch(path)).text(),main=await(await fetch('/src/main.tsx')).text(),React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{default:View}=await import(path);
   window.usersApi=await import(code.match(/from ["']([^"']*\/api\.service\.ts[^"']*)["']/)[1]);const el=document.createElement('div');el.id='users-directory-fixture';document.body.append(el);const root=(DOM.createRoot??DOM.default.createRoot)(el);let key=0;window.remountUsers=()=>root.render(React.createElement(View,{key:++key}));window.remountUsers();
  });
  const root=p.locator('#users-directory-fixture');await root.getByText('Fixture Admin',{exact:true}).waitFor();await root.getByText('Fixture Staff',{exact:true}).waitFor();
  const directoryCalls=()=>calls.filter(path=>path==='/api/users'||path.startsWith('/api/truckers?'));
  if(directoryCalls().length!==2)throw Error('Duplicate initial directory requests: '+JSON.stringify(calls));
  const started=Date.now();for(let n=0;n<3;n++){await root.getByRole('button',{name:'Truckers',exact:true}).click();await root.getByText('Fixture Trucker 1',{exact:true}).waitFor();await root.getByRole('button',{name:'Admin & Staff',exact:true}).click();await root.getByText('Fixture Staff',{exact:true}).waitFor();}
  const sixSwitchesMs=Date.now()-started;if(directoryCalls().length!==2)throw Error('Category changes refetched directory');
  await root.getByRole('button',{name:'Truckers',exact:true}).click();await root.getByText('Fixture Trucker 1',{exact:true}).click();
  let modal=root.getByRole('dialog',{name:'Trucker details for Fixture Trucker 1',exact:true});await modal.getByText('contact-1',{exact:true}).waitFor();
  if(await root.getByRole('dialog',{name:'Loading trucker details',exact:true}).count())throw Error('Modal discarded summary');
  await modal.getByText('Enriched Make Fixture Model',{exact:true}).waitFor();await modal.getByRole('button',{name:'Close trucker details'}).click();
  const before=calls.length;await root.getByText('Fixture Trucker 1',{exact:true}).click();await root.getByRole('dialog').getByText('Enriched Make Fixture Model',{exact:true}).waitFor();if(calls.length!==before)throw Error('Reopening details refetched unchanged data');
  version=2;await p.evaluate(()=>{window.usersApi.invalidateApiCache('/users');window.usersApi.invalidateApiCache('/truckers');window.userSignal();});
  await root.locator('tbody').getByText('Fixture Trucker 1',{exact:true}).waitFor();if(await root.locator('tbody .animate-pulse').count())throw Error('Background refresh replaced visible table with skeletons');
  modal=root.getByRole('dialog',{name:'Trucker details for Fixture Trucker 2',exact:true});await modal.getByText('contact-2',{exact:true}).waitFor();await modal.getByRole('button',{name:'Close trucker details'}).click();
  const beforeRemount=directoryCalls().length;await p.evaluate(()=>window.remountUsers());await root.getByText('Fixture Trucker 2',{exact:true}).waitFor();if(directoryCalls().length!==beforeRemount)throw Error('Revisit refetched directory');
  await root.getByText('Fixture Trucker 2',{exact:true}).click();await root.getByRole('dialog').waitFor();version=3;await p.evaluate(()=>{window.usersApi.invalidateApiCache('/users');window.usersApi.invalidateApiCache('/truckers');window.userSignal();});await root.getByText('No truckers found.',{exact:true}).waitFor();await root.getByRole('dialog').waitFor({state:'hidden'});
  const beforeClear=directoryCalls().length;await p.evaluate(()=>{window.usersApi.clearApiCache();window.remountUsers();});await root.getByText('Fixture Admin',{exact:true}).waitFor();if(directoryCalls().length!==beforeClear+2)throw Error('Logout cache reset was not respected');
  if(errors.length)throw Error(errors.join('; '));return {initialDirectoryRequests:2,categorySwitchAdditionalRequests:0,sixSwitchesMs,summaryImmediatelyVisible:true,modalReopenRequests:0,targetedDetailRequests:calls.filter(path=>path==='/api/truckers/driver-a').length,realtimeUpdatesOpenModal:true,removedAccountClosesModal:true,revisitRequests:0,logoutIsolation:true,productionWrites:0};
 }catch(error){throw Error(`${error.message}; calls=${JSON.stringify(calls)}; errors=${JSON.stringify(errors)}`);}finally{await context.close();}
}
