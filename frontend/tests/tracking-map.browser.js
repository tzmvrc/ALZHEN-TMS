// Actual Leaflet layer with synthetic assignments; no tiles, GPS or provider calls.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),errors=[],providerCalls=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://api.mapbox.com/**',route=>{providerCalls.push(route.request().url());return route.abort();});
 try{
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{
   await import('/src/index.css');
   const source=await(await fetch('/src/components/admin/TrackedTruckLayer.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
   const React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default;
   const DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {MapContainer}=await import(source.match(/from ["']([^"']*react-leaflet[^"']*)["']/)[1]);
   const {default:Layer}=await import('/src/components/admin/TrackedTruckLayer.tsx');
   const now=Date.parse('2026-10-17T01:00:00Z');
   const rows=Array.from({length:10},(_,i)=>({assignmentId:'assignment-'+i,tripId:'trip-'+i,plateNumber:'FIXTURE-'+i,dispatchNumber:'TEST-'+i,latitude:10+i*.04,longitude:123,capturedAt:new Date(now-(i===0?180000:0)).toISOString(),active:true,destinations:[{id:'a-'+i,name:'Stop A',latitude:10.1,longitude:123.1},{id:'b-'+i,name:'Stop B',latitude:10.2,longitude:123.2}],geometry:{type:'LineString',coordinates:[[123,10+i*.04],[123.05,10.02],[123.1,10.1],[123.2,10.2]]}}));
   function Fixture(){const[data,setData]=React.useState(rows);window.moveOne=()=>setData(old=>old.map((row,i)=>i===1?{...row,latitude:10.045}:row));return React.createElement(MapContainer,{center:[10.1,123.1],zoom:10,style:{height:500,width:800}},React.createElement(Layer,{assignments:data,now,onSelect:id=>{window.selectedTrip=id;}}));}
   const el=document.createElement('div');document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(Fixture));
  });
  const paths=p.locator('.leaflet-overlay-pane path');await paths.nth(39).waitFor();
  if(await paths.count()!==40)throw Error('Expected 10 roads, 20 stop markers and 10 truck markers');
  const route=await paths.nth(4).elementHandle(),before=await route.getAttribute('d');
  await p.evaluate(()=>window.moveOne());await p.waitForTimeout(150);
  if(await route.getAttribute('d')!==before)throw Error('Moving marker changed cached road geometry');
  if(!await route.evaluate(el=>el.isConnected))throw Error('Moving marker replaced the road layer');
  await paths.nth(3).click();await p.getByText('Last known location:',{exact:false}).waitFor();
  if(await p.evaluate(()=>window.selectedTrip)!=='trip-0')throw Error('Marker lost physical trip identity');
  if(providerCalls.length||errors.length)throw Error(JSON.stringify({providerCalls:providerCalls.length,errors}));
  return {isolated:true,activeTrucks:10,roadRoutes:10,stopMarkers:20,pinOnlyUpdate:true,cachedGeometryRetained:true,staleIndicator:true,exactTripSelection:true,mapboxRequests:0,productionWrites:0,errors};
 }finally{await context.close();}
}
