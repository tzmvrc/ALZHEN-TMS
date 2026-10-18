// All APIs intercepted. Synthetic passwords only; no Auth or production writes.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),errors=[];
 const trip='123e4567-e89b-42d3-a456-000000000001';let mode='wrong',requests=0,releaseSuccess=()=>{};
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url());if(req.method()!=='POST')throw Error('Unexpected request');
   if(url.pathname.endsWith('/impact'))return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{trips:[{id:trip,dispatch_number:'SYNTHETIC TRIP'}],counts:{trip_stops:3,trip_line_items:4},blockers:[],can_delete:true}})});
   requests++;const body=req.postDataJSON();if(body.trip_ids.length!==1||body.trip_ids[0]!==trip||!body.current_password||url.search)throw Error('Incorrect confirmation payload');
   if(mode==='network')return route.abort('failed');
   if(mode==='wrong')return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({success:false,message:'The current account password could not be verified.'})});
   await new Promise(resolve=>releaseSuccess=resolve);return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{deleted_trips:1,cleanup_pending:false}})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async({trip})=>{
   await import('/src/index.css');const main=await(await fetch('/src/main.tsx')).text(),React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {default:Dialog}=await import('/src/components/admin/WholeTripDeletionDialog.tsx'),{ToastProvider}=await import('/src/components/ui/Toast.tsx');
   const el=document.createElement('div');document.body.append(el);const root=(DOM.createRoot??DOM.default.createRoot)(el);window.completed=0;
   function Harness(){const [token,setToken]=React.useState('test-admin');window.openDelete=value=>setToken(value);return token?React.createElement(Dialog,{token,tripIds:[trip,trip],selectedRowCount:3,onClose:()=>setToken(null),onDeleted:()=>window.completed++}):null;}
   root.render(React.createElement(ToastProvider,null,React.createElement(Harness)));
  },{trip});
  const confirm=()=>p.getByRole('button',{name:'Confirm Permanent Deletion',exact:true}),password=()=>p.getByLabel('Current account password',{exact:true});
  await p.getByText('3 selected rows on this page',{exact:true}).waitFor();if(!await confirm().isDisabled())throw Error('Blank password enabled');
  if(await password().getAttribute('type')!=='password')throw Error('Unmasked password');
  await password().focus();await p.keyboard.press('Shift+Tab');if(!await p.getByRole('button',{name:'Cancel',exact:true}).evaluate(el=>el===document.activeElement))throw Error('Reverse focus trap failed');
  await p.keyboard.press('Tab');if(!await password().evaluate(el=>el===document.activeElement))throw Error('Forward focus trap failed');
  await password().fill('synthetic-private-password');await confirm().click();await p.getByRole('alert').waitFor();
  if(await password().inputValue()||!await confirm().isDisabled()||await p.evaluate(()=>window.completed))throw Error('Failed authentication retained password or claimed success');
  await password().fill('synthetic-private-password');await p.evaluate(()=>window.openDelete('different-admin'));await p.getByText('SYNTHETIC TRIP',{exact:false}).waitFor();if(await password().inputValue())throw Error('Password crossed account scope');
  await password().fill('synthetic-private-password');await p.getByRole('button',{name:'Cancel',exact:true}).click();await p.evaluate(()=>window.openDelete('test-admin'));await p.getByRole('alertdialog').waitFor();if(await password().inputValue()||requests!==1)throw Error('Cancel retained password or submitted');
  mode='network';await password().fill('synthetic-private-password');await confirm().click();await p.getByRole('alert').waitFor();if(await password().inputValue()||await p.evaluate(()=>window.completed))throw Error('Network failure leaked state');
  mode='success';await password().fill('synthetic-private-password');await confirm().dblclick();await p.waitForFunction(()=>document.querySelector('[role=alertdialog]')?.getAttribute('aria-busy')==='true');await p.keyboard.press('Tab');if(!await p.getByRole('alertdialog').evaluate(el=>el===document.activeElement))throw Error('Busy focus escaped');await p.keyboard.press('Escape');if(!await p.getByRole('alertdialog').count())throw Error('Busy confirmation cancelled');releaseSuccess();await p.waitForFunction(()=>window.completed===1);await p.getByText('1 trip deleted',{exact:true}).waitFor();if(requests!==3||await p.evaluate(()=>window.completed)!==1)throw Error('Duplicate deletion or false success');
  const leaked=await p.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('synthetic-private-password'));if(leaked||errors.length)throw Error(JSON.stringify({leaked,errors}));
  return {mocked:true,passwordRequired:true,wrongPasswordCleared:true,accountChangeCleared:true,cancelCleared:true,networkFailureCleared:true,duplicateClickPrevented:true,successToast:true,keyboardFocusTrap:true,busyFocusPreserved:true,privateStorageWrites:0,productionWrites:0};
 }finally{releaseSuccess();await context.close();}
}
