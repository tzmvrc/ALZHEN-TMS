// Run with Playwright browser_run_code_unsafe(filename) in an authenticated page.
// Read-only navigation/scrolling. Does not edit, save, import, or delete records.
async (page) => {
  await page.bringToFront();
  const session=await page.context().newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled",{enabled:true});
  await session.detach();
  if(!page.__tableNetworkInstalled){
    page.__tableNetworkInstalled=true;page.__tableReads=new Set();page.__serverTimings=[];page.__probeRequests=[];
    const relevant=request=>request.url().includes('/api/')&&!request.url().includes('/realtime/');
    page.on('request',request=>{if(relevant(request))page.__tableReads.add(request);});
    page.on('requestfinished',async request=>{
      page.__tableReads.delete(request);
      if(!relevant(request))return;
      const response=await request.response();
      const sizes=await request.sizes();
      page.__probeRequests.push({path:new URL(request.url()).pathname,method:request.method(),status:response?.status()??0,timing:request.timing(),bytes:sizes.responseBodySize});
    });
    page.on('requestfailed',request=>page.__tableReads.delete(request));
    page.on('response',async response=>{if(!relevant(response.request()))return;const timing=await response.headerValue('server-timing');if(timing)page.__serverTimings.push({path:new URL(response.url()).pathname,timing});});
  }
  if(!await page.evaluate(()=>Boolean(window.__tablePerf))){
    const install=()=>{
      window.__tablePerf={tasks:[],frames:[],last:0};
      new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__tablePerf.tasks.push(entry.duration);}).observe({type:"longtask"});
      const tick=time=>{const p=window.__tablePerf;if(p.last&&time-p.last>35)p.frames.push(time-p.last);p.last=time;requestAnimationFrame(tick);};requestAnimationFrame(tick);
    };
    await page.evaluate(install);
  }
  const results=[];
  const measure=async(name,action,settle=2200)=>{
    page.__probeRequests=[];
    await page.evaluate(()=>{window.__tablePerf.tasks=[];window.__tablePerf.frames=[];window.__tablePerf.last=0;});
    const start=Date.now();await action();const actionMs=Date.now()-start;
    await page.waitForTimeout(settle);
    const readDeadline=Date.now()+12000;
    while(page.__tableReads.size&&Date.now()<readDeadline)await page.waitForTimeout(100);
    await page.waitForTimeout(150);
    const stats=await page.evaluate(()=>({
      longTaskMs:window.__tablePerf.tasks.reduce((sum,value)=>sum+value,0),maxTaskMs:Math.max(0,...window.__tablePerf.tasks),
      delayedFrames:window.__tablePerf.frames.length,maxFrameGapMs:Math.max(0,...window.__tablePerf.frames),
      domNodes:document.querySelectorAll("*").length,renderedRows:[...document.querySelectorAll("tr[data-virtual-index]")].filter(row=>row.getClientRects().length).length,
      heapBytes:performance.memory?.usedJSHeapSize??null,
    }));
    const requests=(page.__probeRequests??[]).map(request=>({path:request.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/ig,":id"),method:request.method,status:request.status,durationMs:request.timing.responseEnd,encodedBytes:request.bytes}));
    results.push({name,actionMs,observationMs:Date.now()-start,pendingReads:page.__tableReads.size,settleMs:settle,...stats,requests});
  };
  await page.getByRole("button",{name:"Trips",exact:true}).click();
  for(const name of ["Master List","Dispatch Monitoring","Dispatch Report","Trip Booking","Store Calling","Transmittal Tracker"]){
    await measure(name,()=>page.getByRole("tab",{name,exact:true}).click());
  }
  await page.getByRole("tab",{name:"Master List",exact:true}).click();
  await page.locator("tr[data-virtual-index]:visible").first().waitFor();
  await measure("Trips vertical scroll",()=>page.locator(".spreadsheet-viewport:visible").evaluate(async viewport=>{
    viewport.scrollLeft=0;for(let i=0;i<12;i++){viewport.scrollTop=(i%6)*200;await new Promise(resolve=>setTimeout(resolve,100));}
  }),600);
  await measure("Trips horizontal scroll",()=>page.locator(".spreadsheet-viewport:visible").evaluate(async viewport=>{
    viewport.scrollTop=0;for(let i=0;i<10;i++){viewport.scrollLeft=i*600;await new Promise(resolve=>setTimeout(resolve,120));}
  }),500);
  await page.getByRole("button",{name:"Database",exact:true}).click();
  for(const name of ["Warehouses","Trucks","Trucking Companies","Stores","Store Contacts","Products"]){
    await measure(name,()=>page.getByRole("tab",{name,exact:true}).click());
  }
  await page.getByRole("button",{name:"Users",exact:true}).click();
  for(const name of ["Admin & Staff","Truckers"])await measure(name,()=>page.getByRole("tab",{name,exact:true}).click());
  for(let i=0;i<3;i++)for(const name of ["Trips","Database","Users"])await measure(`Repeat ${i+1}: ${name}`,()=>page.getByRole("button",{name,exact:true}).click(),350);
  page.__tmsNavigationResults=results;
  return results;
}
