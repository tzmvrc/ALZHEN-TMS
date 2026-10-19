// Shared production toolbar, isolated React state. No API, Auth or database.
async(page)=>{
 const context=await page.context().browser().newContext(),p=await context.newPage();
 try{
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{
   await import('/src/index.css');const code=await(await fetch('/src/components/admin/ReportSpreadsheetShared.tsx')).text(),main=await(await fetch('/src/main.tsx')).text();
   const React=(await import(code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]),{ReportCellFormattingToolbar}=await import('/src/components/admin/ReportSpreadsheetShared.tsx');
   const Harness=()=>{const [format,setFormat]=React.useState({italic:false,underline:false});return React.createElement('div',null,React.createElement(ReportCellFormattingToolbar,{advanced:true,selectedCellCount:1,selectionIsBold:false,selectionIsItalic:format.italic,selectionIsUnderlined:format.underline,selectedTextColor:null,selectedBackgroundColor:null,onApply:patch=>setFormat(current=>({...current,...patch}))}),React.createElement('div',{id:'formatted-cell',style:{fontStyle:format.italic?'italic':'normal',textDecoration:format.underline?'underline':'none'}},'Fixture value'));};
   const el=document.createElement('div');document.body.append(el);(DOM.createRoot??DOM.default.createRoot)(el).render(React.createElement(Harness));
  });
  const check=button=>button.evaluate(element=>{
   const css=getComputedStyle(element),icon=element.querySelector('svg').getBoundingClientRect();
   const noVisibleShadow=css.boxShadow==='none'||css.boxShadow.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px/g,'').replace(/[,\s]/g,'')==='';
   if(css.backgroundColor!=='rgba(0, 0, 0, 0)'||css.borderTopWidth!=='0px'||!noVisibleShadow)throw Error('Formatting icon has a box: '+JSON.stringify({background:css.backgroundColor,border:css.borderTopWidth,shadow:css.boxShadow}));
   if(icon.width!==16||icon.height!==16||element.getBoundingClientRect().height!==28)throw Error('Toolbar dimensions changed');
   if(!element.title||!element.getAttribute('aria-label'))throw Error('Tooltip or accessible name missing');return css.color;
  });
  for(const name of ['Italic','Underline']){
   const button=p.getByRole('button',{name:`${name} selected cells`,exact:true});await button.waitFor();const inactive=await check(button);await button.hover();await check(button);await button.click();
   if(await button.getAttribute('aria-pressed')!=='true'||await check(button)===inactive)throw Error('Active state not visible');
   const applied=await p.locator('#formatted-cell').evaluate((node,key)=>key==='Italic'?getComputedStyle(node).fontStyle==='italic':getComputedStyle(node).textDecorationLine.includes('underline'),name);if(!applied)throw Error('Formatting did not toggle on');
   await button.focus();await p.keyboard.press('Tab');await p.keyboard.press('Shift+Tab');
   if(!await button.evaluate(node=>node.matches(':focus-visible')&&getComputedStyle(node).outlineWidth!=='0px'))throw Error('Keyboard focus indicator missing');
   await p.keyboard.press('Space');if(await button.getAttribute('aria-pressed')!=='false')throw Error('Keyboard did not toggle off');await check(button);
  }
  const italic=await p.getByRole('button',{name:'Italic selected cells',exact:true}).boundingBox(),underline=await p.getByRole('button',{name:'Underline selected cells',exact:true}).boundingBox();
  if(italic.y!==underline.y||italic.height!==underline.height)throw Error('Toolbar alignment changed');
  return {unboxedInactiveActiveHover:true,italicToggles:true,underlineToggles:true,colorActiveStates:true,keyboardToggleAndFocus:true,tooltips:true,unchangedIconSizeAndAlignment:true,productionWrites:0};
 }finally{await context.close();}
}
