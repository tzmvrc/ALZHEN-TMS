// Isolated production DeliveryCompanion component; all API traffic is intercepted.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createCanvas}=require('../../backend/node_modules/@napi-rs/canvas');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const fields={dr:'FIXTURE-100',receiver:'Fixture Store',date:'2026-10-01',models:'TEST-100, TEST-200'};
const ready={state:'READY',fields,ocr_text:'Controlled fixture',confidence:95,warnings:[]};
const partial={state:'PARTIAL',fields:{dr:'FIXTURE-100',receiver:'',date:'',models:''},ocr_text:'DR No: FIXTURE-100',confidence:86,warnings:[],service_error:{code:'POD_AI_MODEL_UNSUPPORTED',message:'Configured fixture model is unavailable.'}};
const unreadable={state:'UNREADABLE',source:'vision',unreadable_confirmed:true,fields:{dr:'',receiver:'',date:'',models:''},ocr_text:'',confidence:null,warnings:[]};
(async()=>{
 let streamResponse;const streamServer=http.createServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');if(req.method==='OPTIONS'){res.end();return;}req.resume();res.setHeader('Content-Type','application/x-ndjson');const next=streamResponse;res.write(JSON.stringify({progress:true,data:next.progress})+'\n');setTimeout(()=>next.interrupt?res.destroy():res.end(JSON.stringify({success:true,data:next.data})+'\n'),next.delay||700);});await new Promise(resolve=>streamServer.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],checks=[];
 page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
 let responses=[],reads=0,writes=0,allowFixtureSync=false;const syncRequests=[];
 const workspace={assignment:{id:id(2),trip_id:id(3),truck:{plate_number:'FIXTURE 001',truck_type:'10W'},trip:{dispatch_number:'ISOLATED POD FIXTURE',status:'IN_PROGRESS'}},warehouse:{name:'Fixture warehouse'},stops:[{id:id(4),stop_sequence:1,dr_number:'FIXTURE-100',store:{name:'Fixture Store'}}],cargo:[{id:id(5),quantity:2,allocated_cbm:1,delivered:0,remaining:2,line:{id:id(6),trip_stop_id:id(4),dr_number:'FIXTURE-100',customer_model:'TEST-100'}}],milestones:['WAREHOUSE_ARRIVAL','LOADING_STARTED','LOADING_FINISHED','WAREHOUSE_DEPARTURE','ARRIVED'].map((type,i)=>({id:id(10+i),event_type:type,trip_stop_id:type==='ARRIVED'?id(4):null,event_time:'2026-10-01T00:00:00Z'})),pods:[],pod_cargo_reviews:[]};
 workspace.cargo.push({...workspace.cargo[0],id:id(25),line:{...workspace.cargo[0].line,id:id(26),customer_model:'TEST-100',dr_number:'FIXTURE-200'}});workspace.cargo.push({...workspace.cargo[0],id:id(27),line:{...workspace.cargo[0].line,id:id(28),trip_stop_id:id(99),customer_model:'UNRELATED-999'}});
 try{
  await page.route('**/src/context/AuthContext.tsx*',route=>route.fulfill({contentType:'text/javascript',body:`export const useAuth=()=>({profile:{id:'${id(1)}',role:'TRUCKER'},accessToken:'fixture'});`}));
  await page.route('**/src/components/ui/Toast.tsx*',route=>route.fulfill({contentType:'text/javascript',body:'export const useToast=()=>({addToast:()=>{}});'}));
  for(const path of ['components/admin/LocationSharing','components/admin/TruckerNotifications'])await page.route(`**/src/${path}.tsx*`,route=>route.fulfill({contentType:'text/javascript',body:'export default function Fixture(){return null;}'}));
  await page.route('**/src/services/collaboration.service.ts*',route=>route.fulfill({contentType:'text/javascript',body:'export const joinCollaborationRoom=()=>()=>{};export const subscribeCollaborationEvents=()=>()=>{};export const collaborationSnapshot=()=>({});export const subscribeCollaboration=()=>()=>{};'}));
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('/pod/read')){
    reads++;const next=responses.shift();assert.ok(next,'Unexpected duplicate receipt request');
    if(next.progress){streamResponse=next;await route.continue({url:`http://127.0.0.1:${streamServer.address().port}/read`});return;}
    if(next.hold)await next.hold;
    if(next.delay)await new Promise(resolve=>setTimeout(resolve,next.delay));
    try{await route.fulfill({status:next.http||200,contentType:'application/json',body:JSON.stringify(next.http?{success:false,message:next.message,error:{code:'TIMEOUT'}}:{success:true,data:next.data})});}catch{/* Replaced/timeout requests are intentionally aborted. */}return;
   }
   if(allowFixtureSync&&route.request().method()==='POST'&&(path.endsWith('/evidence')||path.endsWith('/events'))){syncRequests.push({path,fileName:decodeURIComponent(route.request().headers()['x-file-name']||''),key:route.request().headers()['idempotency-key'],body:path.endsWith('/events')?route.request().postDataJSON():null});await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{id:path.endsWith('/evidence')?id(90):id(91)}})});return;}
   if(route.request().method()!=='GET'){writes++;await route.abort();return;}
   const data=path.endsWith('/receipts')?[]:path.endsWith('/current')?workspace:path.endsWith('pod-intake-capabilities')?{pdf:false}:{rows:[],next:null};
   await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await page.goto('http://localhost:5173/tests/table-fixture.html');
  const mount=async()=>page.evaluate(async()=>{
   const main=await(await fetch('/src/main.tsx')).text(),code=await(await fetch('/src/pages/Driver/DeliveryCompanion.tsx')).text();
   const React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const router=await import(code.match(/from ["']([^"']*react-router-dom[^"']*)["']/)[1]);
   const {default:Companion}=await import('/src/pages/Driver/DeliveryCompanion.tsx');await import('/src/index.css');
   (DOM.createRoot??DOM.default.createRoot)(document.body.appendChild(document.createElement('div'))).render(React.createElement(router.BrowserRouter,null,React.createElement(Companion)));
  });
  await mount();
  const canvas=createCanvas(900,500),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,500);ctx.fillStyle='black';ctx.font='32px Arial';ctx.fillText('SYNTHETIC RECEIPT FIXTURE-100',30,100);
  const image=name=>{ctx.fillStyle='white';ctx.fillRect(0,0,900,500);ctx.fillStyle='black';ctx.font='32px Arial';ctx.fillText('SYNTHETIC RECEIPT FIXTURE-100',30,100);ctx.fillText(name,30,170);return {name,mimeType:'image/png',buffer:canvas.toBuffer('image/png')};};
  const details=()=>page.getByRole('group',{name:'Review receipt details',exact:true});
  const open=async()=>{await page.getByRole('button',{name:'Upload POD',exact:true}).first().click();await page.locator('dialog').waitFor();assert.equal(await details().count(),0);assert.equal(await page.getByLabel('DR No.',{exact:true}).count(),0);assert.ok(await page.getByRole('textbox',{name:'Remarks (optional)',exact:true}).isVisible());};
  const close=async()=>{await page.locator('dialog').getByRole('button',{name:'Close',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});};
  const upload=async(name='fixture.png')=>page.getByLabel('Add POD photos',{exact:true}).setInputFiles(image(name));
  const reading=()=>page.locator('.delivery-reading-status');
  await open();responses.push({data:unreadable});await upload('only-unreadable.png');await reading().waitFor({state:'detached'});await details().waitFor();await page.getByLabel('DR No.',{exact:true}).fill('FIXTURE-100');assert.equal(await page.locator('.delivery-pod-photo-row').count(),1);assert.equal(await page.locator('dialog').getByRole('button',{name:'Upload POD',exact:true}).isEnabled(),true);await close();
  await open();responses.push({data:ready,delay:700});await upload('readable.png');await reading().waitFor();await page.getByLabel('DR No.',{exact:true}).fill('FIXTURE-200');await page.getByLabel('Received by / store',{exact:true}).fill('Corrected manually');await reading().waitFor({state:'detached'});assert.equal(await page.getByLabel('DR No.',{exact:true}).inputValue(),'FIXTURE-200');
  responses.push({data:unreadable});await upload('unreadable-kept.png');await reading().waitFor({state:'detached'});await page.waitForFunction(()=>document.querySelectorAll('.delivery-pod-photo-row').length===2);
  responses.push({data:{...unreadable,state:'INVALID',non_pod_confirmed:true,unreadable_confirmed:false,document_classification:{kind:'unrelated',confidence:100,contains_delivery_content:false,reason:'Fixture landscape'}}});await upload('unrelated-kept.png');await page.waitForFunction(()=>document.querySelectorAll('.delivery-pod-photo-row').length===3);await reading().waitFor({state:'detached'});
  responses.push({data:ready});await upload('readable.png');await page.waitForFunction(()=>document.querySelectorAll('.delivery-pod-photo-row').length===4);await reading().waitFor({state:'detached'});
  assert.equal(await page.getByLabel('Received by / store',{exact:true}).inputValue(),'Corrected manually');assert.equal(await page.getByLabel('DR No.',{exact:true}).inputValue(),'FIXTURE-200');
  await page.getByRole('button',{name:/Product models/}).click();await page.getByRole('checkbox',{name:'Select All',exact:true}).check();await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'));});await page.getByRole('button',{name:'Save pending sync',exact:true}).click();try{await page.getByRole('button',{name:/Saved offline.*Awaiting sync|Queued.*awaiting sync/}).waitFor();}catch(e){console.log((await page.locator('dialog').innerText()).slice(-1800));throw e;}
  const inspect=()=>page.evaluate(async owner=>(await(await import('/src/services/delivery-outbox.ts')).readDeliveryOutbox(owner)).map(r=>({names:r.files.map(f=>f.file.name),text:r.input.ocr_text,dr:r.input.dr_number})),id(1));const saved=await inspect();assert.equal(saved.length,1);assert.deepEqual(saved[0].names,['readable.png','unreadable-kept.png','unrelated-kept.png','readable.png']);assert.equal(saved[0].dr,'FIXTURE-200');assert(saved[0].text.includes('Corrected manually'));assert(saved[0].text.includes('"allocation_id":"'+id(5)+'"'));assert(saved[0].text.includes('"allocation_id":"'+id(25)+'"'));assert(!saved[0].text.includes('"allocation_id":"'+id(27)+'"'));await page.reload();assert.deepEqual(await inspect(),saved);
  assert.deepEqual(errors,[]);checks.push('late OCR respects manual DR/store corrections; unreadable and unrelated photos remain; repeated model DR allocations remain distinct; offline queue/reload preserves all four intentional photos including a duplicate and final fields');console.log(JSON.stringify({passed:true,checks,pageErrors:errors},null,2));
 }finally{await page.unrouteAll({behavior:'ignoreErrors'});await browser.close();await new Promise(resolve=>streamServer.close(resolve));}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
