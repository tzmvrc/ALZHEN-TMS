// Actual receipt review component; isolated APIs and OCR, no production documents.
async (page) => {
 const context = await page.context().browser().newContext(), p = await context.newPage(), writes = [], errors = [];
 let failNext = false, interpretations = 0, failAI = false;
 let receipt = {id:'fixture-receipt',trip_id:'fixture-trip',trip_stop_id:'fixture-stop',dr_number:'DR-333',file_name:'fixture.png',signed_url:'https://receipt.test/fixture.png',uploaded_at:'2026-10-17T00:00:00Z',ocr_text:'DR Number: DR-333\nReceived by: Fixture Receiver',ocr_confidence:90,ocr_version:3,reviewed_at:null,reviewed_by:null};
 p.on('pageerror',e=>errors.push(e.message));
 try {
  await p.route('**/src/services/realtime.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const subscribeToAdminRealtime=()=>()=>{};'}));
  await p.route('**/src/services/ocr.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const recognizeReceipt=async()=>({text:"DR Number: DR-333\\nReceived by: Rescanned Receiver",confidence:94});'}));
  await p.route('https://receipt.test/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCzAAAAAASUVORK5CYII=','base64')}));
  await p.route('**/api/**',async r=>{
   const req=r.request();
   if(req.method()==='GET')return r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:[receipt]})});
   if(req.method()==='POST'&&req.url().endsWith('/interpret')){
    interpretations++;if(req.postDataJSON().external_processing_consent!==true)throw Error('No consent');
    if(failAI)return r.fulfill({status:502,contentType:'application/json',body:JSON.stringify({success:false,message:'Gemini is unavailable. Review manually.'})});
    const fields={dr_number:{value:'DR-333',evidence:'DR Number: DR-333',uncertain:false},receiver_name:{value:'Gemini Receiver',evidence:'Fixture evidence',uncertain:false},quantity:{value:0,evidence:'Quantity 0',uncertain:false}};
    return r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{receipt_id:receipt.id,ocr_version:receipt.ocr_version,model:'gemini-2.5-flash',persisted:false,approved:false,linked_stop_mismatch:false,interpretation:{fields,warnings:[],status:'NEEDS_REVIEW'},matching:{ambiguous:true,suggested:null}}})});
   }
   if(req.method()!=='PATCH'||!req.url().endsWith('/receipts/fixture-receipt/ocr'))throw Error('Unexpected mutation');
   const body=req.postDataJSON();writes.push(body);
   if(body.expected_version!==receipt.ocr_version)throw Error('Review sent stale or hardcoded version');
   if(failNext){failNext=false;return r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({success:false,message:'This receipt changed. Reload it before saving your edits.'})});}
   receipt={...receipt,...body,ocr_version:receipt.ocr_version+1,reviewed_at:body.reviewed?'2026-10-17T01:00:00Z':null,reviewed_by:body.reviewed?'fixture-admin':null};
   await r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:receipt})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  const mount=()=>p.evaluate(async()=>{
   await import('/src/index.css');const code=await(await fetch('/src/components/admin/ReceiptReviewCard.tsx')).text(),main=await(await fetch('/src/main.tsx')).text(),React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{default:View}=await import('/src/components/admin/ReceiptReviewCard.tsx');const el=document.createElement('div');document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(View,{tripId:'fixture-trip',accessToken:'fixture-token',stopLabels:{'fixture-stop':'Fixture destination'}}));
  });
  await mount();
  await p.getByLabel('Receiver / signature').fill('Reviewed Receiver');await p.getByRole('button',{name:'Confirm receipt',exact:true}).click();await p.getByText('Saved',{exact:true}).waitFor();
  await p.getByLabel('Receiver / signature').fill('Corrected Receiver');await p.getByRole('button',{name:'Save changes',exact:true}).click();await p.getByText('Saved',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Scan again',exact:true}).click();await p.getByLabel('Receiver / signature').fill('Rescanned and checked');await p.getByRole('button',{name:'Confirm receipt',exact:true}).click();await p.getByText('Saved',{exact:true}).waitFor();
  if(receipt.ocr_version!==7)throw Error('OCR/review version progression failed');
  await p.waitForTimeout(5100);await p.reload();await mount();await p.getByLabel('Receiver / signature').waitFor();if(await p.getByLabel('Receiver / signature').inputValue()!=='Rescanned and checked')throw Error('Saved review reverted');
  const writesBeforeAI=writes.length;
  p.once('dialog',dialog=>dialog.dismiss());await p.getByRole('button',{name:'Interpret with Gemini',exact:true}).click();if(interpretations)throw Error('Canceled consent sent a request');
  p.once('dialog',dialog=>dialog.accept());await p.getByRole('button',{name:'Interpret with Gemini',exact:true}).click();await p.getByRole('region',{name:'Gemini suggestions'}).waitFor();
  if(writes.length!==writesBeforeAI||await p.getByLabel('Receiver / signature').inputValue()!=='Rescanned and checked')throw Error('AI auto-saved or replaced draft');
  await p.getByRole('button',{name:'Use suggested fields',exact:true}).click();if(await p.getByLabel('Receiver / signature').inputValue()!=='Gemini Receiver')throw Error('Explicit suggestion application failed');
  await p.getByRole('button',{name:'Undo edits',exact:true}).click();failAI=true;
  p.once('dialog',dialog=>dialog.accept());await p.getByRole('button',{name:'Interpret with Gemini',exact:true}).click();await p.getByRole('alert').filter({hasText:'Manual review remains available'}).waitFor();
  if(writes.length!==writesBeforeAI||interpretations!==2)throw Error('Failed AI caused an OCR write');
  failNext=true;await p.getByLabel('Receiver / signature').fill('UNSAVED REVIEW DRAFT');await p.getByRole('button',{name:'Save changes',exact:true}).click();await p.getByRole('alert').filter({hasText:'This receipt changed'}).waitFor();
  if(await p.getByLabel('Receiver / signature').inputValue()!=='UNSAVED REVIEW DRAFT'||await p.getByText('Saved',{exact:true}).count())throw Error('Conflict discarded draft or falsely confirmed success');
  if(errors.length)throw Error(JSON.stringify(errors));
  return {isolated:true,expectedVersions:writes.map(w=>w.expected_version),repeatedReviews:true,rescan:true,reload:true,fiveSecondPersistence:true,conflictRetainsDraft:true,falseSaved:false,consentCancellation:true,explicitAIReview:true,aiFailureManualFallback:true,interpretationRequests:interpretations,productionWrites:0,errors};
 } finally {await context.close();}
}
