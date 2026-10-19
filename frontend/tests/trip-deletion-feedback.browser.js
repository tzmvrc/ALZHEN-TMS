// Request-controlled responses, synthetic credentials; every API is intercepted.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),errors=[];
 const ids=Array.from({length:20},(_,i)=>`123e4567-e89b-42d3-a456-${String(i+1).padStart(12,'0')}`);
 let mode='wrong',requests=0,release=()=>{},batches=[];
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.route('**/api/**',async r=>{
   const q=r.request();if(q.method()!=='POST')throw Error('Unexpected API request');
   const body=q.postDataJSON();
   if(new URL(q.url()).pathname.endsWith('/impact'))return r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{trips:body.trip_ids.map(id=>({id,dispatch_number:'SYNTHETIC'})),counts:{trip_stops:30,trip_images:5},blockers:[],can_delete:true}})});
   requests++;batches.push(body.trip_ids);
   if(mode==='network')return r.abort('failed');
   if(mode==='wrong'||mode==='protected'||mode==='unexpected')return r.fulfill({status:mode==='wrong'?403:mode==='protected'?409:500,contentType:'application/json',body:JSON.stringify({success:false,message:mode==='wrong'?'The current account password could not be verified.':mode==='protected'?'Protected report conversion history prevents deletion.':'private SQL error must not be shown'})});
   const pending=mode==='pending';await new Promise(resolve=>{release=resolve;});
   await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{deleted_trips:body.trip_ids.length,cleanup_pending:pending}})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async({ids})=>{
   await import('/src/index.css');const main=await(await fetch('/src/main.tsx')).text(),React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{default:Dialog}=await import('/src/components/admin/WholeTripDeletionDialog.tsx'),{ToastProvider}=await import('/src/components/ui/Toast.tsx');
   const el=document.createElement('div');document.body.append(el);const root=(DOM.createRoot??DOM.default.createRoot)(el);window.completed=[];window.closed=0;
   function Harness({batch,throwAfterCommit}){const [open,setOpen]=React.useState(true);window.unmountDialog=()=>setOpen(false);return React.createElement(ToastProvider,null,open?React.createElement(Dialog,{token:'synthetic-admin',tripIds:batch,selectedRowCount:batch.length+1,onClose:()=>{window.closed++;setOpen(false);},onDeleted:tripIds=>{window.completed.push(tripIds);if(throwAfterCommit)throw Error('Synthetic UI reconciliation exception');}}):null);}
   window.openFeedback=(bulk=false,throwAfterCommit=false)=>root.render(React.createElement(Harness,{key:Math.random(),batch:bulk?[...ids,ids[0]]:[ids[0]],throwAfterCommit}));window.openFeedback();
  },{ids});
  const dialog=()=>p.getByRole('alertdialog'),password=()=>dialog().getByLabel('Current account password'),confirm=()=>dialog().getByRole('button',{name:/^Delete (Entire Trip|Selected Trips)$/});
  const submit=async()=>{await password().fill('synthetic-password');await confirm().click();};
  await submit();await dialog().getByRole('alert').filter({hasText:'Incorrect password. Please try again.'}).waitFor();
  if(!await password().isEnabled()||await password().inputValue()||!await dialog().getByRole('button',{name:'Cancel',exact:true}).isEnabled())throw Error('Error did not restore interactive state');
  if(await p.getByRole('alert').count()!==2)throw Error('Expected one inline error and one error toast');
  mode='success';await submit();await dialog().getByRole('button',{name:'Deleting...',exact:true}).waitFor();
  if(!await password().isDisabled()||!await dialog().getByRole('button',{name:'Cancel',exact:true}).isDisabled()||!await dialog().getByRole('button',{name:'Deleting...',exact:true}).isDisabled()||await dialog().locator('.animate-spin').count()!==1)throw Error('Busy controls/spinner incorrect');
  await dialog().getByRole('status').filter({hasText:'Please wait while the trip and its related records are being deleted.'}).waitFor();
  await p.keyboard.press('Escape');await p.mouse.click(2,2);await dialog().getByRole('button',{name:'Deleting...',exact:true}).evaluate(el=>{el.click();el.click();});
  if(await p.evaluate(()=>window.closed)||requests!==2)throw Error('Busy dismissal or repeated request');
  release();await dialog().waitFor({state:'hidden'});await p.getByText('Trip deleted successfully',{exact:true}).waitFor();await p.getByText('The trip and its related records have been deleted.',{exact:true}).waitFor();
  if(await p.getByRole('alert').count()||await p.getByText('Trip deleted successfully',{exact:true}).count()!==1)throw Error('Duplicate or contradictory toast');
  await p.getByRole('button',{name:'Dismiss notification',exact:true}).click();await p.getByText('Trip deleted successfully',{exact:true}).waitFor({state:'hidden'});
  // Twenty unique parents, twenty-one input rows; no row-count-based success.
  await p.evaluate(()=>window.openFeedback(true));await submit();await dialog().getByRole('button',{name:'Deleting selected trips...',exact:true}).waitFor();
  if(batches.at(-1).length!==20)throw Error('Parent deduplication lost');
  await p.clock.install();release();await p.getByText('Trips deleted successfully',{exact:true}).waitFor();await p.getByText('Successfully deleted 20 trips and their related records.',{exact:true}).waitFor();
  if(await p.getByText('Trips deleted successfully',{exact:true}).count()!==1)throw Error('Duplicate bulk success');
  await p.clock.runFor(4400);if(!await p.getByText('Trips deleted successfully',{exact:true}).isVisible())throw Error('Success dismissed too early');await p.clock.runFor(600);await p.getByText('Trips deleted successfully',{exact:true}).waitFor({state:'hidden'});
  for(const failure of ['protected','network','unexpected']){
   mode=failure;await p.evaluate(()=>window.openFeedback());await submit();await dialog().getByRole('alert').waitFor();const message=await dialog().getByRole('alert').innerText();
   if(failure==='protected'&&!message.includes('protected'))throw Error('Protection feedback lost');
   if(failure==='network'&&!message.includes('check your connection'))throw Error('Network feedback lost');
   if(failure==='unexpected'&&!message.includes('Something went wrong'))throw Error('Unexpected feedback lost');
   if(message.includes('SQL')||!await password().isEnabled())throw Error('Unsafe error feedback');
  }
  mode='pending';await p.evaluate(()=>window.openFeedback());await submit();release();await dialog().waitFor({state:'hidden'});await p.getByText('Database deletion is confirmed; image cleanup is pending in the existing retry queue.',{exact:true}).waitFor();if(await p.getByText('Trip deleted successfully',{exact:true}).count())throw Error('Pending cleanup claimed full completion');
  mode='success';await p.evaluate(()=>window.openFeedback());await submit();const completed=await p.evaluate(()=>window.completed.length);await p.evaluate(()=>window.unmountDialog());release();await p.waitForTimeout(150);if(await p.evaluate(()=>window.completed.length)!==completed||await p.getByText('Trip deleted successfully',{exact:true}).count())throw Error('Unmount caused stale success/callback');
  await p.evaluate(()=>window.openFeedback(false,true));await submit();release();await p.getByText('Trip deleted successfully',{exact:true}).waitFor();if(await p.getByRole('alert').count())throw Error('Post-commit UI callback error claimed deletion failed');
  if(errors.length)throw Error(errors.join(';'));
  return {isolated:true,productionWrites:0,loading:true,dismissalBlocked:true,duplicateSubmissionPrevented:true,errorRestoresControls:true,oneSuccessToast:true,bulkUniqueCount:20,successDuration4500ms:true,manualDismiss:true,cleanupPendingAccurate:true,unmountSafe:true,postCommitUiFailureNotMisreported:true};
 }finally{release();await context.close();}
}
