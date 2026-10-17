async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage();
 let forbiddenRequests=0;
 await p.route('**/api/**',route=>{forbiddenRequests++;return route.abort();});
 await p.route('**/*generativelanguage*',route=>{forbiddenRequests++;return route.abort();});
 await p.route('**/*mapbox*',route=>{forbiddenRequests++;return route.abort();});
 try{
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  const results=await p.evaluate(async()=>{
   const {recognizeReceipt}=await import('/src/services/ocr.service.ts');
   const make=async(kind)=>{
    const c=document.createElement('canvas');c.width=1000;c.height=420;
    const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='42px Arial';
    const lines=['LOCAL SYNTHETIC RECEIPT',...(kind==='missing'?['Quantity: 12','Received by: Test Person']:kind==='multiple'?['DR Number: 2468','DR Number: 1357']:['DR Number: 2468','Quantity: 12']),'NOT A BUSINESS DOCUMENT'];
    lines.forEach((line,i)=>ctx.fillText(line,40,75+i*80));
    let image=c;
    if(kind==='blurry'){image=document.createElement('canvas');image.width=c.width;image.height=c.height;const g=image.getContext('2d');g.filter='blur(5px)';g.drawImage(c,0,0);}
    if(kind==='rotated'){image=document.createElement('canvas');image.width=c.height;image.height=c.width;const g=image.getContext('2d');g.translate(image.width,0);g.rotate(Math.PI/2);g.drawImage(c,0,0);}
    if(kind==='blank'){ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);}
    return await new Promise(resolve=>image.toBlob(resolve,'image/png'));
   };
   const outcomes=[];
   for(const kind of ['clear','blurry','rotated','multiple','missing','blank']){
    const start=performance.now();
    const result=await recognizeReceipt(await make(kind));
    outcomes.push({fixture:kind,confidence:result.confidence,characters:result.text.length,has2468:/2468/.test(result.text),has1357:/1357/.test(result.text),elapsedMs:Math.round(performance.now()-start)});
   }
   let failed=false;
   try{await recognizeReceipt(new Blob(['invalid synthetic image'],{type:'image/png'}));}catch{failed=true;}
   return {outcomes,invalidImageRejected:failed};
  });
  const clear=results.outcomes.find(r=>r.fixture==='clear'),multiple=results.outcomes.find(r=>r.fixture==='multiple');
  if(!clear.has2468||!multiple.has2468||!multiple.has1357||!results.invalidImageRejected||forbiddenRequests)throw Error(JSON.stringify({results,forbiddenRequests}));
  return {isolated:true,realTesseract:true,syntheticImagesOnly:true,...results,forbiddenRequests,productionWrites:0};
 }finally{await context.close();}
}
