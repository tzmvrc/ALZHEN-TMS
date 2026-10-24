async(page,mode)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),errors=[];let reads=0,formulaReads=0,mutations=0;
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:'const auth={profile:{id:"fixture",role:"ADMIN"},accessToken:"fixture-token",refreshSession:async()=>{}};export const useAuth=()=>auth;'}));
  await p.route('**/src/lib/supabase.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const supabase={channel(){return {on(){return this},subscribe(){return this}}},removeChannel:async()=>{}};'}));
  await p.route('**/api/**',async r=>{
   const req=r.request(),url=new URL(req.url());
   if(req.method()!=='GET'){
    if(req.method()!=='POST'||url.pathname!=='/api/reports/formulas/read')mutations++;
    formulaReads++;
    if(mode==='formulas'&&formulaReads===1){await r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'Formula storage is unavailable.'})});return;}
    await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{formulas:[],sources:[]}})});return;
   }
   let data=[];
   if(url.pathname.endsWith('/dispatch-monitoring/columns'))data={columns:[{key:'dispatch_number',title:'Dispatch Number',type:'text'}]};
   else if(url.pathname.endsWith('/dispatch-monitoring')){
    reads++;
    if(mode!=='formulas'&&reads===1){await r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'The report query took too long. Your records are unchanged. Retry loading in a moment.',error:{code:'REPORT_READ_TIMEOUT'}})});return;}
    data={rows:[{trip_id:'123e4567-e89b-42d3-a456-000000000010',dispatch_number:'RECOVERED-REPORT'}],pagination:{page:1,limit:200,total:1,totalPages:1}};
   }
   await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{
   await import('/src/index.css');
   const code=await(await fetch('/src/components/admin/ReportDataView.tsx')).text(),main=await(await fetch('/src/main.tsx')).text(),React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{MemoryRouter}=await import(code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1]),{default:View}=await import('/src/components/admin/ReportDataView.tsx');
   const el=document.createElement('div');document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(React.StrictMode,null,React.createElement(MemoryRouter,null,React.createElement(View,{initialReport:'dispatch-monitoring',showReportPicker:false}))));
  });
  if(mode==='formulas'){
   const retry=p.getByRole('button',{name:'Refresh formulas',exact:true});await retry.waitFor();
   if(formulaReads!==1)throw Error('Duplicate formula requests: '+formulaReads);
   const feedback=await p.evaluate(async()=>{const {spreadsheetFeedbackMessage}=await import('/src/components/admin/SpreadsheetPresentation.tsx');return spreadsheetFeedbackMessage('Unable to load calculated cells. Formula editing is unavailable until refreshed.','error');});
   if(!feedback.includes('Use Refresh formulas to retry.'))throw Error('Formula feedback is generic: '+feedback);
   await retry.click();await retry.waitFor({state:'hidden'});
   await p.getByText('RECOVERED-REPORT',{exact:true}).first().waitFor();
   if(reads!==1||formulaReads!==2||mutations||errors.length)throw Error(JSON.stringify({reads,formulaReads,mutations,errors}));
   return {isolated:true,strictMode:true,formulaFailureDoesNotHideRows:true,formulaFeedback:true,manualFormulaRetry:true,reportReads:reads,formulaReads,productionWrites:0};
  }
  await p.getByRole('alert').filter({hasText:'The report query took too long.'}).waitFor({timeout:15000}).catch(async()=>{throw Error(JSON.stringify({reads,errors,text:(await p.locator('body').innerText()).slice(0,2500)}));});
  if(reads!==1)throw Error('Duplicate initial report requests: '+reads);
  await p.getByRole('button',{name:'Retry loading',exact:true}).click();
  await p.getByText('RECOVERED-REPORT',{exact:true}).first().waitFor();
  if(reads!==2||mutations||errors.length)throw Error(JSON.stringify({reads,mutations,errors}));
  return {isolated:true,strictMode:true,timeoutMessage:true,manualRetry:true,reportReads:reads,productionWrites:0};
 }finally{await context.close();}
}
