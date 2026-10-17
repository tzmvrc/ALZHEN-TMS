// Real decision control with isolated capability/RPC responses, no production writes.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),writes=[],errors=[];
 let enabled=true,fail=true,version=0,status='PENDING';
 const receipt={id:'00000000-0000-4000-8000-000000000200',trip_id:'00000000-0000-4000-8000-000000000010',trip_stop_id:'00000000-0000-4000-8000-000000000100',dr_number:'333',ocr_version:2,pod_review_version:0,pod_review_status:'PENDING'};
 p.on('pageerror',error=>errors.push(error.message));
 try{
  await p.route('**/api/**',async route=>{
   const req=route.request();
   if(req.method()==='GET'&&req.url().endsWith('/decisions'))return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:[{id:'fixture-audit',actor_snapshot:'Fixture Staff',decision:status,reason:null,reviewed_fields:{dr_number:'333'},created_at:'2026-10-17T02:00:00Z'}]})});
   if(req.method()==='GET')return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{enabled}})});
   if(!req.url().endsWith('/receipts/'+receipt.id+'/decision'))throw Error('Wrong physical target');
   const draft=req.postDataJSON();writes.push(draft);await new Promise(resolve=>setTimeout(resolve,180));
   if(fail){fail=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'Decision could not be confirmed. Retry.'})});}
   if(draft.expected_review_version!==version)throw Error('Wrong review version');
   version++;status=draft.decision;
   await route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{outcome:{status},receipt:{...receipt,pod_review_status:status,pod_review_version:version,pod_rejection_reason:draft.reason}}})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async receipt=>{
   await import('/src/index.css');const code=await(await fetch('/src/components/admin/PodDecisionControls.tsx')).text(),main=await(await fetch('/src/main.tsx')).text(),React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{default:Controls}=await import('/src/components/admin/PodDecisionControls.tsx');
   function Fixture(){const[row,setRow]=React.useState(receipt),[token,setToken]=React.useState('fixture-staff');window.changeAccount=()=>setToken('different-account');return React.createElement(Controls,{token,receipt:row,reviewedFields:{dr_number:'333',quantity:0},disabled:false,onSaved:setRow});}
   const el=document.createElement('div');document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(Fixture));
  },receipt);
  await p.getByRole('button',{name:'Approve POD',exact:true}).click();await p.getByRole('button',{name:'Cancel decision',exact:true}).click();if(writes.length)throw Error('Cancellation wrote data');
  await p.getByRole('button',{name:'Reject POD',exact:true}).click();if(!await p.getByRole('button',{name:'Confirm decision',exact:true}).isDisabled())throw Error('Missing reason accepted');
  await p.getByLabel('POD rejection reason').fill('Unclear original. Please resubmit.');
  await p.getByRole('button',{name:'Confirm decision',exact:true}).click();if(!await p.getByRole('button',{name:/Saving decision/}).isDisabled())throw Error('Duplicate submission enabled');
  await p.getByRole('alert').waitFor();if(await p.getByLabel('POD rejection reason').inputValue()!=='Unclear original. Please resubmit.')throw Error('Failed save lost reason');
  await p.getByRole('button',{name:'Confirm decision',exact:true}).click();await p.getByText('POD decision: REJECTED',{exact:true}).waitFor();
  if(writes[0].request_id!==writes[1].request_id)throw Error('Retry lost idempotency key');
  await p.getByRole('button',{name:'Approve POD',exact:true}).click();await p.getByRole('button',{name:'Confirm decision',exact:true}).click();await p.getByText('POD decision: APPROVED',{exact:true}).waitFor();
  if(await p.getByRole('button',{name:'Reject POD',exact:true}).count())throw Error('Approved document still actionable');
  await p.getByRole('button',{name:'View latest 50 decisions',exact:true}).click();await p.getByText(/Fixture Staff: APPROVED/).waitFor();
  enabled=false;await p.evaluate(()=>window.changeAccount());await p.getByRole('region',{name:'POD approval'}).waitFor({state:'hidden'});
  if(errors.length)throw Error(JSON.stringify(errors));
  return {isolated:true,cancelNoWrite:true,reasonRequired:true,retrySameRequestId:true,failedDraftRetained:true,duplicateSubmitDisabled:true,canonicalApproval:true,decisionHistory:true,accountIsolation:true,requests:writes.length,productionWrites:0,errors};
 }finally{await context.close();}
}
