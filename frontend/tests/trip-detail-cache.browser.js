// Real TripDetailView and cache; isolated authorized APIs, no production writes.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),calls=[],errors=[];
 let fail=0;
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.route('**/login',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('<script type="module" src="/src/main.tsx"></script>','')});});
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"const auth={accessToken:'fixture-token',profile:{id:'fixture-admin',role:'ADMIN'},refreshSession:async()=>{}};export const useAuth=()=>auth;export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/login';export const getRoleBasedHome=()=>'/login';"}));
  await p.route('**/src/components/admin/LiveTripMap.tsx*',r=>r.fulfill({contentType:'text/javascript',body:'export default function Map(){return null}'}));
  await p.route('**/src/components/admin/ReceiptReviewCard.tsx*',r=>r.fulfill({contentType:'text/javascript',body:'export default function Receipts(){return null}'}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};'}));
  await p.route('**/api/**',async r=>{
   const req=r.request(),path=new URL(req.url()).pathname;calls.push(path);if(req.method()!=='GET')throw Error('Unexpected business write');
   let data=[];
   if(path==='/api/trips/fixture-trip'){
    await new Promise(resolve=>setTimeout(resolve,250));
    if(fail)return r.fulfill({status:fail,contentType:'application/json',body:JSON.stringify({success:false,message:fail===403?'Forbidden':'Fixture refresh failed'})});
    data={trip:{id:'fixture-trip',dispatch_number:'DSP-CACHE-FIXTURE',status:'PLANNED',loading_date:null},warehouse:null,trip_type:null};
   }else if(path==='/api/reports/trip-booking')data={rows:[],pagination:{page:1,totalPages:1}};
   else if(path.includes('/reports/operations/'))data={trips:[],trip_options:[],stops:[],loading:[],unloading:[],backloads:[],offloads:[],event_rows:[]};
   await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/login');
  await p.evaluate(async()=>{
   await import('/src/index.css');const code=await(await fetch('/src/pages/Admin/views/TripDetailView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
   const react=await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1]),React=react.default??react,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]),{default:View}=await import('/src/pages/Admin/views/TripDetailView.tsx');
   const el=document.createElement('div');el.id='trip-cache-fixture';document.body.append(el);const root=(DOM.createRoot??DOM.default.createRoot)(el);let version=0;
   window.__remountTrip=()=>root.render(React.createElement(MemoryRouter,null,React.createElement(View,{key:++version,tripId:'fixture-trip',onBack:()=>{}})));
   const api=await import(code.match(/from ["']([^"']*api\.service\.ts[^"']*)["']/)[1]),trips=await import(code.match(/from ["']([^"']*trip\.service\.ts[^"']*)["']/)[1]);
   window.__expireTrip=async()=>{const endpoint='/trips/fixture-trip/screen-snapshot',snapshot=api.getCachedApiResponse(endpoint,'fixture-token',300000);trips.invalidateTripCache('fixture-trip');api.invalidateApiCache('/trips/fixture-trip');api.cacheApiSnapshot(endpoint,'fixture-token',snapshot,api.apiCacheGeneration());};
   window.__remountTrip();
  });
  const root=p.locator('#trip-cache-fixture');await root.getByLabel('Loading trip details').waitFor();await root.getByText('DSP-CACHE-FIXTURE',{exact:true}).first().waitFor();
  await p.waitForTimeout(400);const reads=calls.length;await p.evaluate(()=>window.__remountTrip());await root.getByText('DSP-CACHE-FIXTURE',{exact:true}).first().waitFor();
  if(await root.getByLabel('Loading trip details').count())throw Error('Cached navigation blocked by skeleton');await p.waitForTimeout(400);if(calls.length!==reads)throw Error('Fresh navigation duplicated API reads: '+JSON.stringify(calls));
  fail=500;await p.evaluate(async()=>{await window.__expireTrip();window.__remountTrip();});await root.getByRole('alert').filter({hasText:'Previous trip data is retained'}).waitFor();if(!await root.getByText('DSP-CACHE-FIXTURE',{exact:true}).first().isVisible())throw Error('Transient failure discarded valid snapshot');
  fail=403;await p.evaluate(async()=>{await window.__expireTrip();window.__remountTrip();});await root.getByRole('alert').filter({hasText:'not authorized'}).waitFor();if(await root.getByText('DSP-CACHE-FIXTURE',{exact:true}).count())throw Error('Forbidden response retained private snapshot');
  if(errors.length)throw Error(errors.join('; '));return {isolated:true,initialRequests:reads,cachedNavigationRequests:0,initialSkeleton:true,cachedNavigation:true,transientFailureRetainsData:true,forbiddenEvictsData:true,productionWrites:0,errors};
 }finally{await context.close();}
}
