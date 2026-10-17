// Actual management views and shared controls, isolated API/Auth fixtures only.
async (page) => {
  const context = await page.context().browser().newContext({viewport:{width:1280,height:900}}), p = await context.newPage();
  const widths = new Map(), writes = [], errors = [];
  p.on("pageerror", error => errors.push(error.message));
  const user = {id:"fixture-admin",full_name:"Fixture Admin",first_name:"Fixture",last_name:"Admin",role:"ADMIN",is_admin:true};
  const table = {id:"fixture-flex",name:"Fixture table",version:1,settings:{},updated_at:new Date().toISOString()};
  const columns = [{id:"dr",name:"DR Number",is_hidden:false},{id:"route",name:"Route",is_hidden:false},{id:"remarks",name:"Remarks",is_hidden:true}].map((c,i)=>({...c,table_id:table.id,position:i,value_type:"TEXT",input_mode:"TEXT",version:1}));
  try {
    await p.route("**/src/context/AuthContext.tsx*", r=>r.fulfill({contentType:"text/javascript",body:`export const useAuth=()=>({profile:${JSON.stringify(user)},accessToken:'fixture-token',loading:false});export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/login';`}));
    await p.route("**/src/lib/supabase.ts*",r=>r.fulfill({contentType:"text/javascript",body:"export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{},realtime:{setAuth:async()=>{}}};"}));
    await p.route("**/api/**",async r=>{
      const q=r.request(),url=new URL(q.url()); let data=[];
      if(url.pathname.includes('/table-layouts/')) {
        const parts=url.pathname.split('/'), key=decodeURIComponent(parts[3]);
        if(q.method()==='PATCH') {const input=q.postDataJSON(),col=decodeURIComponent(parts[4]);writes.push({key,col,...input});data={table_key:key,column_key:col,width_px:input.width_px,revision:input.expected_revision+1};widths.set(key+':'+col,data);}
        else data=[...widths.values()].filter(row=>row.table_key===key);
      } else if(q.method()!=='GET') throw new Error('Unexpected write '+url.pathname);
      else if(url.pathname==='/api/users'||url.pathname==='/api/lookups/profiles') data=[user];
      else if(url.pathname.startsWith('/api/master-data/')) data={rows:[{id:'fixture-record',code:'FIX',name:'Fixture Warehouse',plate_number:'FIX-001',status:'ACTIVE',notes:'Fixture notes'}],pagination:{page:1,total:1,totalPages:1}};
      else if(url.pathname==='/api/flexible-tables/fixture-flex') data={table,access:{canView:true,canEdit:true,canManage:true,isAdmin:true},columns,rows:[{id:'fixture-row',cells:columns.map(c=>({id:'cell-'+c.id,column_id:c.id,value:c.id==='dr'?'DR-1':c.id==='route'?'Warehouse to destination':'Draft remarks',version:1}))}],options:[]};
      else if(url.pathname==='/api/flexible-tables') data=[table];
      await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
    });
    async function mount(view) {
      await p.goto('http://localhost:5173/tests/table-fixture.html');
      await p.evaluate(async view=>{
        await import('/src/index.css');const path='/src/pages/Admin/views/'+view+'.tsx',code=await(await fetch(path)).text(),main=await(await fetch('/src/main.tsx')).text();
        const ReactModule=await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1]),React=ReactModule.default??ReactModule,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{default:View}=await import(path);
        const el=document.createElement('div');el.id='management-fixture';Object.assign(el.style,{position:'fixed',inset:'0',zIndex:'9999',background:'white',overflow:'auto',padding:'20px'});document.body.append(el);
        (DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(View,view==='FlexibleTablesView'?{accessToken:'fixture-token',role:'ADMIN',embeddedTableId:'fixture-flex'}:{}));
      },view);
    }
    const root=()=>p.locator('#management-fixture');
    await mount('TruckersView'); await root().getByRole('separator',{name:'Resize Email',exact:true}).waitFor();
    await root().getByRole('separator',{name:'Resize Email',exact:true}).press('ArrowRight');
    await p.waitForTimeout(250);if(!writes.some(w=>w.key==='users:staff'&&w.col==='email'&&w.width_px===210)) throw new Error('Users width not saved');
    await root().getByRole('button',{name:'Hide Email column',exact:true}).click();
    if(await root().getByRole('columnheader',{name:/Email/}).isVisible()) throw new Error('Email not hidden');
    await root().getByRole('combobox',{name:'Search rows or columns'}).fill('Email');await root().getByRole('option',{name:'Email (reveal hidden column)',exact:true}).click();
    await root().getByRole('columnheader',{name:/Email/}).waitFor();
    const highlight=await root().locator('tbody tr:first-child td:nth-child(2)').evaluate(e=>getComputedStyle(e).boxShadow);if(highlight==='none') throw new Error('Wrong finder index for Users');
    await mount('TruckersView');await root().getByRole('separator',{name:'Resize Email',exact:true}).waitFor();await p.waitForTimeout(250);
    if(await root().getByRole('separator',{name:'Resize Email',exact:true}).getAttribute('aria-valuenow')!=='210') throw new Error('Width not restored on navigation');
    await mount('MasterDataView');await root().getByRole('separator',{name:'Resize Address',exact:true}).waitFor();
    await root().getByRole('separator',{name:'Resize Address',exact:true}).scrollIntoViewIfNeeded();const box=await root().getByRole('separator',{name:'Resize Address',exact:true}).boundingBox(),before=writes.length;
    await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width/2+60,box.y+box.height/2,{steps:8});
    if(writes.length!==before) throw new Error('Width persisted during drag');await p.mouse.up();await p.waitForTimeout(250);
    if(!writes.some(w=>w.key==='master:warehouses'&&w.col==='address'&&w.width_px===380)) throw new Error('Master drag did not save');
    await mount('FlexibleTablesView');await root().getByRole('separator',{name:'Resize Route',exact:true}).waitFor();
    await root().getByRole('combobox',{name:'Find a column'}).fill('Remarks');await root().getByRole('combobox',{name:'Find a column'}).press('Enter');
    await root().getByRole('separator',{name:'Resize Remarks',exact:true}).waitFor();
    const flexHighlight=await root().locator('tbody tr:first-child td:last-child').evaluate(e=>getComputedStyle(e).boxShadow);
    const realHighlight=await root().locator('tbody tr:first-child td').nth(2).evaluate(e=>getComputedStyle(e).boxShadow);
    if(realHighlight==='none') throw new Error('Hidden flex column not highlighted after reveal');
    await root().getByRole('separator',{name:'Resize Route',exact:true}).press('ArrowRight');await p.waitForTimeout(250);
    if(!writes.some(w=>w.key==='flex:fixture-flex'&&w.col==='route'&&w.width_px===230)) throw new Error('Flexible width did not save');
    if(errors.length)throw new Error(errors.join('\n'));
    return {mocked:true,productionWrites:0,usersFinder:true,widthRestored:true,masterDragCommitsOnce:true,flexHiddenReveal:true,widthWrites:writes.length,errors,flexHighlight};
  } finally {await context.close();}
}
