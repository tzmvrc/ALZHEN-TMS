// Real DriverPortal in StrictMode; Auth/API transport mocked, no production writes.
async(page)=>{
 const context=await page.context().browser().newContext({viewport:{width:430,height:900}});
 const fixture=await context.newPage();let reads=0,fail=false;const errors=[],writes=[],uploads=[]; const reports=new Map(),imageRequests=new Map(); let lostReport=false,lostImage=false;
 fixture.on('pageerror',error=>errors.push(error.stack??error.message));
 try {
  await fixture.route('**/src/context/AuthContext.tsx*',route=>route.fulfill({contentType:'text/javascript',body:"export const useAuth=()=>({profile:{id:'fixture-trucker',role:'TRUCKER',first_name:'Fixture',last_name:'Driver'},accessToken:'fixture-token',logout:async()=>{}});export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/trucker';"}));
  await fixture.route('**/src/components/ui/Toast.tsx*',route=>route.fulfill({contentType:'text/javascript',body:"export const useToast=()=>({addToast(){}});export const ToastProvider=({children})=>children;"}));
  await fixture.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(request.method()!=="GET"){
    if(path.endsWith("/receipts")){
      const key=request.headers()["x-upload-request-id"];if(!/^[a-f0-9-]{36}$/.test(key??""))throw Error("Missing durable upload key");
      uploads.push({path,key});imageRequests.set(key,path);
      if(!lostImage){lostImage=true;return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({success:false,message:"Lost successful upload response"})});}
      return route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({success:true,data:{id:key}})});
    }
    if(!["/api/reports/operations/offloads","/api/reports/operations/backloads"].includes(path))throw Error("Unexpected mocked mutation");
    const body=request.postDataJSON();writes.push({path,body});
    if(!/^[a-f0-9-]{36}$/.test(body.request_id??""))throw Error("Missing durable report key");
    if(reports.has(body.request_id)&&reports.get(body.request_id)!==JSON.stringify(body))throw Error("Retry payload changed");
    reports.set(body.request_id,JSON.stringify(body));
    if(!lostReport){lostReport=true;return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({success:false,message:"Lost successful report response"})});}
    return route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({success:true,data:{id:"123e4567-e89b-42d3-a456-000000000099",...body}})});
   }
   let data=[];
   if(new URL(route.request().url()).pathname.startsWith("/api/notifications"))data={notifications:[],unread_count:0};
   if(path.endsWith("/operations/assigned"))data={trip_options:[{id:"123e4567-e89b-42d3-a456-000000000010",trip_number:1,dispatch_number:"DSP-PARENT",status:"IN_PROGRESS",driver_name:"Fixture Driver",plate_number:"TEST-1",route:"Fixture",stops:[{id:"123e4567-e89b-42d3-a456-000000000021",stop_sequence:1,dispatch_number:"DSP-STOP-1",quantity:2,total_cbm:1},{id:"123e4567-e89b-42d3-a456-000000000022",stop_sequence:2,dispatch_number:"DSP-STOP-2",quantity:3,total_cbm:2}]}]};
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
  for(const type of ["OFFLOAD","BACKLOAD"]){
   await root.getByRole("button",{name:"Report Trip",exact:true}).click();
   const dialog=root.getByRole("dialog",{name:"Report Trip",exact:true});await dialog.waitFor();
   await dialog.getByLabel("Event Type",{exact:false}).selectOption(type);
   await dialog.getByRole("button",{name:"Choose dispatch number",exact:true}).click();
   await fixture.getByRole("option",{name:"DSP-STOP-2",exact:true}).click();
   const submit=dialog.getByRole("button",{name:"Submit Report",exact:true});
   if(!await submit.isDisabled())throw Error("Reason should be required");
   await dialog.getByLabel("Reason",{exact:false}).fill("Line one\nLine two");
   await dialog.locator('input[type="file"]').setInputFiles([1,2,3].map(n=>({name:`proof-${n}.png`,mimeType:"image/png",buffer:Buffer.from([137,80,78,71,13,10,26,10,1])})));
   await dialog.getByRole("button",{name:"Remove proof-1.png",exact:true}).click();
   await submit.evaluate(element=>{element.click();element.click();});
   if(type==="OFFLOAD"){
     await dialog.getByRole("button",{name:"Retry same submission",exact:true}).click();
     await dialog.getByRole("button",{name:"Retry receipt upload",exact:true}).click();
   }
   await dialog.waitFor({state:"detached"});
  }
  if(reports.size!==2||writes.length!==3||imageRequests.size!==4||uploads.length!==5)throw Error("Retry created duplicates or lost images");
  if(writes[0].body.request_id!==writes[1].body.request_id||uploads[0].key!==uploads[1].key)throw Error("Retry regenerated a key");
  for(const {body} of writes){if(body.trip_id!=="123e4567-e89b-42d3-a456-000000000010"||body.trip_stop_id!=="123e4567-e89b-42d3-a456-000000000022"||body.reason!=="Line one\nLine two"||"created_by" in body||"submitted_by" in body)throw Error("Wrong stop/identity/reason");}
  if(errors.length)throw Error(errors.join('; '));
  return {mocked:true,productionWrites:0,reportTypes:2,lostReportResponseRecovered:true,lostImageResponseRecovered:true,uniqueReports:reports.size,uniqueImages:imageRequests.size,multipleImages:true,exactStop:true,creatorNotClientSupplied:true,errors};
 } catch(error){throw Error(String(error)+"; render errors="+JSON.stringify(errors)+"; body="+(await fixture.locator("body").innerText()).slice(-2000));} finally {await context.close();}
}
