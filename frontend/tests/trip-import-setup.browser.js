// Missing schema is a usable preview state, not a failed HTTP request. No live writes.
async (page) => {
  const context = await page.context().browser().newContext({viewport:{width:1280,height:850}}), p = await context.newPage();
  const errors = []; let previewCalls = 0;
  p.on('pageerror', e => errors.push(e.message));
  try {
    await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:"export const useAuth=()=>({accessToken:'isolated-bulk-test',profile:{role:'ADMIN'}});"}));
    await p.route('**/api/**',async r=>{
      if(!r.request().url().endsWith('/trips/import/preview'))throw Error('Unexpected import write');
      previewCalls++; const {files}=r.request().postDataJSON();
      const rows=files.flatMap(file=>file.rows.map(row=>({...row,filename:file.name,errors:[],warnings:[],source_identity:String(row.line),fingerprint:'mock',signature:'mock',document_hash:'mock',duplicate:false,potential_duplicate:false})));
      await r.fulfill({status:200,json:{success:true,data:{rows,detected:rows.length,valid:rows.length,invalid:0,duplicates:0,potential_duplicates:0,setup_required:true,duplicate_check_status:'unavailable',setup_message:'Preview is available. Apply the reviewed migration to enable duplicate checks and saving. No trip data has been saved.'}}});
    });
    await p.goto('http://localhost:5173/tests/table-fixture.html');
    await p.evaluate(async()=>{
      await import('/src/index.css');const main=await(await fetch('/src/main.tsx')).text(),React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
      const {default:Import}=await import('/src/components/admin/BulkTripImport.tsx');(DOM.createRoot??DOM.default.createRoot)(document.body.appendChild(document.createElement('div'))).render(React.createElement(Import,{onClose:()=>{},onImported:()=>{}}));
    });
    const csv='Customer Name,Ship To,Customer Model\n'+Array.from({length:5000},(_,i)=>`Customer,Store,MODEL-${i}`).join('\n');
    await p.locator('input[type=file]').setInputFiles({name:'5000.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
    await p.getByRole('button',{name:'Validate and preview all rows'}).click();
    await p.getByText('Preview ready · database setup required',{exact:true}).waitFor();
    const rowCount=await p.locator('tbody tr').count(); if(rowCount!==50)throw Error('All source rows were put into the DOM: '+rowCount);
    if(!await p.getByRole('button',{name:'Import all valid rows',exact:true}).isDisabled())throw Error('Saving allowed without duplicate protection');
    if(!await p.getByText('Page 1 / 100',{exact:true}).count())throw Error('Preview omitted rows above page size');
    if(errors.length)throw Error(errors.join('; '));
    return {isolated:true,previewHttpStatus:200,previewCalls,sourceRows:5000,renderedDataRows:rowCount,pages:100,savingBlockedUntilSetup:true,productionWrites:0};
  } finally {await context.close();}
}
