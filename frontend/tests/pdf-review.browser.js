async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),errors=[];let pagesRead=0,writes=0;
 let receipt={id:'fixture-pdf',trip_id:'fixture-trip',trip_stop_id:'fixture-stop',dr_number:'333',file_name:'synthetic.pdf',mime_type:'application/pdf',signed_url:'https://receipt.test/original.pdf',ocr_text:'DR Number: 333',ocr_version:3,ocr_confidence:80,reviewed_at:null};
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCzAAAAAASUVORK5CYII=';
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.route('**/src/services/realtime.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const subscribeToAdminRealtime=()=>()=>{};'}));
  await p.route('**/*tesseract*',r=>r.fulfill({contentType:'text/javascript',body:'export const createWorker=async()=>{window.ocrWorkers=(window.ocrWorkers||0)+1;return {recognize:async()=>{window.ocrPages=(window.ocrPages||0)+1;return {data:{text:"DR Number: 333\\nReceived by: Synthetic PDF",confidence:90}};},terminate:async()=>{window.ocrTerminated=true;}}};export default {createWorker};'}));
  await p.route('https://receipt.test/**',r=>r.fulfill({contentType:'application/pdf',body:Buffer.from('%PDF-1.7\n%%EOF')}));
  await p.route('**/api/**',r=>{
   const req=r.request();let data;
   if(req.method()==='GET'){
    if(req.url().endsWith('/pages')){pagesRead++;data={pages:[{mime_type:'image/png',data:png},{mime_type:'image/png',data:png}]};}
    else data=req.url().endsWith('capabilities')?{enabled:false}:[receipt];
   }else{
    if(req.method()!=='PATCH'||!req.url().endsWith('/receipts/fixture-pdf/ocr'))throw Error('Unexpected mutation');
    const body=req.postDataJSON();if(body.expected_version!==receipt.ocr_version)throw Error('Stale PDF OCR save');writes++;
    receipt={...receipt,ocr_text:body.ocr_text,ocr_version:receipt.ocr_version+1,reviewed_at:body.reviewed?'2026-10-17T01:00:00Z':null};data=receipt;
   }
   return r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{
   await import('/src/index.css');const code=await(await fetch('/src/components/admin/ReceiptReviewCard.tsx')).text(),main=await(await fetch('/src/main.tsx')).text(),React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{default:View}=await import('/src/components/admin/ReceiptReviewCard.tsx');const el=document.createElement('div');document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(View,{tripId:'fixture-trip',accessToken:'fixture-token',stopLabels:{'fixture-stop':'Synthetic destination'}}));
  });
  await p.getByTitle('Original PDF receipt').waitFor();await p.getByRole('button',{name:'Scan again',exact:true}).click();
  await p.getByRole('button',{name:'Scan again',exact:true}).waitFor();
  await p.getByLabel('Receiver / signature').fill('Manually reviewed PDF');await p.getByRole('button',{name:'Confirm receipt',exact:true}).click();await p.getByText('Saved',{exact:true}).waitFor();
  const stats=await p.evaluate(()=>({workers:window.ocrWorkers,pages:window.ocrPages,terminated:window.ocrTerminated}));
  if(stats.workers!==1||stats.pages!==2||!stats.terminated||pagesRead!==1||writes!==2||errors.length)throw Error(JSON.stringify({stats,pagesRead,writes,errors}));
  return {isolated:true,originalPdfPreview:true,protectedRasterReads:pagesRead,tesseractEngineMocked:true,...stats,manualReviewPersists:true,writes,productionWrites:0,errors};
 }catch(error){throw Error(JSON.stringify({error:String(error),errors,pagesRead,writes,body:(await p.locator("body").innerText()).slice(-3000),stats:await p.evaluate(()=>({workers:window.ocrWorkers,pages:window.ocrPages}))}));}finally{await context.close();}
}
