// Real spreadsheet component, isolated browser context and mocked business APIs only.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1300, height: 900 } });
  const p = await context.newPage(), errors = [], mutations = [], searches = [];
  const trip = '123e4567-e89b-42d3-a456-426614174000', stop = '223e4567-e89b-42d3-a456-426614174000';
  const labels = ['SP','PH TRUCK NAME','DN','DR','Order Item No.','Customer Name','Ship To','SAP SO No.','SO NO.','Customer PO','PO NO.','Product Category','Province','City','Customer Model','Qty','stocks','Warehouse','CBM','Total CBM','SO Approval Date','Item Status'];
  const keys = ['sp_reference','ph_truck_reference','dn_reference','dr_number','order_item_number','customer_name','store_name','sap_so_number','so_number','customer_po_number','internal_po_number','source_product_category','source_province','source_city','customer_model','quantity','stock_quantity','source_warehouse','unit_cbm','cbm','so_approval_date','item_status'];
  const columns = [...keys.map((key,index)=>({key,title:labels[index],type:['quantity','stock_quantity','unit_cbm','cbm'].includes(key)?'number':'text',fieldCategory:'EXCEL'})),{key:'dispatch_number',title:'Dispatch Number',type:'text',fieldCategory:'ADMIN'},{key:'arrival_time',title:'Store Arrival',type:'date',fieldCategory:'DRIVER'}];
  let rows = [{trip_id:trip,trip_stop_id:stop,trip_line_item_id:'323e4567-e89b-42d3-a456-426614174000',dispatch_number:'FIXTURE-DISPATCH',customer_name:'Fixture Customer',store_name:'Fixture Destination',customer_model:'ORIGINAL',quantity:'17',dr_number:'DO-NOT-COPY'}];
  rows.push(...[1,2].map(index=>({...rows[0],trip_line_item_id:'323e4567-e89b-42d3-a456-42661417400'+index,customer_model:'NEEDLE '+index,source_warehouse:'NEEDLE shared'})));
  p.on('pageerror',error=>errors.push(error.message));
  let stage="mount";
  try {
    await p.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
    await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`const auth={profile:{id:'${trip}',role:'ADMIN'},accessToken:'isolated-row-test',refreshSession:async()=>{}};export const useAuth=()=>auth;export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/login';`}));
    await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};'}));
    await p.route('**/api/**',async r=>{
      const request=r.request(),url=new URL(request.url());let data=[];
      if(/\/reports\/(dispatch-monitoring|dispatch|trip-booking|store-calling)\/columns$/.test(url.pathname))data={columns};
      else if(/\/reports\/(dispatch-monitoring|dispatch|trip-booking|store-calling)$/.test(url.pathname)){const q=url.searchParams.get('search')??'';searches.push(q);const filtered=rows.filter(row=>Object.values(row).some(value=>String(value).toLowerCase().includes(q.toLowerCase())));data={rows:filtered,pagination:{page:1,limit:200,total:filtered.length,totalPages:1}};}
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

    const panel=p.locator('#trip-sheet-trips'),viewport=panel.locator('.spreadsheet-viewport');
    await panel.locator('tr.report-data-row[data-report-selection-key]').first().waitFor();
    if(await p.getByRole('button',{name:'+ Add Row',exact:true}).count()||await p.getByText('Use client column order',{exact:true}).count()||await p.getByRole('combobox',{name:'Add related trip record'}).count())throw Error('Removed controls remain');
    await p.getByRole('button',{name:'Add trip',exact:true}).waitFor();
    const startTop=await viewport.evaluate(n=>n.scrollTop);
    stage='admin';
    await panel.getByRole('button',{name:'Admin / staff assignments',exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('#trip-sheet-trips .spreadsheet-viewport').scrollLeft>1000);
    stage='driver';
    await panel.getByRole('button',{name:'Driver updates',exact:true}).click();
    await p.waitForFunction(()=>{const v=document.querySelector('#trip-sheet-trips .spreadsheet-viewport');return v.scrollLeft>v.scrollWidth-v.clientWidth-100;});
    stage='excel';
    await panel.getByRole('button',{name:'Excel / client data',exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('#trip-sheet-trips .spreadsheet-viewport').scrollLeft<5);
    const search=panel.getByRole('combobox',{name:'Search rows or columns'});
    stage='search';
    await search.fill('NEEDLE');
    await p.waitForFunction(()=>document.querySelectorAll('#trip-sheet-trips tr.report-data-row[data-report-selection-key]').length===2&&document.querySelectorAll('#trip-sheet-trips td[data-search-match=true]').length===4);
    await p.waitForFunction(()=>document.querySelector('#trip-sheet-trips .spreadsheet-viewport').scrollLeft>500);
    if(await viewport.evaluate(n=>n.scrollTop)!==startTop)throw Error('Horizontal navigation moved vertically');
    stage='clear';
    await panel.getByRole('button',{name:'Clear search',exact:true}).click();
    await p.waitForFunction(()=>document.querySelectorAll('#trip-sheet-trips tr.report-data-row[data-report-selection-key]').length===3&&!document.querySelector('#trip-sheet-trips td[data-search-match=true]'));
    stage='column';
    await search.fill('Customer Model');await p.getByRole('option',{name:'Customer Model',exact:true}).click();
    await p.waitForFunction(()=>document.querySelectorAll('#trip-sheet-trips tr.report-data-row[data-report-selection-key]').length===3);
    await panel.getByRole('button',{name:'Clear search',exact:true}).click();
    const bar=p.getByRole('region',{name:'Scroll sheet horizontally'});
    const ratio=await bar.evaluate(n=>n.parentElement.getBoundingClientRect().width/document.querySelector('[data-trips-workspace]').getBoundingClientRect().width);
    if(ratio<0.23||ratio>0.27)throw Error('Scrollbar width is not 1/4: '+ratio);
    stage='bar';
    await bar.evaluate(n=>{n.scrollLeft=n.scrollWidth-n.clientWidth;n.dispatchEvent(new Event('scroll'));});
    await p.waitForFunction(()=>{const v=document.querySelector('#trip-sheet-trips .spreadsheet-viewport');return v.scrollLeft>v.scrollWidth-v.clientWidth-40;});
    stage='reversebar';
    await viewport.evaluate(n=>{n.scrollLeft=0;});
    await p.waitForFunction(()=>document.querySelector('.sheet-horizontal-scrollbar').scrollLeft<2);
    await p.emulateMedia({colorScheme:'dark'});
    const colors=await panel.locator('th[data-field-category]').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.fieldCategory,getComputedStyle(n).backgroundColor])));
    if(colors.EXCEL!=='rgb(219, 234, 254)'||colors.ADMIN!=='rgb(243, 232, 255)'||colors.DRIVER!=='rgb(220, 252, 231)')throw Error('Light colors changed in dark mode '+JSON.stringify(colors));
    stage='switch sheet';
    await p.getByRole('tab',{name:'Dispatch Report',exact:true}).click();
    await p.locator('#trip-sheet-dispatch td[data-report-selection-key], #trip-sheet-dispatch tr[data-report-selection-key]').first().waitFor();
    await bar.evaluate(n=>{n.scrollLeft=n.scrollWidth-n.clientWidth;n.dispatchEvent(new Event('scroll'));});
    await p.waitForFunction(()=>document.querySelector('#trip-sheet-dispatch .spreadsheet-viewport').scrollLeft>500);
    await p.getByRole('tab',{name:'Master List',exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('#trip-sheet-trips').checkVisibility());
    stage='auto fit';
    const beforeFit=await panel.locator('th').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
    await p.getByRole('button',{name:'Auto fit',exact:true}).click();
    await p.waitForFunction(()=>{const table=document.querySelector('#trip-sheet-trips table');return [...table.querySelectorAll('th')].some(n=>n.getBoundingClientRect().width<90);});
    const afterFit=await panel.locator('th').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
    if(JSON.stringify(beforeFit)===JSON.stringify(afterFit))throw Error('Auto fit did not resize columns');
    if(await viewport.evaluate(n=>getComputedStyle(n).overflowX)!=='hidden')throw Error('Grid full-width bar remains enabled');
    if(searches.some(query=>query==='NEEDLE'))throw Error('Master search still relies on server search expressions');
    if(errors.length)throw Error(errors.join('; '));
    return {categoryNavigation:true,liveSearchFiltersRows:true,allFourRepeatedCellsHighlighted:true,columnFinderPreservesRows:true,autoFit:true,noFullWidthScrollbar:true,compactScrollbarRatio:ratio,bidirectionalScrollSync:true,scrollbarFollowsActiveSheet:true,lightColors:colors,searches,productionWrites:0};
  } catch(error){throw Error(stage+': '+error.message+' '+JSON.stringify(await p.evaluate(()=>({rows:document.querySelectorAll('tr.report-data-row[data-report-selection-key]').length,matches:document.querySelectorAll('td[data-search-match=true]').length,viewports:[...document.querySelectorAll('.spreadsheet-viewport')].map(n=>({width:n.clientWidth,total:n.scrollWidth,left:n.scrollLeft})),text:document.body.innerText.slice(-1400)}))));} finally { await context.close(); }
}
