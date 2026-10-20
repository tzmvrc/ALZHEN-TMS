// Retained workspace boundaries with stateful grids; no operational APIs.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),errors=[];
 p.on('pageerror',error=>errors.push(error.message));
 try{
  const main=await(await p.request.get('http://localhost:5173/src/main.tsx')).text(),reactPath=main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1];
  await p.route('**/src/context/AuthContext.tsx*',route=>route.fulfill({contentType:'text/javascript',body:"export const useAuth=()=>({profile:{id:'fixture',role:'ADMIN'}});"}));
  await p.route('**/src/components/admin/ReportDataView.tsx*',route=>route.fulfill({contentType:'text/javascript',body:`import React from ${JSON.stringify(reactPath)};export default function Fixture(props){const key=props.transactionView?'Trips':props.initialReport;const[value,setValue]=React.useState('');React.useEffect(()=>{window.effects??={};window.effects[key]=(window.effects[key]??0)+1;return()=>{window.effects[key]--;}},[]);return React.createElement(React.Fragment,null,props.toolbarLeading,React.createElement('input',{'aria-label':key+' search',value,onChange:e=>setValue(e.target.value)}));}`}));
  await p.route('**/src/components/admin/TransmittalTrackerView.tsx*',route=>route.fulfill({contentType:'text/javascript',body:`import React from ${JSON.stringify(reactPath)};export default props=>React.createElement('div',null,props.toolbarLeading,'Tracker fixture');`}));
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{const main=await(await fetch('/src/main.tsx')).text(),React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);const {default:Workspace}=await import('/src/components/admin/ReportsWorkspace.tsx');const root=(DOM.createRoot??DOM.default.createRoot)(document.body.appendChild(document.createElement('div')));window.closeWorkspace=()=>root.unmount();root.render(React.createElement(Workspace,{initialReport:'combined'}));});
  const sheets=[['Trips','Trips'],['Dispatch Monitoring','dispatch-monitoring'],['Dispatch Report','dispatch'],['Trip Booking','trip-booking'],['Store Calling','store-calling']];
  for(const [label,key] of sheets){await p.getByRole('tab',{name:label,exact:true}).click();await p.getByLabel(key+' search',{exact:true}).fill('preserve '+key);}
  for(const [label,key] of sheets){await p.getByRole('tab',{name:label,exact:true}).click();if(await p.getByLabel(key+' search',{exact:true}).inputValue()!=='preserve '+key)throw Error('Sheet reset '+key);const effects=await p.evaluate(()=>window.effects);if(Object.entries(effects).some(([sheet,count])=>count!==(sheet===key?1:0)))throw Error('Hidden sheet effects still active');}
  if(await p.getByRole('tab',{name:'Combined Report',exact:true}).count())throw Error('Redundant Combined tab');
  await p.getByRole('button',{name:'Transmittal Tracker',exact:true}).click();await p.getByText('Tracker fixture').waitFor();await p.getByRole('button',{name:'Back to Trips'}).click();
  if(await p.getByLabel('Trips search',{exact:true}).inputValue()!=='preserve Trips')throw Error('Trips reset after Tracker');
  await p.evaluate(()=>window.closeWorkspace());if(Object.values(await p.evaluate(()=>window.effects)).some(value=>value!==0))throw Error('Effects survived unmount');if(errors.length)throw Error(errors.join(';'));
  return {isolated:true,sheets:5,stateRetained:true,hiddenSubscriptionsPaused:true,transmittalAccessible:true,combinedTabRemoved:true,cleanup:true,productionRequests:0};
 }finally{await context.close();}
}
