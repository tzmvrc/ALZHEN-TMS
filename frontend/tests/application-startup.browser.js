// Isolated real six-sheet workspace; no network access outside local mocked APIs.
async(page)=>{
 const context=await page.context().browser().newContext({viewport:{width:1440,height:1000}}),p=await context.newPage(),errors=[],requests=[],mutations=[];
 const uuid=n=>'123e4567-e89b-42d3-a456-'+String(n).padStart(12,'0');
 const rows=Array.from({length:3},(_,i)=>({trip_id:uuid(10+i),_trip_id:uuid(10+i),trip_stop_id:uuid(1000+i),trip_line_item_id:uuid(2000+i),store_call_id:uuid(3000+i),dispatch_number:'DSP-'+i,remarks:'Fixture '+i,store_call_remarks:'Call '+i,quantity:100,cbm:250}));
 p.on('pageerror',error=>errors.push(error.message));
 try{
 await p.route('**/*',r=>{const u=new URL(r.request().url());return ['localhost','127.0.0.1'].includes(u.hostname)?r.continue():r.abort();});
 await p.route('**/api/**',async r=>{const q=r.request(),u=new URL(q.url()),path=u.pathname;requests.push({method:q.method(),path});let data=[];
 const match=/\/reports\/(dispatch-monitoring|dispatch|trip-booking|store-calling)(\/columns)?$/.exec(path);
 if(match)data=match[2]?{columns:[{key:'dispatch_number',title:'Dispatch Number',type:'text'},{key:'quantity',title:'Quantity',type:'number'},{key:'cbm',title:'CBM',type:'number'},{key:match[1]==='store-calling'?'store_call_remarks':'remarks',title:'Remarks',type:'text'}]}:{rows:rows.slice(),pagination:{page:1,limit:250,total:rows.length,totalPages:1}};
 else if(path.endsWith('/transmittal-tracker/page'))data={table_id:uuid(9),access:{canView:true,canEdit:true,canManage:true,isAdmin:true},columns:[],rows:rows.slice(0,12).map(x=>({...x,warehouse_code:'WH',delivered_to:'Store',plate_number:'FIX-001',driver_name:'Driver',delivery_receipt_no:'DR',transmittal_ref:'REF',status:'Completed',cells:{},legacy_conflicts:[]})),pagination:{page:1,limit:50,total:12,totalPages:1}};
 else if(path.endsWith('/auth/session/bootstrap'))data={authUser:{id:'fixture-admin',email:'fixture@example.test'},profile:{id:'fixture-admin',role:'ADMIN',is_admin:true},expiresAt:'2099-01-01'};
 else if(path.endsWith('/notifications'))data={notifications:[],unreadCount:0};
 else if(path.endsWith('/formulas/read'))data={formulas:[],sources:[]};
 else if(path.endsWith('/capabilities'))data={enabled:true};
 if(!['GET','OPTIONS'].includes(q.method())&&!path.endsWith('/formulas/read')&&!path.endsWith('/auth/session/bootstrap')){mutations.push({method:q.method(),path});return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture mutation blocked'})});}
 await r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});});

 await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:`const channels=new Set(),session={access_token:'fixture-token',user:{id:'fixture-admin'}};window.liveChannels=0;window.peakChannels=0;export const supabase={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange(fn){let live=true;queueMicrotask(()=>live&&fn('INITIAL_SESSION',session));return{data:{subscription:{unsubscribe(){live=false}}}}},signOut:async()=>({error:null})},realtime:{setAuth:async()=>{}},channel(name){const channel={on(){return this},subscribe(callback){channels.add(this);window.liveChannels=channels.size;window.peakChannels=Math.max(channels.size,window.peakChannels);queueMicrotask(()=>callback?.('SUBSCRIBED'));return this}};return channel},removeChannel:async c=>{channels.delete(c);window.liveChannels=channels.size}};`}));
 await p.route('**/src/services/collaboration.service.ts*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace(/const endpoint = [^;]+;/,'const endpoint = "http://127.0.0.1:5199";')});});
 const start=Date.now();await p.goto('http://localhost:5173/trips',{waitUntil:'domcontentloaded'});
 await p.getByRole('tab',{name:'Master List',exact:true}).waitFor({timeout:30000});const shellMs=Date.now()-start;
 await p.getByRole('tabpanel').locator('tbody td[data-report-column-key]').first().waitFor({timeout:20000});const firstRowsMs=Date.now()-start;
 const hover=[];const labels=['Master List','Dispatch Monitoring','Dispatch Report','Trip Booking','Store Calling','Transmittal Tracker'];
 for(const label of labels){await p.getByRole('tab',{name:label,exact:true}).click();const grid=p.getByRole('tabpanel');await grid.locator('tbody tr[data-spreadsheet-blank=true] td:not(.spreadsheet-gutter)').first().waitFor();const cell=grid.locator('tbody tr[data-spreadsheet-blank=true] td:not(.spreadsheet-gutter)').first();await cell.scrollIntoViewIfNeeded();await cell.hover();const outline=await cell.evaluate(c=>getComputedStyle(c).outlineWidth);if(outline==='0px')throw Error('No blank hover: '+label);await cell.click();const selected=await cell.evaluate(c=>c.getAttribute('data-spreadsheet-selected')==='true'||c.getAttribute('data-formula-selected')==='true'||c.hasAttribute('data-fast-selected'));if(!selected)throw Error('Blank not selected: '+label);hover.push({sheet:label,outline,selected});}
 const counts=await p.evaluate(()=>({liveChannels:window.liveChannels,peakChannels:window.peakChannels}));
 const reportRequests=requests.filter(r=>/^\/api\/reports\/(dispatch-monitoring|dispatch|trip-booking|store-calling)$/.test(r.path));
 if(errors.length||mutations.length)throw Error(JSON.stringify({errors,mutations}));
 return {shellMs,firstRowsMs,bootstrapRequests:requests.filter(r=>r.path.endsWith('/auth/session/bootstrap')).length,reportReads:reportRequests.length,hover,...counts,errors,productionWrites:0};
 }catch(cause){throw Error(cause.message+" errors="+JSON.stringify(errors)+" requests="+JSON.stringify(requests)+" body="+(await p.locator("body").innerText()).slice(0,2500));}finally{await context.close();}
}
