// Real spreadsheet component, isolated browser context and mocked business APIs only.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1300, height: 900 } });
  const p = await context.newPage(), errors = [], mutations = [], searches = [];
  const trip = '123e4567-e89b-42d3-a456-426614174000', stop = '223e4567-e89b-42d3-a456-426614174000';
  const labels = ['SP','PH TRUCK NAME','DN','DR','Order Item No.','Customer Name','Ship To','SAP SO No.','SO NO.','Customer PO','PO NO.','Product Category','Province','City','Customer Model','Qty','stocks','Warehouse','CBM','Total CBM','SO Approval Date','Item Status'];
  const keys = ['sp_reference','ph_truck_reference','dn_reference','dr_number','order_item_number','customer_name','store_name','sap_so_number','so_number','customer_po_number','internal_po_number','source_product_category','source_province','source_city','customer_model','quantity','stock_quantity','source_warehouse','unit_cbm','cbm','so_approval_date','item_status'];
  const columns = [...keys.map((key,index)=>({key,title:labels[index],type:['quantity','stock_quantity','unit_cbm','cbm'].includes(key)?'number':'text',fieldCategory:'EXCEL'})),{key:'dispatch_number',title:'Dispatch Number',type:'text',fieldCategory:'ADMIN'},{key:'arrival_time',title:'Store Arrival',type:'date',fieldCategory:'DRIVER'}];
  let rows = [{trip_id:trip,trip_stop_id:stop,trip_line_item_id:'323e4567-e89b-42d3-a456-426614174000',dispatch_number:'FIXTURE-DISPATCH',customer_name:'Fixture Customer',store_name:'Fixture Destination',customer_model:'ORIGINAL',quantity:'17',dr_number:'DO-NOT-COPY'}];
  rows=Array.from({length:405},(_,index)=>({...rows[0],trip_line_item_id:'323e4567-e89b-42d3-a456-'+String(index).padStart(12,'0'),customer_model:index===404?'*MODEL, ("last")%':index===199?'LONG '.repeat(50):'PRODUCT '+index}));
  p.on('pageerror',error=>errors.push(error.message));
  let stage="mount";
  try {
    await p.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
    await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`const auth={profile:{id:'${trip}',role:'ADMIN'},accessToken:'isolated-row-test',refreshSession:async()=>{}};export const useAuth=()=>auth;export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/login';`}));
    await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};'}));
    await p.route('**/api/**',async r=>{
      const request=r.request(),url=new URL(request.url());let data=[];
      if(/\/reports\/(dispatch-monitoring|dispatch|trip-booking|store-calling)\/columns$/.test(url.pathname))data={columns};
      else if(/\/reports\/(dispatch-monitoring|dispatch|trip-booking|store-calling)$/.test(url.pathname)){const q=url.searchParams.get('search')??'';if(q)return r.fulfill({status:500,json:{success:false,message:'Database search expression failed'}});const page=Number(url.searchParams.get('page')??1),limit=Number(url.searchParams.get('limit')??200);searches.push({page,q});data={rows:rows.slice((page-1)*limit,page*limit),pagination:{page,limit,total:rows.length,totalPages:Math.ceil(rows.length/limit)}};}
      else if(url.pathname.endsWith('/formulas/read'))data={formulas:[],sources:[]};
      else if(url.pathname.endsWith('/line-items/batch')){
        const payload=request.postDataJSON();mutations.push(payload);
        const saved=payload.rows.map(row=>({id:row.id,trip_id:trip,trip_stop_id:stop,...row.values}));
        rows=[...rows,...saved.map(row=>({...row,trip_line_item_id:row.id}))];data=saved;
      }else if(request.method()!=='GET')throw Error('Unexpected business mutation: '+url.pathname);
      await r.fulfill({status:200,json:{success:true,data}});
    });
    await p.goto('http://localhost:5173/tests/table-fixture.html');
    await p.evaluate(async()=>{
      await import('/src/index.css');const code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
      const react=await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1]),React=react.default??react,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]);
      const {default:View}=await import('/src/components/admin/ReportsWorkspace.tsx');const root=document.createElement('div');Object.assign(root.style,{height:'100vh'});document.body.append(root);(DOM.createRoot??DOM.default.createRoot)(root).render(React.createElement(MemoryRouter,null,React.createElement(View,{initialReport:'combined',toolbarActions:React.createElement('button',null,'Add trip')})));
    });

    const panel=p.locator('#trip-sheet-trips'),search=panel.getByRole('combobox',{name:'Search rows or columns'});
    await panel.locator('tr[data-report-selection-key]').first().waitFor();
    stage='literal search beyond first page';
    await search.fill('*MODEL, ("last")%');
    await p.waitForFunction(()=>document.querySelectorAll('#trip-sheet-trips tr[data-report-selection-key]').length===1&&document.querySelector('#trip-sheet-trips td[data-search-match=true]')?.textContent.includes('*MODEL'));
    if(!searches.some(request=>request.page===3))throw Error('Search ignored later pages');
    if(await panel.getByRole('alert').count())throw Error('Search produced loading error');
    await panel.getByRole('button',{name:'Clear search',exact:true}).click();
    await p.waitForFunction(()=>document.querySelectorAll('#trip-sheet-trips tr[data-report-selection-key]').length>1&&!document.querySelector('#trip-sheet-trips td[data-search-match=true]'));
    stage='auto fit includes virtualized records';
    await p.getByRole('button',{name:'Auto fit',exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('#trip-sheet-trips th:nth-child(16)').getBoundingClientRect().width>=599);
    if(errors.length)throw Error(errors.join('; '));
    return {literalPunctuationSearch:true,matchOnPageThree:true,serverSearchFailureAvoided:true,clearingRestoresRows:true,autoFitIncludesOffscreenRows:true,productionWrites:0};
  } catch(error){throw Error(stage+': '+error.message+' '+JSON.stringify({searches,errors}));} finally { await context.close(); }
}
