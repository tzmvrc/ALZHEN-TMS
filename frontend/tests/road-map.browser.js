// Actual Mapbox GL renderer; offline style + static documented road geometry.
// Every external request is blocked. No auth, Directions or GPS writes.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),errors=[],external=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>{const url=new URL(r.request().url());if(!['localhost','127.0.0.1'].includes(url.hostname)){external.push(url.hostname);return r.abort();}return r.continue();});
 try{
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  // Vite may reload once while prebundling the newly installed GL dependency.
  await p.waitForTimeout(1500);
  await p.evaluate(async()=>{
   await import('/src/index.css');const main=await(await fetch('/src/main.tsx')).text();
   const React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {default:RoadMap}=await import('/src/components/admin/RoadRouteMap.tsx'),geometry=await(await fetch('/tests/fixtures/road-geometry.json')).json();
   const point=i=>({longitude:geometry.coordinates[i][0],latitude:geometry.coordinates[i][1]});
   const rows=Array.from({length:10},(_,i)=>({key:'assignment-'+i,assignmentId:'assignment-'+i,tripId:'trip-'+i,dispatchNumber:'Fixture '+i,plateNumber:'TEST-'+i,driverName:'Driver '+i,warehouse:{id:'w',name:'Fixture warehouse',point:point(0)},stops:[{id:'stop-a-'+i,sequence:1,stopSequence:1,status:'PENDING',name:'First',point:point(3)},{id:'stop-b-'+i,sequence:2,stopSequence:2,status:'PENDING',name:'Second',point:point(8)}],position:{...point(i%9),capturedAt:new Date().toISOString(),accuracyMeters:5},cache:{mode:'planned',matchesContext:true,geometry,calculatedAt:new Date().toISOString(),distanceMeters:176.7,durationSeconds:26.2,error:null}}));
   function Fixture(){const[data,setData]=React.useState(rows),[selection,setSelection]=React.useState(rows[0].key),[mode,setMode]=React.useState('planned');window.noGPS=()=>setData(old=>old.map(r=>({...r,position:null})));window.restoreGPS=()=>setData(old=>old.map((r,i)=>({...r,position:rows[i].position})));window.movePin=()=>setData(old=>old.map((r,i)=>i===0?{...r,position:{...r.position,...point(2)}}:r));window.switchTrip=()=>setSelection(rows[1].key);window.remaining=()=>{setData(old=>old.map(r=>({...r,stops:r.stops.map((s,i)=>i===0?{...s,status:'COMPLETED'}:s),cache:{...r.cache,mode:'remaining'}})));setMode('remaining');};window.reduce=()=>{setData(old=>old.slice(0,1));setSelection(rows[0].key);};return React.createElement(RoadMap,{rows:data,selected:selection,mode,onSelect:setSelection,offlineStyle:true,onReady:map=>{window.fixtureMap=map;window.mapErrors=[];window.fits=0;const fit=map.fitBounds.bind(map);map.fitBounds=(...args)=>{window.fits++;return fit(...args);};map.on('error',e=>window.mapErrors.push(e.error?.message));}});}
   const el=document.createElement('div');document.body.append(el);const root=(DOM.createRoot??DOM.default.createRoot)(el);window.removeFixture=()=>root.unmount();root.render(React.createElement(Fixture));
  });
  await p.waitForFunction(()=>window.fixtureMap?.getSource('alzhen-road-cache'));
  await p.waitForFunction(()=>document.querySelectorAll('.mapboxgl-marker').length===40);
  const initial=await p.evaluate(()=>{const map=window.fixtureMap,source=map.getSource('alzhen-road-cache');window.initialSource=source;window.dataWrites=0;const original=source.setData.bind(source);source.setData=(...args)=>{window.dataWrites++;return original(...args);};return {roads:source._data.features.length,points:source._data.features[0].geometry.coordinates.length,layers:map.getStyle().layers.length};});
  if(initial.roads!==10||initial.points!==9)throw Error('Expected ten independent detailed road features');
  if(!await p.evaluate(()=>window.fixtureMap.getCenter().lat>50&&window.fixtureMap.getCenter().lat<55))throw Error('Map did not fit cached road bounds');
  await p.evaluate(()=>window.noGPS());await p.waitForFunction(()=>document.querySelectorAll('.mapboxgl-marker').length===30);
  if(await p.evaluate(()=>window.fixtureMap.getSource('alzhen-road-cache')._data.features.length)!==10)throw Error('Planned geometry requires no GPS');
  await p.evaluate(()=>window.restoreGPS());await p.waitForFunction(()=>document.querySelectorAll('.mapboxgl-marker').length===40);
  const fits=await p.evaluate(()=>window.fits);
  await p.evaluate(()=>window.movePin());await p.waitForTimeout(120);
  if(await p.evaluate(()=>window.dataWrites)!==0)throw Error('Pin movement replaced road geometry');
  if(await p.evaluate(()=>window.fits)!==fits)throw Error('Pin movement jumped map viewport');
  await p.evaluate(()=>window.switchTrip());await p.waitForTimeout(120);
  if(!await p.evaluate(()=>JSON.stringify(window.fixtureMap.getPaintProperty('alzhen-road-lines','line-width')).includes('assignment-1')))throw Error('Trip selection not highlighted');
  await p.evaluate(()=>window.remaining());await p.waitForFunction(()=>document.querySelectorAll('.mapboxgl-marker').length===30);
  await p.evaluate(()=>window.reduce());await p.waitForFunction(()=>document.querySelectorAll('.mapboxgl-marker').length===3);
  const mapErrors=await p.evaluate(()=>window.mapErrors);await p.evaluate(()=>window.removeFixture());
  if(await p.locator('.mapboxgl-canvas').count()||await p.locator('.mapboxgl-marker').count())throw Error('Map resources survived unmount');
  if(errors.length||mapErrors.length||external.length)throw Error(JSON.stringify({errors,mapErrors,external}));
  return {isolated:true,mapboxGL:true,roadFeatures:initial.roads,geometryVertices:initial.points,warehouseMarkers:10,numberedStopMarkers:20,truckMarkers:10,plannedWithoutGPS:true,fitRoadBounds:true,markerOnlyUpdate:true,stableViewportOnGPS:true,tripHighlight:true,completedStopsExcluded:true,obsoleteMarkersRemoved:true,unmountCleanup:true,externalRequests:0,directionsRequests:0,gpsWrites:0};
 }finally{await context.close();}
}
