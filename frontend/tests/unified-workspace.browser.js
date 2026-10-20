// Real shared formula hook with isolated Auth/REST/Realtime fixtures.
async(page)=>{
 const browser=page.context().browser(),contexts=[],errors=[],checks=[];
 const store=new Map();let sourceWrites=0,formulaWrites=0,failRead=false;
 const make=async()=>{
  const context=await browser.newContext({viewport:{width:1440,height:950}});contexts.push(context);const p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));
  await p.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')return route.abort();return route.continue();});
  await p.route('**/src/context/AuthContext.tsx*',route=>route.fulfill({contentType:'text/javascript',body:"export const useAuth=()=>({profile:{id:'fixture-admin',role:'ADMIN'},accessToken:'fixture-token'});"}));
  await p.route('**/src/services/realtime.service.ts*',route=>route.fulfill({contentType:'text/javascript',body:"const listeners=new Set();export function subscribeToAdminRealtime(callback){listeners.add(callback);return()=>listeners.delete(callback);}window.emitFormulaChange=()=>listeners.forEach(callback=>callback({kind:'batch',tables:['spreadsheet_cell_formulas']}));"}));
  await p.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url()),body=request.postDataJSON();let data;
   if(url.pathname.endsWith('/formulas/read')){
    if(failRead)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,message:'Fixture unavailable'})});
    data={formulas:[...store.values()],sources:[]};
   }else if(url.pathname.endsWith('/formulas/save')||url.pathname.endsWith('/formulas/batch')){
    formulaWrites++;data=body.changes.map(change=>{const key=change.row_identity+':'+change.column_key,old=store.get(key);if((old?.version??0)!==change.expected_version)throw Error('Fixture version conflict');const saved={id:old?.id??'fixture-formula-'+store.size,table_key:body.table_key,row_identity:change.row_identity,column_key:change.column_key,formula_expression:change.expression,reference_bindings:change.references,version:(old?.version??0)+1,is_deleted:change.expression===null};store.set(key,saved);return saved;});
   }else throw Error('Unexpected fixture API '+url.pathname);
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await p.goto('http://localhost:5173/tests/table-fixture.html');
  await p.evaluate(async()=>{
   const main=await(await fetch('/src/main.tsx')).text(),React=(await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default,DOM=await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
   await import('/src/index.css');const {useOperationalFormulas}=await import('/src/components/admin/useOperationalFormulas.tsx');
   function Grid(){const [rows,setRows]=React.useState([{id:'stop-a',a:100,b:250,c:''},{id:'stop-b',a:2,b:3,c:''}]);
    const formulas=useOperationalFormulas({token:'fixture-token',table:'trips',rows,columns:[{key:'a'},{key:'b'},{key:'c'}],identity:row=>row.id,canEdit:true,sourceEditor:(row,key)=>({value:String(row[key]),writable:true,save:async value=>{window.fixtureSourceWrites=(window.fixtureSourceWrites??0)+1;setRows(current=>current.map(item=>item.id===row.id?{...item,[key]:key==='c'?value:Number(value)}:item));return true;}})});
    window.fixtureRefresh=formulas.refresh;
    return React.createElement('section',{'data-spreadsheet-workspace-grid':true},formulas.bar,React.createElement('table',{className:'spreadsheet-grid'},React.createElement('tbody',null,rows.map(row=>React.createElement('tr',{key:row.id},['a','b','c'].map(key=>React.createElement('td',{key,...formulas.cellProps(row,key),'data-testid':row.id+'-'+key,style:{width:180,border:'1px solid gray'}},formulas.render(row,key,String(row[key])))))))));
   }
   const root=(DOM.createRoot??DOM.default.createRoot)(document.body.appendChild(document.createElement('main')));root.render(React.createElement(Grid));window.stopFixture=()=>root.unmount();
  });
  return p;
 };
 try{
  const first=await make(),second=await make(),cell=(p,r,c)=>p.getByTestId(r+'-'+c),bar=p=>p.getByLabel('Formula or cell value');
  await cell(first,'stop-a','c').click();await bar(first).fill('=A1+B1');if(formulaWrites)throw Error('Typing saved before commit');await bar(first).press('Enter');await cell(first,'stop-a','c').getByText('350',{exact:true}).waitFor();checks.push('expression entry and calculated result');
  if(await bar(first).inputValue()!=='=A1+B1')throw Error('Expression lost');
  await second.evaluate(()=>window.emitFormulaChange());await cell(second,'stop-a','c').getByText('350',{exact:true}).waitFor();checks.push('second-context mocked saved update');
  await cell(first,'stop-b','c').click();await bar(first).fill('=');await cell(first,'stop-b','a').click();await bar(first).press('End');await bar(first).press('+');await cell(first,'stop-b','b').click();
  if(await bar(first).inputValue()!=='=A2+B2')throw Error('Reference clicks lost target or caret: '+await bar(first).inputValue());
  if(await cell(first,'stop-b','a').getAttribute('data-formula-reference')!=='true')throw Error('Reference not highlighted');
  await bar(first).press('Enter');await cell(first,'stop-b','c').getByText('5',{exact:true}).waitFor();checks.push('mouse references, caret, highlighting');
  await cell(first,'stop-a','c').dblclick();const inline=cell(first,'stop-a','c').getByRole('textbox');await inline.fill('=A1*B1');await cell(first,'stop-a','a').click();await inline.press('Escape');await cell(first,'stop-a','c').getByText('350',{exact:true}).waitFor();checks.push('in-cell formula reference picking and Escape');
  await cell(first,'stop-a','a').click();await bar(first).fill('200');await bar(first).press('Enter');await cell(first,'stop-a','a').getByText('200',{exact:true}).waitFor();await cell(first,'stop-a','c').getByText('450',{exact:true}).waitFor();checks.push('ordinary source save and dependency recalculation');
  sourceWrites=await first.evaluate(()=>window.fixtureSourceWrites);
  await cell(first,'stop-b','c').dblclick();await cell(first,'stop-b','c').getByRole('textbox').fill('=A2*B2');failRead=true;await first.evaluate(()=>window.fixtureRefresh().catch(()=>{}));if(await cell(first,'stop-b','c').getByRole('textbox').inputValue()!=='=A2*B2')throw Error('Refresh failure lost draft');await cell(first,'stop-b','c').getByRole('textbox').press('Escape');failRead=false;checks.push('draft retained through refresh failure');
  const before=formulaWrites;await cell(first,'stop-b','c').dblclick();await cell(first,'stop-b','c').getByRole('textbox').fill('=A2*B2');await cell(first,'stop-b','c').getByRole('textbox').press('Enter');await cell(first,'stop-b','c').getByText('6',{exact:true}).waitFor();if(formulaWrites!==before+1)throw Error('Duplicate Enter/blur save');checks.push('single commit on Enter/unmount blur');
  await first.evaluate(()=>window.stopFixture());await second.evaluate(()=>window.stopFixture());if(errors.length)throw Error(errors.join('; '));
  return {isolated:true,checks,sourceWrites,formulaWrites,contexts:2,productionWrites:0,errors};
 }finally{for(const context of contexts)await context.close();}
}
