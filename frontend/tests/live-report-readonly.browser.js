// Uses the user's already authenticated local tab. GETs/navigation only.
async(page)=>{
 const p=page.context().pages().find(p=>p.url().startsWith('http://localhost:5173/'));if(!p)throw Error('Open the authenticated local application');
 const reads=[],errors=[];const onError=e=>errors.push(e.message);const onResponse=async r=>{if(r.request().method()==='GET'&&/\/api\/reports\//.test(r.url()))reads.push({path:new URL(r.url()).pathname,status:r.status(),timing:await r.headerValue('server-timing')});};p.on('response',onResponse);p.on('pageerror',onError);
 try{
 if(!await p.getByRole('tab',{name:'Master List',exact:true}).count())await p.getByRole('button',{name:'Trips',exact:true}).click();
 const results=[];for(const label of ['Master List','Dispatch Monitoring','Dispatch Report','Trip Booking','Store Calling','Transmittal Tracker']){
  const start=Date.now(),before=reads.length;await p.getByRole('tab',{name:label,exact:true}).click();const panel=p.getByRole('tabpanel');
  await p.waitForFunction(()=>{const panel=[...document.querySelectorAll('[role=tabpanel]')].find(el=>el.getBoundingClientRect().height>0&&getComputedStyle(el).display!=='none');if(!panel)return false;return panel.querySelector('tbody tr:not([data-spreadsheet-blank]) td[data-report-column-key],tbody tr:not([data-spreadsheet-blank]) td[data-tracker-field]')||[...panel.querySelectorAll('[role=status],[role=alert]')].some(el=>/No records match|No eligible transmittal|Unable to load/.test(el.textContent));},{},{timeout:30000});
  const actualRows=await panel.locator('tbody tr:not([data-spreadsheet-blank]):has(td[data-report-column-key]),tbody tr:not([data-spreadsheet-blank]):has(td[data-tracker-field])').count();const alerts=await panel.getByRole('alert').allTextContents();
  if(alerts.length)throw Error(label+': '+alerts.join(';'));
  results.push({sheet:label,visibleMs:Date.now()-start,actualRows,empty:actualRows===0,newReportReads:reads.slice(before)});
  await panel.screenshot({path:'frontend/tests/artifacts/live-'+label.toLowerCase().replaceAll(' ','-')+'.png'});
 }
 const before=reads.length,cached=[];for(const label of ['Master List','Dispatch Monitoring','Dispatch Report','Trip Booking','Store Calling','Transmittal Tracker']){const start=Date.now();await p.getByRole('tab',{name:label,exact:true}).click();cached.push({sheet:label,ms:Date.now()-start});}
 const cacheReads=reads.length-before;await p.getByRole('tab',{name:'Master List',exact:true}).click();if(errors.length)throw Error(errors.join(';'));return{live:true,mutations:0,results,cached,cacheReads,errors};
 }finally{p.off('response',onResponse);p.off('pageerror',onError);}
}
