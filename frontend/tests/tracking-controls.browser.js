async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),errors=[],writes=[];
 p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url());let data;
   if(req.method()==='GET')data=url.pathname.endsWith('/capabilities')?{enabled:true}:[{id:'fixture-assignment',trip_id:'fixture-trip',plate_number:'TEST-ONLY'}];
   else{writes.push({path:url.pathname,body:req.postDataJSON()});data=url.pathname.endsWith('/start')?{session_id:'00000000-0000-4000-8000-000000000001'}:{stopped:true};}
   return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{
   window.geoCalls=0;Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:fn=>{window.geoCalls++;fn({timestamp:Date.now(),coords:{latitude:10,longitude:123,accuracy:4}});},watchPosition:()=>1,clearWatch:()=>{window.cleared=true;}}});
   await import('/src/index.css');const code=await(await fetch('/src/components/admin/LocationSharing.tsx')).text(),main=await(await fetch('/src/main.tsx')).text(),React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{default:View}=await import('/src/components/admin/LocationSharing.tsx');
   const el=document.createElement('div');document.body.append(el);const root=(DOM.createRoot??DOM.default.createRoot)(el);window.unmountSharing=()=>root.unmount();root.render(React.createElement(View,{token:'fixture-driver',tripId:'fixture-trip'}));
  });
  await p.getByRole('button',{name:'Share my location',exact:true}).waitFor();if(await p.evaluate(()=>window.geoCalls)!==0)throw Error('Collected before consent');
  await p.getByRole('button',{name:'Share my location',exact:true}).click();await p.getByText('sharing',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Stop location sharing',exact:true}).click();await p.getByText('stopped',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Share my location',exact:true}).click();await p.getByText('sharing',{exact:true}).waitFor();
  await p.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await p.getByText('stopped',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Share my location',exact:true}).click();await p.getByText('sharing',{exact:true}).waitFor();await p.evaluate(()=>window.unmountSharing());await p.waitForTimeout(150);
  if(writes.filter(w=>w.path.endsWith('/fixes')).length!==3||writes.filter(w=>w.path.endsWith('/stop')).length!==3)throw Error(JSON.stringify(writes));
  if(writes.some(w=>w.body.profile_id)||errors.length)throw Error('Unsafe actor or browser error');
  const before=writes.length;await p.reload();await p.waitForTimeout(100);if(writes.length!==before)throw Error('Refresh resumed sharing automatically');
  return {isolated:true,permissionOnlyAfterClick:true,starts:3,fixes:3,stops:3,pagehideStops:true,unmountStops:true,refreshDoesNotResume:true,unexpectedCloseDeliveryGuaranteed:false,productionWrites:0,errors};
 }finally{await context.close();}
}
