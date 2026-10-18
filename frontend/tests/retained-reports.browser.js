// Actual report workspace/Activity boundaries, isolated stateful table fixtures.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 try{
  const main=await(await p.request.get('http://localhost:5173/src/main.tsx')).text(),reactPath=main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1];
  for(const [file,label] of [['ReportDataView','Combined'],['TransmittalTrackerView','Tracker'],['OperationsReportsView','Offload']])await p.route(`**/src/components/admin/${file}.tsx*`,r=>r.fulfill({contentType:'text/javascript',body:`import React from ${JSON.stringify(reactPath)};export default function Fixture(props){const[value,setValue]=React.useState('');React.useEffect(()=>{window.effects??={};window.effects['${label}']=(window.effects['${label}']??0)+1;return()=>{window.effects['${label}']--;}},[]);return React.createElement(React.Fragment,null,props.toolbarLeading,React.createElement('input',{'aria-label':'${label} search',value,onChange:e=>setValue(e.target.value)}));}`}));
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{const main=await(await fetch('/src/main.tsx')).text(),React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);const {default:Workspace}=await import('/src/components/admin/ReportsWorkspace.tsx');const el=document.createElement('div');document.body.append(el);const root=(DOM.createRoot??DOM.default.createRoot)(el);window.closeWorkspace=()=>root.unmount();root.render(React.createElement(Workspace,{initialReport:'combined'}));});
  await p.getByLabel('Combined search',{exact:true}).fill('preserve combined');await p.getByRole('tab',{name:'Transmittal Tracker'}).click();await p.getByLabel('Tracker search',{exact:true}).fill('preserve tracker');
  await p.getByRole('tab',{name:'Offload Reports'}).click();await p.getByLabel('Offload search',{exact:true}).fill('preserve offload');
  if(await p.evaluate(()=>window.effects.Combined)!==0||await p.evaluate(()=>window.effects.Tracker)!==0)throw Error('Hidden table subscriptions/presence remained active');
  await p.getByRole('tab',{name:'Transmittal Tracker'}).click();if(await p.getByLabel('Tracker search',{exact:true}).inputValue()!=='preserve tracker')throw Error('Tracker remounted and reset search');
  await p.getByRole('tab',{name:'Combined Report',exact:true}).click();if(await p.getByLabel('Combined search',{exact:true}).inputValue()!=='preserve combined')throw Error('Combined reset search');
  await p.evaluate(()=>window.closeWorkspace());if(Object.values(await p.evaluate(()=>window.effects)).some(v=>v!==0))throw Error('Workspace subscriptions survived unmount');if(errors.length)throw Error(errors.join(';'));
  return {isolated:true,trackerAndOffloadStateRetained:true,combinedStateRetained:true,hiddenSubscriptionsPaused:true,cleanup:true,productionRequests:0};
 }finally{await context.close();}
}
