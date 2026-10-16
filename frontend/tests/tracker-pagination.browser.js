// Actual Tracker component, fake authorized APIs. No production writes.
async(page)=>{
 const context=await page.context().browser().newContext({viewport:{width:1400,height:1000}}),p=await context.newPage(),calls=[],errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"export const useAuth=()=>({profile:{id:'fixture-admin',role:'ADMIN',first_name:'Fixture',last_name:'Admin'},user:{user_metadata:{}},accessToken:'fixture-token',loading:false});export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/login';"}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:"export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};"}));
  await p.route('**/api/**',async r=>{
   const q=r.request(),url=new URL(q.url());calls.push({method:q.method(),path:url.pathname,query:url.search});
   if(q.method()!=='GET')throw Error('Unexpected fixture mutation '+url.pathname);
   let data=[];
   if(url.pathname==='/api/reports/transmittal-tracker/page'){
    const n=Number(url.searchParams.get('page')||1),limit=Number(url.searchParams.get('limit')||50),search=url.searchParams.get('search')||'';
    const rows=Array.from({length:55},(_,i)=>({trip_stop_id:'fixture-stop-'+(i+1),trip_id:'fixture-trip',warehouse_code:'WH',delivered_to:'Store '+(i+1),plate_number:'FIX-001',driver_name:'Fixture Driver',delivery_receipt_no:'DR-'+(i+1),transmittal_ref:i===54?'REF-2':'REF-1',status:'Completed',sales_order_no:'',date_created:'',lbc_waybill_no:'',shipping_date_via_lbc:'',remarks:'',loading_date:'',date_delivered:'',cells:{},legacy_conflicts:[]})).filter(row=>(!search||row.delivery_receipt_no===search)&&(!url.searchParams.get('reference')||row.transmittal_ref===url.searchParams.get('reference'))&&(!url.searchParams.get('filter')||row.transmittal_ref.includes(url.searchParams.get('filter'))));
    data={table_id:'fixture-tracker',access:{canView:true,canEdit:true,canManage:true,isAdmin:true},columns:[],rows:rows.slice((n-1)*limit,n*limit),pagination:{page:n,limit,total:rows.length,totalPages:Math.max(1,Math.ceil(rows.length/limit))}};
   }
   if(url.pathname==='/api/reports/transmittal-tracker')throw Error('Unbounded Tracker endpoint used');
   await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.route('**/login',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('<script type="module" src="/src/main.tsx"></script>','')});});
  await p.goto('http://localhost:5173/login');const initialStart=Date.now();
  await p.evaluate(async()=>{
   await import('/src/index.css');const code=await(await fetch('/src/components/admin/TransmittalTrackerView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
   const module=await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1]),React=module.default??module,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {default:View}=await import('/src/components/admin/TransmittalTrackerView.tsx');
   const el=document.createElement('div');el.id='tracker-fixture';Object.assign(el.style,{position:'fixed',inset:'0',zIndex:'1000',background:'white',overflow:'auto',padding:'20px'});document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(View));
  });
  const root=p.locator('#tracker-fixture');await root.getByRole('checkbox',{name:'Select row Store 1',exact:true}).waitFor();const initialReadyMs=Date.now()-initialStart;
  await root.getByRole('checkbox',{name:'Select row Store 1',exact:true}).check();
  const nav=root.locator('footer[aria-label="Tracker pagination"]');
  await root.getByRole('button',{name:'Edit selected row',exact:true}).click();
  const dialog=root.getByRole('dialog');await dialog.getByLabel('Remarks',{exact:true}).fill('Unsaved fixture draft');
  if(!await nav.getByRole('button',{name:'Next',exact:true}).isDisabled())throw Error('Page navigation allowed an unsaved modal draft');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await nav.getByRole('button',{name:'Next',exact:true}).click();await root.getByRole('checkbox',{name:'Select row Store 51',exact:true}).waitFor();
  if(await root.getByRole('checkbox',{name:'Select row Store 51',exact:true}).isChecked())throw Error('Selection leaked across pages');
  const navigationStart=Date.now();await nav.getByRole('button',{name:'Previous',exact:true}).click();await root.getByRole('checkbox',{name:'Select row Store 1',exact:true}).waitFor();
  if(await root.getByRole('checkbox',{name:'Select row Store 1',exact:true}).isChecked())throw Error('Old page selection resurrected');const cachedNavigationMs=Date.now()-navigationStart;
  if(calls.filter(c=>c.path.endsWith('/page')).length!==2)throw Error('Cached page navigation duplicated a request');
  const search=root.getByRole('combobox',{name:'Search rows or columns'});await search.fill('DR-52');await search.press('Enter');
  await root.getByRole('checkbox',{name:'Select row Store 52',exact:true}).waitFor();
  if(await root.locator('tbody tr').count()!==1)throw Error('Search did not use server result');
  await root.getByRole('button',{name:'Prepare Sheet',exact:true}).click();
  let prep=p.getByRole('dialog',{name:'Prepare Transmittal Sheet',exact:true});
  await prep.getByRole('combobox').selectOption('REF-1');
  await prep.getByRole('button',{name:'Prepare sheet',exact:true}).click();
  await p.locator('#transmittal-sheet-document tbody tr').nth(53).waitFor();
  if(await p.locator('#transmittal-sheet-document tbody tr').count()!==54)throw Error('Reference preview truncated to visible page or included sibling reference');
  await p.getByRole('button',{name:'Close sheet preview',exact:true}).click();
  if(await root.locator('tbody tr').count()!==1)throw Error('Sheet data replaced grid page');
  await root.getByRole('button',{name:'Prepare Sheet',exact:true}).click();prep=p.getByRole('dialog',{name:'Prepare Transmittal Sheet',exact:true});
  await prep.getByRole('textbox',{name:'Search all Transmittal References'}).fill('REF-2');
  await prep.getByRole('option',{name:'REF-2',exact:true}).waitFor({state:'attached'});
  await prep.getByRole('combobox').selectOption('REF-2');
  await prep.getByRole('button',{name:'Prepare sheet',exact:true}).click();
  await p.locator('#transmittal-sheet-document').getByText('Store 55',{exact:true}).waitFor();
  if(await p.locator('#transmittal-sheet-document tbody tr').count()!==1)throw Error('Global reference selected incorrect transactions');
  await p.getByRole('button',{name:'Close sheet preview',exact:true}).click();
  if(errors.length)throw Error(errors.join('\n'));
  return {mocked:true,productionWrites:0,initialReadyMs,cachedNavigationMs,pageRequests:calls.filter(c=>c.path.endsWith('/page')).length,cachedReturnRequests:0,selectionIsolated:true,serverSearch:true,draftNavigationBlocked:true,referencePreviewRows:54,globalReferenceSearch:true,gridPagePreserved:true,errors};
 }catch(e){throw new Error(e.message+"\nerrors="+JSON.stringify(errors)+"\ncalls="+JSON.stringify(calls)+"\nui="+await p.locator('#tracker-fixture').innerText());}finally{await context.close();}
}
