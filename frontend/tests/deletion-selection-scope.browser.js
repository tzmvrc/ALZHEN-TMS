// Isolated session-bound selection hook and confirmation; every API intercepted.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage();let writes=0;
 try{
  await p.route('**/api/**',route=>{if(!route.request().url().endsWith('/impact')){writes++;throw Error('Unexpected mutation');}return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{trips:[{id:'test-trip',dispatch_number:'TEST'}],counts:{trip_stops:2},blockers:[],can_delete:true}})});});
  await p.goto('http://localhost:5173/tests/table-fixture.html');await p.evaluate(async()=>{
   const main=await(await fetch('/src/main.tsx')).text(),React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {useWholeTripSelection}=await import('/src/hooks/useWholeTripSelection.ts'),{default:Dialog}=await import('/src/components/admin/WholeTripDeletionDialog.tsx');
   const el=document.createElement('div');document.body.append(el);const root=(DOM.createRoot??DOM.default.createRoot)(el);
   function Harness(){const [scope,setScope]=React.useState('admin-A:bearer-A'),selection=useWholeTripSelection(scope);window.changeScope=setScope;return React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>selection.setTripIds(['test-trip'])},'Open fixture delete'),selection.tripIds?React.createElement(Dialog,{token:scope,tripIds:selection.tripIds,onClose:()=>selection.setTripIds(null),onDeleted:()=>{throw Error('No mutation allowed');}}):null);}
   root.render(React.createElement(Harness));
  });
  await p.getByRole('button',{name:'Open fixture delete'}).click();await p.getByLabel('Current account password').fill('synthetic-only');
  await p.evaluate(()=>window.changeScope('admin-B:bearer-B'));await p.getByRole('alertdialog').waitFor({state:'hidden'});
  await p.evaluate(()=>window.changeScope('admin-A:bearer-A'));if(await p.getByRole('alertdialog').count())throw Error('Old confirmation selection revived');
  await p.getByRole('button',{name:'Open fixture delete'}).click();if(await p.getByLabel('Current account password').inputValue())throw Error('Old password revived');
  await p.evaluate(()=>window.changeScope('staff-A:bearer-A'));await p.getByRole('alertdialog').waitFor({state:'hidden'});
  if(writes)throw Error('Mutation issued');return{mocked:true,accountSwitchClearsSelection:true,oldAccountCannotReviveSelection:true,roleChangeClears:true,passwordCleared:true,productionWrites:0};
 }finally{await context.close();}
}
