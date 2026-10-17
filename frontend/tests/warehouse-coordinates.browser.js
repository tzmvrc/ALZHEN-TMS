// Local drafts only: mock warehouse reads, no persistence function or live API.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),errors=[],external=[],mutations=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',r=>{const request=r.request(),url=new URL(request.url());if(!['localhost','127.0.0.1'].includes(url.hostname)){external.push(url.hostname);return r.abort();}if(request.method()!=='GET'){mutations.push(url.pathname);return r.abort();}return r.continue();});
 await p.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:'export const useAuth=()=>({accessToken:"fixture",profile:{id:"fixture",role:"STAFF"}});'}));
 await p.route('**/src/services/master-data.service.ts*',r=>r.fulfill({contentType:'text/javascript',body:'export const getCachedMasterData=()=>null;export const fetchMasterData=async()=>{window.warehouseReads++;return {rows:structuredClone(window.fixtureWarehouses),pagination:{page:1,limit:100,total:2,totalPages:1}};};'}));
 try{
  await p.goto('http://localhost:5173/tests/table-fixture.html');await p.waitForTimeout(1000);
  await p.evaluate(async()=>{
   window.fixtureWarehouses=[{id:'warehouse-one',name:'Existing warehouse',latitude:10,longitude:123},{id:'warehouse-two',name:'Missing warehouse',latitude:null,longitude:null}];window.warehouseReads=0;
   await import('/src/index.css');const main=await(await fetch('/src/main.tsx')).text(),React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {default:Editor}=await import('/src/components/admin/WarehouseCoordinateEditor.tsx');const el=document.createElement('div');document.body.append(el);const root=(DOM.createRoot??DOM.default.createRoot)(el);root.render(React.createElement(Editor,{offlineStyle:true}));window.closeEditor=()=>root.unmount();
  });
  await p.getByLabel('Draft latitude',{exact:true}).waitFor();await p.waitForFunction(()=>document.querySelectorAll('.mapboxgl-marker').length===2);
  if(!await p.getByRole('button',{name:'Save coordinates (approval required)'}).isDisabled())throw Error('Persistence control enabled');
  await p.getByLabel('Draft latitude',{exact:true}).fill('10.5');await p.getByLabel('Draft longitude',{exact:true}).fill('123.2');await p.getByText('Preview before saving:',{exact:false}).waitFor();
  await p.getByLabel('Draft latitude',{exact:true}).fill('123');await p.getByText('Choose a pin or enter latitude',{exact:false}).waitFor();
  await p.getByLabel('Warehouse coordinates record').selectOption('warehouse-two');
  if(await p.getByLabel('Draft latitude',{exact:true}).inputValue()!=='')throw Error('Missing warehouse was assigned a guessed coordinate');
  await p.locator('.mapboxgl-canvas').click({position:{x:120,y:150}});await p.getByText('Preview before saving:',{exact:false}).waitFor();
  const lat=Number(await p.getByLabel('Draft latitude',{exact:true}).inputValue()),lng=Number(await p.getByLabel('Draft longitude',{exact:true}).inputValue());if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180)throw Error('Map pin produced invalid coordinate order');
  const state=await p.evaluate(()=>({rows:window.fixtureWarehouses,reads:window.warehouseReads}));if(state.rows[0].latitude!==10||state.rows[1].latitude!==null)throw Error('Local draft changed source warehouse');
  await p.evaluate(()=>window.closeEditor());if(await p.locator('.mapboxgl-marker').count())throw Error('Editor marker cleanup failed');
  if(errors.length||external.length||mutations.length)throw Error(JSON.stringify({errors,external,mutations}));
  return {isolated:true,staffEditor:true,warehouseReads:state.reads,existingAndMissingCoordinates:true,noGuessedCoordinates:true,mapPinSelection:true,coordinateOrderValidated:true,saveDisabled:true,sourceRecordsUnchanged:true,cleanup:true,databaseWrites:0,externalRequests:0};
 }finally{await context.close();}
}
