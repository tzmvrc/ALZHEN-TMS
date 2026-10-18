// Real DriverPortal in StrictMode; Auth/API transport mocked, no production writes.
async(page)=>{
 const context=await page.context().browser().newContext({viewport:{width:430,height:900}});
 const fixture=await context.newPage();let reads=0,fail=false;const errors=[];
 fixture.on('pageerror',error=>errors.push(error.message));
 try {
  await fixture.route('**/src/context/AuthContext.tsx*',route=>route.fulfill({contentType:'text/javascript',body:"export const useAuth=()=>({profile:{id:'fixture-trucker',role:'TRUCKER',first_name:'Fixture',last_name:'Driver'},accessToken:'fixture-token',logout:async()=>{}});export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/trucker';"}));
  await fixture.route('**/src/components/ui/Toast.tsx*',route=>route.fulfill({contentType:'text/javascript',body:"export const useToast=()=>({addToast(){}});export const ToastProvider=({children})=>children;"}));
  await fixture.route('**/api/**',async route=>{
   if(route.request().method()!=='GET')throw Error('Unexpected fixture mutation');
   let data=[];
   if(new URL(route.request().url()).pathname.startsWith("/api/notifications"))data={notifications:[],unread_count:0};
   if(new URL(route.request().url()).pathname==='/api/truckers/me/trips') {
    reads++;await new Promise(resolve=>setTimeout(resolve,150));
    if(fail)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture offline'})});
    data=[{id:'fixture-trip',dispatch_number:'DSP-FIXTURE',origin:'Fixture Warehouse',destination:'Fixture Store',status:'PLANNED',loading_timestamps:{warehouse_arrival_at:null,loading_start_at:null,loading_finished_at:null},stops:[{id:'fixture-stop',stop_sequence:1,store_name:'Fixture Store',delivery_status:'Pending',items:[],dr_number:'DR-FIXTURE'}]}];
   }
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await fixture.goto('http://localhost:5173/trucker/login');
  await fixture.evaluate(async()=>{
   await import('/src/index.css');
   const code=await(await fetch('/src/pages/Driver/DriverPortal.tsx')).text();
   const main=await(await fetch('/src/main.tsx')).text();
   const reactPath=code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1];
   const domPath=main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1];
   const react=await import(reactPath),React=react.default??react,DOM=await import(domPath);
   const {default:View}=await import('/src/pages/Driver/DriverPortal.tsx');
   const root=document.createElement('div');root.id='trucker-loading-fixture';Object.assign(root.style,{position:'fixed',inset:'0',zIndex:'2000',overflow:'auto',background:'white'});document.body.append(root);
   (DOM.createRoot??DOM.default.createRoot)(root).render(React.createElement(React.StrictMode,null,React.createElement(View)));
  });
  const root=fixture.locator('#trucker-loading-fixture'),refresh=root.getByRole('button',{name:'Refresh trips',exact:true});
  await root.getByText('DSP-FIXTURE',{exact:true}).first().waitFor();
  await fixture.waitForFunction(()=>!document.querySelector('#trucker-loading-fixture button[aria-label="Refresh trips"]').disabled);
  if(reads!==1)throw Error('StrictMode duplicated initial requests: '+reads);
  fail=true;await refresh.click();await root.getByRole('alert').waitFor();
  if(!await root.getByText('DSP-FIXTURE',{exact:true}).count())throw Error('Failed refresh removed valid trip');
  fail=false;await root.getByRole('button',{name:'Try again',exact:true}).click();
  await root.getByRole('alert').waitFor({state:'detached'});
  if(reads!==3)throw Error('Unexpected retry request count: '+reads);
  if(errors.length)throw Error(errors.join('; '));
  return {mocked:true,productionWrites:0,strictModeInitialRequests:1,totalRequests:reads,backgroundFailurePreservesTrip:true,retryRecovered:true,errors};
 } finally {await context.close();}
}
