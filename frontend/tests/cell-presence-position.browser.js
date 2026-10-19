// Actual collaborative cells in padded, sticky table cells. No backend or writes.
async(page)=>{
 const context=await page.context().browser().newContext({viewport:{width:1200,height:800}}),p=await context.newPage(),errors=[];
 p.on('pageerror',error=>errors.push(error.message));
 try{
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{
   await import('/src/index.css');const code=await(await fetch('/src/components/admin/CollaborativeCell.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
   const React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   const {CollaborativeCell}=await import('/src/components/admin/CollaborativeCell.tsx'),store=await import(code.match(/from ["']([^"']*cell-draft\.service\.ts[^"']*)["']/)[1]);
   const user={userId:'staff-a',name:'Staff A',color:'rgb(10, 100, 180)',status:'selected'};
   const viewport=document.createElement('div');viewport.id='position-viewport';Object.assign(viewport.style,{width:'640px',overflow:'auto',margin:'50px'});document.body.append(viewport);
   const cells=Array.from({length:4},(_,n)=>React.createElement('td',{key:n,id:`position-cell-${n}`,style:{position:n===0||n===3?'sticky':'relative',left:n===0?0:undefined,right:n===3?0:undefined,zIndex:n===0||n===3?20:undefined,padding:'14px 16px',minWidth:'260px',height:'70px',overflow:'visible',background:'white',boxShadow:`inset 0 0 0 2px ${user.color}`}},React.createElement(CollaborativeCell,{target:{table:'combined',source:'trip_stops',recordId:`stop-${n}`,field:'remarks'},selectionPresence:[user]},React.createElement('span',null,'Confirmed value'))));
   (DOM.createRoot??DOM.default.createRoot)(viewport).render(React.createElement('table',{style:{borderCollapse:'separate',borderSpacing:0,marginTop:'20px',marginBottom:'20px'}},React.createElement('tbody',null,React.createElement('tr',null,cells))));
   window.positionStore=store;
  });
  await p.locator('[data-cell-presence]').first().waitFor();
  const check=()=>p.evaluate(()=>[...document.querySelectorAll('[id^="position-cell-"]')].map(td=>{
   const label=td.querySelector('[data-cell-presence]'),cell=td.getBoundingClientRect(),rect=label.getBoundingClientRect(),style=getComputedStyle(label);
   if(!(rect.top<cell.top&&rect.bottom>cell.top))throw Error('Label does not overlap cell top border');
   if(Math.abs(cell.right-rect.right-4)>1)throw Error('Label is not at the cell right edge');
   if(label.offsetParent!==td||style.pointerEvents!=='none'||style.color!=='rgb(10, 100, 180)')throw Error('Wrong anchor, pointer behavior or collaborator color');
   if(td.querySelectorAll('[data-cell-presence]').length!==1)throw Error('Duplicate identity indicator');
   for(let node=label.parentElement;node&&node!==td;node=node.parentElement)if(getComputedStyle(node).overflow!=='visible')throw Error('Label clipped inside cell');
   return {x:rect.x,top:rect.top};
  }));
  const before=await check();
  await p.evaluate(()=>document.getElementById('position-viewport').scrollLeft=150);const after=await check();
  if(Math.abs(before[0].x-after[0].x)>1||Math.abs(before[3].x-after[3].x)>1||Math.abs(before[1].x-after[1].x-150)>1)throw Error('Pinned/scrolling labels do not follow their cells');
  await p.evaluate(()=>{const target={table:'combined',source:'trip_stops',recordId:'stop-0',field:'remarks'};for(const [index,userId] of ['staff-a','staff-a','staff-b'].entries())window.positionStore.receiveCellDraft({target,sessionId:`session-${index}`,socketId:`tab-${index}`,sequence:1,value:`Unsaved ${index}`,phase:'editing',userId,name:userId==='staff-a'?'Staff A':'Staff B',color:'blue'});});
  await p.locator('[data-live-draft]').waitFor();await check();
  const label=p.locator('#position-cell-0 [data-cell-presence]');if(!await label.getAttribute('title').then(value=>value.includes('Staff B'))||!(await label.innerText()).includes('+1'))throw Error('Distinct users lost or same-user tabs duplicated');
  await p.evaluate(()=>window.positionStore.clearCellDrafts());await p.locator('[data-live-draft]').waitFor({state:'hidden'});await check();
  if(errors.length)throw Error(errors.join('; '));return {selectionOnly:true,typing:true,multipleUsersDeduplicated:true,topBorderOverlap:true,unclippedWithinCells:true,leftAndRightPinning:true,horizontalScroll:true,pointerTransparent:true,productionWrites:0};
 }finally{await context.close();}
}
