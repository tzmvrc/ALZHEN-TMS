// Synthetic REST and isolated browser context; no production writes.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),errors=[];
 const trip='123e4567-e89b-42d3-a456-000000000001';let mode='protected',requests=0,releaseSuccess=()=>{};
 p.on('pageerror',error=>errors.push(error.message));
 try{
  await p.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url());if(req.method()!=='POST')throw Error('Unexpected request');
   if(url.pathname.endsWith('/impact'))return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{trips:[{id:trip,dispatch_number:'SYNTHETIC TRIP'}],counts:{trip_stops:3},blockers:[],can_delete:true}})});
   requests++;const body=req.postDataJSON();if(JSON.stringify(body)!==JSON.stringify({trip_ids:[trip]})||url.search)throw Error('Incorrect confirmation scope');
   if(mode==='network')return route.abort('failed');
   if(mode==='protected')return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({success:false,message:'Billing, payable or receivable records require accounting retention review.'})});
   await new Promise(resolve=>releaseSuccess=resolve);
   return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{deleted_trips:1,cleanup_pending:true}})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async trip=>{
   await import('/src/index.css');const main=await(await fetch('/src/main.tsx')).text(),React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {default:Dialog}=await import('/src/components/admin/WholeTripDeletionDialog.tsx'),{ToastProvider}=await import('/src/components/ui/Toast.tsx');
   const root=(DOM.createRoot??DOM.default.createRoot)(document.body.appendChild(document.createElement('div')));window.completed=0;
   function Harness(){const [token,setToken]=React.useState('fixture-admin');window.openDelete=setToken;return token?React.createElement(Dialog,{token,tripIds:[trip,trip],onClose:()=>setToken(null),onDeleted:()=>window.completed++}):null;}
   root.render(React.createElement(ToastProvider,null,React.createElement(Harness)));
  },trip);
  const confirm=()=>p.getByRole('button',{name:/^Delete (Entire Trip|Selected Trips)$/});
  const ready=()=>p.waitForFunction(()=>{const b=[...document.querySelectorAll('[role=alertdialog] button')].find(b=>b.textContent==='Delete Entire Trip');return b&&!b.disabled;});
  await ready();if(await p.locator('input[type=password],dl,details').count())throw Error('Password or technical panel returned');
  await confirm().click();await p.getByRole('alertdialog').getByRole('alert').waitFor();if(await p.evaluate(()=>window.completed))throw Error('Protected failure claimed success');
  if(!await p.getByRole('button',{name:'Cancel',exact:true}).isEnabled())throw Error('Failure did not restore interaction');
  await p.getByRole('button',{name:'Cancel',exact:true}).click();await p.evaluate(()=>window.openDelete('fixture-admin-2'));await ready();
  mode='network';await confirm().click();await p.getByRole('alertdialog').getByRole('alert').waitFor();if(await p.evaluate(()=>window.completed))throw Error('Network failure claimed success');
  mode='success';await confirm().dblclick();await p.waitForFunction(()=>document.querySelector('[role=alertdialog]')?.getAttribute('aria-busy')==='true');
  await p.keyboard.press('Tab');if(!await p.getByRole('alertdialog').evaluate(el=>el===document.activeElement))throw Error('Busy focus escaped');
  await p.keyboard.press('Escape');if(!await p.getByRole('alertdialog').count())throw Error('Busy confirmation dismissed');
  releaseSuccess();await p.waitForFunction(()=>window.completed===1);
  await p.getByText('Database deletion is confirmed; image cleanup is pending in the existing retry queue.',{exact:true}).waitFor();
  if(await p.getByText('Trip deleted successfully',{exact:true}).count())throw Error('Pending Storage cleanup falsely claimed complete success');
  if(requests!==3||errors.length)throw Error(JSON.stringify({requests,errors}));
  return {isolated:true,productionWrites:0,noPasswordReentry:true,protectedFailureRetainsDialog:true,networkFailureRetainsDialog:true,duplicateClickPrevented:true,busyFocusPreserved:true,cleanupPendingWarningAccurate:true,confirmedRequests:1,errors};
 }finally{releaseSuccess();await context.close();}
}
