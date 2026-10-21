// Real Database components; every business/design/image request is fulfilled in memory.
// Run with Playwright MCP browser_run_code_unsafe(filename). Never writes live data.
async page=>{
 const contexts=[],errors=[],requests=[],writes=[];let sequence=1000,failSave=false,failDelete=true;
 const uuid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const tables={warehouses:Array.from({length:35},(_,i)=>({id:uuid(i+1),code:`WH${String(i+1).padStart(2,'0')}`,name:`Warehouse ${i+1}`,address:'',status:'ACTIVE',location_verified:false})),trucks:[{id:uuid(101),plate_number:'FIX-101',truck_type:'Van',capacity_cbm:40,status:'ACTIVE',trucking_company_id:uuid(201),trucking_companies:{id:uuid(201),name:'Fixture Logistics'}}],'trucking-companies':[{id:uuid(201),name:'Fixture Logistics',status:'ACTIVE'}],stores:[{id:uuid(301),name:'Fixture Store',code:'STR1',customer_id:uuid(401),customers:{id:uuid(401),name:'Fixture Customer'},status:'ACTIVE'}],'store-contacts':[{id:uuid(501),store_id:uuid(301),name:'Fixture Contact',customer_stores:{name:'Fixture Store'},is_primary:false}],products:Array.from({length:65},(_,i)=>({id:uuid(601+i),name:`Product ${String(i+1).padStart(2,'0')}`,sku:`SKU-${i+1}`,unit_cbm:1,status:'ACTIVE'}))};
 const layouts=new Map(),images=new Map([[uuid(101),[{id:uuid(901),truck_id:uuid(101),file_name:'fixture.png',storage_path:'fixture.png',signed_url:'https://fixture.invalid/image.png'}]]]);
 const merge=(a,b)=>({...a,...b,...(b.header?{header:{...a.header,...b.header}}:{}),...(b.format?{format:{...a.format,...b.format}}:{}),...(b.cells?{cells:Object.fromEntries([...new Set([...Object.keys(a.cells??{}),...Object.keys(b.cells)])].map(k=>[k,{...a.cells?.[k],...b.cells[k]}]))}:{})});
 const emit=async event=>{for(const context of contexts)for(const p of context.pages())if(!p.isClosed())await p.evaluate(e=>window.__databaseEmit?.(e),event);};
 const mount=async p=>{
  await p.evaluate(async()=>{
   await import('/src/index.css');const code=await(await fetch('/src/pages/Admin/views/MasterDataView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
   const react=await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1]),React=react.default??react,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{default:View}=await import('/src/pages/Admin/views/MasterDataView.tsx');
   const el=document.createElement('main');el.id='database-fixture';Object.assign(el.style,{position:'fixed',inset:'0',background:'white',display:'flex',flexDirection:'column',overflow:'hidden',padding:'8px'});document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(View));
  });
 };
 const make=async role=>{
  const context=await page.context().browser().newContext({viewport:{width:1440,height:950}});contexts.push(context);const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`export const useAuth=()=>({profile:{id:'${uuid(role==='ADMIN'?800:801)}',role:'${role}'},accessToken:'fixture-${role}'});export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/login';`}));
  await p.route('**/src/services/realtime.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:`const listeners=new Set();window.__databaseEmit=e=>listeners.forEach(f=>f(e));export function subscribeToAdminRealtime(f){listeners.add(f);return()=>listeners.delete(f)};`}));
  await p.route('https://fixture.invalid/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>'}));
  await p.route('**/api/**',async route=>{
   const req=route.request(),u=new URL(req.url()),parts=u.pathname.split('/').map(decodeURIComponent);requests.push({method:req.method(),path:u.pathname,query:u.search});let data=[];
   const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({success:status<400,data,...(status>=400?{message:'Fixture save failed. Your draft is preserved.'}:{})})});
   if(parts[2]==='table-layouts'){
    const table=parts[3];if(req.method()==='GET')return respond([...layouts.values()].filter(v=>v.table_key===table));
    const input=req.postDataJSON(),col=parts[4]==='design'?parts[5]:parts[4],key=`${table}:${col}`,before=layouts.get(key)??{table_key:table,column_key:col,width_px:input.initial_width_px??180,revision:0,design:{}};
    if(input.expected_revision!==before.revision)return respond(null,409);
    data={...before,revision:before.revision+1,...(input.patch?{design:merge(before.design,input.patch)}:{width_px:input.width_px})};layouts.set(key,data);writes.push({table,col,input});return respond(data);
   }
   if(parts[2]==='lookups'){const kind=parts[3];return respond(kind==='customers'?[{id:uuid(401),name:'Fixture Customer',code:'CUS'}]:tables[kind]??[]);}
   if(parts[2]!=='master-data')throw Error(`Unexpected fixture endpoint ${u.pathname}`);
   const kind=parts[3],rows=tables[kind];
   if(kind==='trucks'&&parts[5]==='images'){
    const owner=parts[4];if(req.method()==='GET')return respond(images.get(owner)??[]);
    if(req.method()==='POST'){const image={id:uuid(++sequence),truck_id:owner,file_name:decodeURIComponent(req.headers()['x-file-name']),storage_path:'fixture',signed_url:'https://fixture.invalid/new.png'};images.set(owner,[...(images.get(owner)??[]),image]);return respond(image);}
    if(req.method()==='DELETE'){images.set(owner,(images.get(owner)??[]).filter(v=>v.id!==parts[6]));return respond({id:parts[6]});}
   }
   if(req.method()==='GET'){
    if(parts[4])return respond(rows.find(row=>row.id===parts[4])??null);
    let values=[...rows],search=u.searchParams.get('search')?.toLowerCase();if(search)values=values.filter(row=>Object.values(row).some(v=>String(v??'').toLowerCase().includes(search)));
    const sort=u.searchParams.get('sort');if(sort)values.sort((a,b)=>String(a[sort]??'').localeCompare(String(b[sort]??''))*(u.searchParams.get('direction')==='desc'?-1:1));
    const limit=Number(u.searchParams.get('limit')??30),number=Number(u.searchParams.get('page')??1);return respond({rows:values.slice((number-1)*limit,number*limit),location_verification_supported:true,pagination:{page:number,limit,total:values.length,totalPages:Math.max(1,Math.ceil(values.length/limit))}});
   }
   if(parts[4]==='delete-records'){
    const ids=req.postDataJSON().ids,failed=failDelete?[{id:ids.at(-1),message:'Fixture protected attachment.'}]:[],deleted=ids.filter(id=>!failed.some(v=>v.id===id));tables[kind]=rows.filter(row=>!deleted.includes(row.id));return respond({deleted,failed});
   }
   const input=req.postDataJSON();writes.push({kind,method:req.method(),input});if(failSave)return respond(null,422);
   if(req.method()==='PATCH'){const index=rows.findIndex(row=>row.id===parts[4]);data=rows[index]={...rows[index],...input};return respond(data);}
   if(req.method()==='POST'){data={...input,id:uuid(++sequence)};rows.push(data);return respond(data);}
   throw Error(`Unhandled ${req.method()} ${u.pathname}`);
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await mount(p);return p;
 };
 const assert=(value,message)=>{if(!value)throw Error(message);};const active=p=>p.locator('.database-spreadsheet:not([hidden])'),cell=(p,n,key)=>active(p).locator(`[data-database-cell="${uuid(n)}|${key}"]`),header=(p,key)=>active(p).locator(`th[data-spreadsheet-column="${key}"]`);
 try{
  const admin=await make('ADMIN');await cell(admin,1,'code').waitFor();
  // No backend calls merely from selection. Header-only selection never selects body.
  await header(admin,'code').click();assert(await active(admin).locator('td[data-spreadsheet-selected=true]').count()===0,'Header click selected body');
  await admin.waitForTimeout(300);const selectionReads=requests.length;await cell(admin,1,'name').click();await cell(admin,1,'code').click();await admin.waitForTimeout(100);assert(requests.length===selectionReads,'Cell selection issued network requests');
  const h=await header(admin,'code').evaluate(e=>({height:e.getBoundingClientRect().height,align:getComputedStyle(e).verticalAlign}));assert(h.height<=33&&h.align==='middle','Header sizing/alignment');
  await header(admin,'code').click({button:'right'});await admin.getByRole('menuitem',{name:'Rename column',exact:true}).click();await admin.getByRole('textbox',{name:'Rename Code',exact:true}).fill('Warehouse ref');await admin.getByRole('textbox',{name:'Rename Code',exact:true}).press('Enter');
  await admin.waitForFunction(()=>document.querySelector('th[data-spreadsheet-column=code]')?.textContent.includes('Warehouse ref'));
  await header(admin,'code').click();await active(admin).getByRole('button',{name:'Bold selected cells',exact:true}).click();await admin.waitForTimeout(300);assert([...layouts.values()].some(v=>v.column_key==='code'&&v.design.header?.bold===false),'Header bold not persisted separately');
  assert(![...layouts.values()].find(v=>v.column_key==='code').design.format,'Header style leaked to body');
  await active(admin).getByRole('button',{name:'Italic selected cells',exact:true}).click();await active(admin).getByRole('button',{name:'Font size',exact:true}).click();await active(admin).getByRole('option',{name:'14px',exact:true}).click();await active(admin).getByRole('button',{name:'Text color',exact:true}).click();await active(admin).getByRole('button',{name:'Text color #1d4ed8',exact:true}).click();
  await active(admin).getByRole('button',{name:'Cell color',exact:true}).click();await active(admin).getByRole('button',{name:'Cell color #fef3c7',exact:true}).click();await admin.waitForTimeout(700);
  assert(await header(admin,'code').evaluate(e=>getComputedStyle(e).backgroundColor)==='rgb(254, 243, 199)','Header-only fill missing');assert(await cell(admin,1,'code').evaluate(e=>getComputedStyle(e).backgroundColor)!=='rgb(254, 243, 199)','Header fill leaked to data');
  const staff=await make('STAFF');await cell(staff,1,'code').waitFor();assert(await header(staff,'code').textContent().then(s=>s.includes('Warehouse ref')),'Alias not shared to other session');await staff.reload();await mount(staff);await cell(staff,1,'code').waitFor();assert(await header(staff,'code').evaluate(e=>getComputedStyle(e).backgroundColor)==='rgb(254, 243, 199)','Header fill lost on refresh');
  // Enter/blur/no-idle saves and confirmed feedback, including failure draft recovery.
  await cell(admin,1,'name').dblclick();let editor=cell(admin,1,'name').locator('input');await editor.fill('Edited warehouse');await editor.press('Enter');await cell(admin,1,'name').getByText('Saved',{exact:true}).waitFor();assert(tables.warehouses[0].name==='Edited warehouse','Enter did not persist');await admin.waitForTimeout(1950);assert(await cell(admin,1,'name').getByText('Saved',{exact:true}).count()===0,'Saved did not expire');
  await cell(admin,1,'address').dblclick();editor=cell(admin,1,'address').locator('input');await editor.fill('Blank address edited');await admin.waitForTimeout(300);assert(tables.warehouses[0].address==='','Saved while typing');await header(admin,'name').click();await cell(admin,1,'address').getByText('Saved',{exact:true}).waitFor();
  failSave=true;await cell(admin,1,'name').dblclick();editor=cell(admin,1,'name').locator('input');await editor.fill('FAIL DRAFT');await editor.press('Enter');await cell(admin,1,'name').getByText('Save failed',{exact:true}).waitFor();assert(await editor.inputValue()==='FAIL DRAFT','Failed draft lost');failSave=false;await editor.press('Escape');
  await emit({kind:'batch',tables:['warehouses']});await staff.waitForFunction(()=>document.querySelector('[data-database-cell$="|name"]')?.textContent.includes('Edited warehouse'));
  // Explicit column action; row checkboxes and partial deletion retain dialog/failed selection.
  await header(admin,'code').click({button:'right'});await admin.getByRole('menuitem',{name:'Select Column',exact:true}).click();assert(await cell(admin,1,'code').getAttribute('data-spreadsheet-selected')==='true','Explicit column selection failed');
  await active(admin).getByRole('button',{name:'Select row 1',exact:true}).click();await active(admin).getByRole('button',{name:'Italic selected cells',exact:true}).click();await admin.waitForTimeout(400);assert([...layouts.values()].filter(v=>v.table_key==='master:warehouses'&&v.design.cells?.[uuid(1)]?.italic===true).length===12,'Full-row format not persisted');await active(admin).getByRole('checkbox',{name:'Select row 2',exact:true}).check();assert(await active(admin).getByRole('checkbox',{checked:true}).count()>=2,'Multi-row checkboxes');
  await active(admin).getByRole('button',{name:'Delete selected database records'}).click();let dialog=admin.getByRole('dialog');await dialog.getByRole('button',{name:'Delete 2 records',exact:true}).click();await dialog.getByRole('alert').waitFor();assert(await dialog.isVisible(),'Partial failure closed confirmation');assert(await dialog.getByRole('button',{name:'Delete 1 record',exact:true}).count()===1,'Failed targets not retained');failDelete=false;await dialog.getByRole('button',{name:'Delete 1 record',exact:true}).click();await dialog.waitFor({state:'hidden'});
  // Width persistence, Auto Fit, scrolling and 30-row paging.
  await header(admin,'name').getByRole('separator').press('ArrowRight');await admin.waitForTimeout(1200);assert(writes.some(w=>w.col==='name'&&w.input.width_px),`Width not saved: ${JSON.stringify(requests.slice(-8))}; UI=${(await active(admin).innerText()).slice(0,180)}`);
  await active(admin).locator('.database-grid').evaluate(e=>e.scrollLeft=0);await admin.getByRole('button',{name:'Scroll database right'}).click();await admin.waitForTimeout(100);assert(await active(admin).locator('.database-grid').evaluate(e=>e.scrollLeft)>0,'Short scrollbar arrow failed');await admin.getByRole('button',{name:'Auto Fit',exact:true}).click();
  const geometry=await active(admin).locator('.database-grid').evaluate(e=>({horizontalBar:e.offsetHeight-e.clientHeight,verticalBar:e.offsetWidth-e.clientWidth}));assert(geometry.horizontalBar===0&&geometry.verticalBar>0,'Native scrollbar geometry incorrect');
  for(const label of ['Trucks','Trucking Companies','Stores','Store Contacts','Products']){await admin.getByRole('tab',{name:label,exact:true}).click();await active(admin).locator('tbody tr[data-virtual-index]').first().waitFor();}
  await active(admin).locator('.database-grid').evaluate(e=>e.scrollTop=e.scrollHeight);await admin.waitForFunction(()=>document.querySelector('.database-spreadsheet:not([hidden]) .sr-only')?.textContent.includes('60 of 65'));await active(admin).locator('.database-grid').evaluate(e=>e.scrollTop=e.scrollHeight);await admin.waitForFunction(()=>document.querySelector('.database-spreadsheet:not([hidden]) .sr-only')?.textContent.includes('65 of 65'));
  await admin.getByRole('textbox',{name:'Search database records'}).fill('Product 01');await admin.waitForFunction(()=>document.querySelector('.database-spreadsheet:not([hidden]) .sr-only')?.textContent.includes('1 of 1'));await admin.getByRole('textbox',{name:'Search database records'}).fill('');await admin.waitForFunction(()=>document.querySelector('.database-spreadsheet:not([hidden]) .sr-only')?.textContent.includes('30 of 65'));
  await header(admin,'name').click({button:'right'});await admin.getByRole('menuitem',{name:'Sort descending',exact:true}).click();await admin.waitForFunction(()=>document.querySelector('.database-spreadsheet:not([hidden]) [data-database-cell$="|name"]')?.textContent.includes('Product 65'));
  // Actual shared modal payloads for all six resource configurations.
  const forms=[['Warehouses','warehouse',{code:'NEW-WH',name:'New Warehouse'}],['Trucks','truck',{plate_number:'NEW-TRUCK'}],['Trucking Companies','trucking company',{name:'New Company'}],['Stores','store',{name:'New Store',code:'NEW-STORE'}],['Store Contacts','store contact',{name:'New Contact'}],['Products','product',{name:'New Product',sku:'NEW-SKU'}]];
  for(const [tab,name,values] of forms){await admin.getByRole('tab',{name:tab,exact:true}).click();await admin.getByRole('button',{name:`Add ${name}`,exact:true}).click();dialog=admin.getByRole('dialog');await dialog.getByRole('button',{name:'Create record',exact:true}).click();assert(await dialog.getByRole('alert').count()>0,`Missing validation ${tab}`);for(const [field,value] of Object.entries(values))await dialog.locator(`#database-field-${field}`).fill(value);
   if(tab==='Stores'||tab==='Store Contacts'){const input=dialog.getByRole('combobox',{name:tab==='Stores'?'Search customers':'Search stores',exact:true});await input.click();await admin.locator('[role=listbox] [role=option]').first().click();}
   await dialog.getByRole('button',{name:'Create record',exact:true}).click();await dialog.waitFor({state:'hidden'});
  }
  // Image preview/upload/replace/remove use exact owner IDs, in-memory storage only.
  await admin.getByRole('tab',{name:'Trucks',exact:true}).click();await active(admin).getByRole('button',{name:'Preview fixture.png',exact:true}).click();await admin.getByRole('dialog',{name:'Preview fixture.png',exact:true}).waitFor();await admin.getByRole('button',{name:'Close truck image preview'}).click();await active(admin).getByRole('button',{name:'Manage truck images'}).first().click();dialog=admin.getByRole('dialog',{name:'Truck images',exact:true});
  const file={name:'new.png',mimeType:'image/png',buffer:Buffer.from('fixture upload')};await dialog.locator('input[type=file][multiple]').setInputFiles(file);await dialog.getByText('1 image uploaded.',{exact:true}).waitFor();await admin.waitForFunction(()=>document.querySelector('[aria-labelledby=truck-images-title]')?.textContent.includes('2 images'));
  admin.once('dialog',d=>d.accept());await dialog.getByLabel('Replace fixture.png',{exact:true}).setInputFiles({...file,name:'replacement.png'});await dialog.getByText('Image replaced.',{exact:true}).waitFor();admin.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'Delete replacement.png',exact:true}).click();await dialog.getByText('Image deleted.',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Close truck images'}).click();
  await admin.setViewportSize({width:600,height:850});assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Responsive page overflow');await admin.setViewportSize({width:1440,height:950});
  assert(errors.length===0,errors.join('; '));await admin.screenshot({path:'.playwright-mcp/database-fixture-final.png'});
  return {isolated:true,liveWrites:0,sheets:6,headerAlignment:h,headerAliasAndFormatting:true,sharedDesignTwoSessions:true,enterAndBlur:true,noIdleSave:true,savedIndicatorExpires:true,failureDraftRetained:true,realtimeEventReconciliation:true,explicitColumnSelection:true,checkboxMultiSelection:true,partialDeletionRetry:true,autoFitAndWidth:true,shortScrollArrows:true,lazyLoading:65,addForms:6,truckImages:true,errors,apiRequests:requests.length,mutationRequests:writes.length};
 }catch(error){throw Error(`${error.message} | recent writes: ${JSON.stringify(writes.slice(-12))}`);}finally{await Promise.all(contexts.map(context=>context.close()));}
}
