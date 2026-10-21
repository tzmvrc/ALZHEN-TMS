// Actual shared cell components, 5,000 mounted cells; no Auth or business API.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage();let requests=0;const errors=[];
 p.on('pageerror',error=>errors.push(error.message));
 try{
  await p.route('**/api/**',route=>{requests++;return route.fulfill({contentType:'application/json',body:'{"success":true,"data":[]}'});});
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  const result=await p.evaluate(async()=>{
   const code=await(await fetch('/src/components/admin/ReportSpreadsheetShared.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
   const React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default;
   const DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {CollaborativeCell}=await import('/src/components/admin/CollaborativeCell.tsx'),{ReportTextCellEditor}=await import('/src/components/admin/ReportSpreadsheetShared.tsx'),store=await import('/src/services/cell-draft.service.ts');
   store.clearCellDrafts();let ownerRenders=0,unrelatedRenders=0,committed=null;
   const target={table:'combined',source:'trip_stops',recordId:'performance-stop',field:'remarks'},node=document.createElement('div');node.id='draft-performance';document.body.replaceChildren(node);
   const Other=()=>{unrelatedRenders++;return React.createElement('span',null,'canonical');};
   const Host=()=>{ownerRenders++;return React.createElement('div',null,
    React.createElement(CollaborativeCell,{target},React.createElement(ReportTextCellEditor,{buffered:true,value:'',label:'Performance input',className:'',onChange:()=>{},onCommit:value=>{committed=value;},onCancel:()=>{}})),
    ...Array.from({length:4999},(_,index)=>React.createElement(CollaborativeCell,{key:index,target:{...target,recordId:`other-${index}`}},React.createElement(Other))));};
   const root=(DOM.createRoot??DOM.default.createRoot)(node);root.render(React.createElement(Host));await new Promise(resolve=>setTimeout(resolve,250));
   window.performanceDraft={target,store,ownerRenders:()=>ownerRenders,unrelatedRenders:()=>unrelatedRenders,committed:()=>committed,unmount:()=>root.unmount()};
   return {mountedCells:5000,ownerRenders,unrelatedRenders};
  });
  await p.getByRole('textbox',{name:'Performance input'}).fill('local rapid text');
  const measured=await p.evaluate(async()=>{
   const state=window.performanceDraft,started=performance.now();
   for(let sequence=1;sequence<=100;sequence++)state.store.receiveCellDraft({target:state.target,socketId:'peer',sessionId:'session',sequence,value:`remote-${sequence}`,phase:'editing',userId:'peer',name:'Peer',color:'blue'});
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   return {hundredDraftsToPaintMs:performance.now()-started,ownerRenders:state.ownerRenders(),unrelatedRenders:state.unrelatedRenders(),committed:state.committed()};
  });
  if(await p.getByRole('textbox',{name:'Performance input'}).inputValue()!=='local rapid text')throw Error('Remote preview replaced local input');
  if(measured.ownerRenders!==result.ownerRenders||measured.unrelatedRenders!==result.unrelatedRenders||measured.committed!==null)throw Error('Typing rerendered table owner/unrelated children or saved');
  await p.getByRole('textbox',{name:'Performance input'}).press('Enter');
  if(await p.evaluate(()=>window.performanceDraft.committed())!=='local rapid text')throw Error('Buffered Enter used stale text');
  await p.evaluate(()=>window.performanceDraft.unmount());
  if(errors.length||requests)throw Error(JSON.stringify({errors,requests}));
  return {...result,...measured,fullOwnerRerendersDuringTyping:0,unrelatedCellRendersDuringTyping:0,apiRequests:requests,productionWrites:0};
 }finally{await context.close();}
}
