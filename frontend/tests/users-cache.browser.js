// Real Users view, isolated APIs, no production mutations.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),calls=[],errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"const auth={profile:{id:'fixture-admin',role:'ADMIN'},accessToken:'fixture-token'};export const useAuth=()=>auth;"}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};'}));
  await p.route('**/api/**',async r=>{
   const req=r.request(),url=new URL(req.url());if(req.method()!=='GET')throw Error('No production or fixture writes expected');calls.push(url.pathname+url.search);
   const user={id:'fixture-admin',first_name:'Fixture',last_name:'User',full_name:'Fixture User',role:'ADMIN'};
   let data=url.pathname==='/api/users'||url.pathname==='/api/lookups/profiles'?(url.searchParams.get('role')==='STAFF'?[]:[user]):[];
   if(url.pathname==='/api/truckers')data={rows:[],pagination:{page:1,limit:100,total:0,totalPages:1}};
   await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{
   await import('/src/index.css');const path='/src/pages/Admin/views/TruckersView.tsx',code=await(await fetch(path)).text(),main=await(await fetch('/src/main.tsx')).text(),React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{default:View}=await import(path);
   const el=document.createElement('div');el.id='users-cache-fixture';document.body.append(el);const root=(DOM.createRoot??DOM.default.createRoot)(el);let version=0;window.__users=()=>root.render(React.createElement(View,{key:++version}));window.__users();
  });
  const root=p.locator('#users-cache-fixture');await root.getByText('Fixture User',{exact:true}).first().waitFor();await p.waitForTimeout(300);const reads=calls.filter(c=>c.startsWith('/api/users')||c.startsWith('/api/lookups/profiles')).length;
  await root.getByRole('combobox',{name:'Search rows or columns'}).fill('Fixture');await root.getByRole('combobox',{name:'Search rows or columns'}).press('Enter');await p.waitForTimeout(50);await p.evaluate(()=>window.__users());
  await root.getByText('Fixture User',{exact:true}).first().waitFor();await p.waitForTimeout(200);if(await root.getByRole('combobox',{name:'Search rows or columns'}).inputValue()!=='Fixture')throw Error('Search preference lost on navigation');
  const extra=calls.filter(c=>c.startsWith('/api/users')||c.startsWith('/api/lookups/profiles')).length-reads;if(extra)throw Error('Cached Users navigation duplicated initial data reads');
  if(errors.length)throw Error(errors.join('; '));return {isolated:true,initialUserReads:reads,cachedNavigationAdditionalReads:extra,searchPreserved:true,productionWrites:0,errors};
 }finally{await context.close();}
}
