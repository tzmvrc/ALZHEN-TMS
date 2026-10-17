// Actual management views and shared controls, isolated API/Auth fixtures only.
async (page) => {
  const context = await page.context().browser().newContext({viewport:{width:1280,height:900}}), p = await context.newPage();
  const widths = new Map(), writes = [], errors = [];let canManage=true;let stage="pin";p.setDefaultTimeout(7000);
  p.on("pageerror", error => errors.push(error.message));
  const user = {id:"fixture-admin",full_name:"Fixture Admin",first_name:"Fixture",last_name:"Admin",role:"ADMIN",is_admin:true};
  const table = {id:"fixture-flex",name:"Fixture table",version:1,settings:{},updated_at:new Date().toISOString()};
  const columns = [{id:"dr",name:"DR Number",is_hidden:false},{id:"route",name:"Route",is_hidden:false},{id:"remarks",name:"Remarks",is_hidden:true}].map((c,i)=>({...c,table_id:table.id,position:i,settings:{retained:true},value_type:"TEXT",input_mode:"TEXT",version:1}));
  try {
    await p.route("**/src/context/AuthContext.tsx*", r=>r.fulfill({contentType:"text/javascript",body:`export const useAuth=()=>({profile:${JSON.stringify(user)},accessToken:'fixture-token',loading:false});export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/login';`}));
    await p.route("**/src/lib/supabase.ts*",r=>r.fulfill({contentType:"text/javascript",body:"export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{},realtime:{setAuth:async()=>{}}};"}));
    await p.route("**/api/**",async r=>{
      const q=r.request(),url=new URL(q.url()); let data=[];
      if(url.pathname.includes('/table-layouts/')) {
        const parts=url.pathname.split('/'), key=decodeURIComponent(parts[3]);
        if(q.method()==='PATCH') {const input=q.postDataJSON(),col=decodeURIComponent(parts[4]);writes.push({key,col,...input});data={table_key:key,column_key:col,width_px:input.width_px,revision:input.expected_revision+1};widths.set(key+':'+col,data);}
        else data=[...widths.values()].filter(row=>row.table_key===key);
      } else if(q.method()==='PATCH'&&url.pathname.includes('/fixture-flex/columns/')){const input=q.postDataJSON(),column=columns.find(c=>c.id===url.pathname.split('/').pop());if(input.expected_version!==column.version)throw Error('Wrong native column revision');writes.push({nativeAppearance:true,...input});Object.assign(column,{settings:input.settings,version:column.version+1});data={...column};
      } else if(q.method()!=='GET') throw new Error('Unexpected write '+url.pathname);
      else if(url.pathname==='/api/users'||url.pathname==='/api/lookups/profiles') data=[user];
      else if(url.pathname.startsWith('/api/master-data/')) data={rows:[{id:'fixture-record',code:'FIX',name:'Fixture Warehouse',plate_number:'FIX-001',status:'ACTIVE',notes:'Fixture notes'}],pagination:{page:1,total:1,totalPages:1}};
      else if(url.pathname==='/api/flexible-tables/fixture-flex') data={table,access:{canView:true,canEdit:true,canManage,isAdmin:true},columns,rows:[{id:'fixture-row',cells:columns.map(c=>({id:'cell-'+c.id,column_id:c.id,value:c.id==='dr'?'DR-1':c.id==='route'?'Warehouse to destination':'Draft remarks',version:1}))}],options:[]};
      else if(url.pathname==='/api/flexible-tables') data=[table];
      await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
    });
    async function mount(view) {
      await p.goto('http://localhost:5173/tests/table-fixture.html');
      await p.evaluate(async view=>{
        await import('/src/index.css');const path='/src/pages/Admin/views/'+view+'.tsx',code=await(await fetch(path)).text(),main=await(await fetch('/src/main.tsx')).text();
        const ReactModule=await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1]),React=ReactModule.default??ReactModule,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{default:View}=await import(path);
        const el=document.createElement('div');el.id='management-fixture';Object.assign(el.style,{position:'fixed',inset:'0',zIndex:'1000',background:'white',overflow:'auto',padding:'20px'});document.body.append(el);
        (DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(View,view==='FlexibleTablesView'?{accessToken:'fixture-token',role:'ADMIN',embeddedTableId:'fixture-flex'}:{}));
      },view);
    }
    const root=()=>p.locator('#management-fixture');
    await mount('FlexibleTablesView');await root().getByRole('separator',{name:'Resize Route',exact:true}).waitFor();
    await root().getByRole('combobox',{name:'Pin Route column',exact:true}).selectOption('left');
    await p.waitForFunction(()=>{const td=document.querySelector('#management-fixture tbody tr td:nth-child(3)');return td&&getComputedStyle(td).position==='sticky'&&getComputedStyle(td).left==='44px';});
    stage='color';await root().getByRole('button',{name:'Color Route column',exact:true}).click();await p.getByRole('button',{name:'Set column color #bfdbfe',exact:true}).click();await p.getByRole('button',{name:'Done',exact:true}).click();
    await p.waitForFunction(()=>getComputedStyle(document.querySelector('#management-fixture tbody tr td:nth-child(3)')).backgroundColor==='rgb(191, 219, 254)');
    stage='persist';if(!columns.find(c=>c.id==='route').settings.retained)throw Error('Existing settings lost');
    await mount('FlexibleTablesView');await root().getByRole('separator',{name:'Resize Route',exact:true}).waitFor();await p.waitForFunction(()=>getComputedStyle(document.querySelector('#management-fixture tbody tr td:nth-child(3)')).position==='sticky');
    canManage=false;await mount('FlexibleTablesView');await root().getByRole('separator',{name:'Resize Route',exact:true}).waitFor();
    if(await root().getByRole('button',{name:'Color Route column',exact:true}).count()||await root().getByRole('combobox',{name:'Pin Route column',exact:true}).count())throw Error('Manage-only appearance controls exposed');
    if(errors.length)throw Error(errors.join('; '));return {isolated:true,nativeColumnVersion:true,settingsPreserved:true,leftPinOffset:true,color:true,navigationPersistence:true,manageAuthorization:true,appearanceWrites:writes.filter(w=>w.nativeAppearance).length,productionWrites:0,errors};
  }catch(error){throw Error(stage+': '+String(error)+' writes='+JSON.stringify(writes)+' cells='+JSON.stringify(await p.locator('#management-fixture tbody td').evaluateAll(cells=>cells.map(e=>({text:e.innerText,position:getComputedStyle(e).position,left:getComputedStyle(e).left,color:getComputedStyle(e).backgroundColor})))));}finally{await context.close();}
}
