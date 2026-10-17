// Actual App routes and dashboard navigation; isolated auth, data, and content views.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),errors=[];
 const trip='123e4567-e89b-42d3-a456-000000000010',stop='123e4567-e89b-42d3-a456-000000000012';p.on('pageerror',e=>errors.push(e.message));
 try{
  const appSource=await(await p.request.get('http://localhost:5173/src/App.tsx')).text(),reactPath=appSource.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1];
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"const auth={profile:{id:'fixture-admin',role:'ADMIN',is_admin:true},user:{id:'fixture-admin'},accessToken:'fixture-token',loading:false,logout:async()=>{},refreshSession:async()=>{}};export const useAuth=()=>auth;export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>'/';"}));
  await p.route('**/src/pages/Admin/views/OverviewView.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"import React from 'react';export default function View(){return React.createElement('div',null,'Overview fixture')}".replace("'react'",JSON.stringify(reactPath))}));
  await p.route('**/src/pages/Admin/views/ResourceView.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`import React from 'react';export default function View({id,onNavigate}){return React.createElement('section',{'data-resource':id},id,React.createElement('button',{onClick:()=>onNavigate('trip-detail:${trip}:dispatches:stop:${stop}')},'Open fixture trip'));}`.replace("'react'",JSON.stringify(reactPath))}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};'}));
  await p.route('**/api/**',async r=>{if(r.request().method()!=='GET')throw Error('Unexpected mutation');await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:[]})});});
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{history.replaceState({},'','/');await import('/src/index.css');const code=await(await fetch('/src/App.tsx')).text(),main=await(await fetch('/src/main.tsx')).text(),React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{BrowserRouter}=await import(main.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]),{default:App}=await import('/src/App.tsx');(DOM.createRoot??DOM.default.createRoot)(document.getElementById('root')??document.body.appendChild(document.createElement('div'))).render(React.createElement(BrowserRouter,null,React.createElement(App)));});
  await p.getByRole('button',{name:'Trips',exact:true}).click();await p.getByRole('button',{name:'Open fixture trip',exact:true}).click();await p.locator(`[data-resource="trip-detail:${trip}:dispatches:stop:${stop}"]`).waitFor();if(new URL(p.url()).pathname!==`/trips/${trip}`)throw Error('Trip URL missing');
  await p.goBack();await p.locator('[data-resource="dispatches"]').waitFor();if(new URL(p.url()).pathname!=='/')throw Error('Back did not restore Trips');
  await p.goForward();await p.locator(`[data-resource="trip-detail:${trip}:dispatches:stop:${stop}"]`).waitFor();await p.reload();await p.locator(`[data-resource="trip-detail:${trip}:dispatches:stop:${stop}"]`).waitFor();
  if(errors.length)throw Error(errors.join('; '));return {isolated:true,actualAppAndRouter:true,physicalTripUrl:true,stopContext:true,backForward:true,directRefresh:true,productionWrites:0,errors};
 }finally{await context.close();}
}
