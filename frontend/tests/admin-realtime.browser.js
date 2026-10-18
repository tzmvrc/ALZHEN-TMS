// Two isolated browser contexts. Auth, Supabase transport and EVERY API request
// are mocked. This is not a live authenticated Supabase two-session test.
async (page) => {
  const contexts = [], pages = [], calls = [[], []], signals = new Map();
  let width = 260, layoutRevision = 1, remarks = "Original remark";
  const id = "123e4567-e89b-42d3-a456-000000000001", trip = "123e4567-e89b-42d3-a456-000000000010", stop = "123e4567-e89b-42d3-a456-000000000021";
  const mockSupabase = `const channels=[]; window.__channels=channels; export const supabase={realtime:{setAuth:async()=>{}},channel(name){const c={name,removed:false,on(kind,filter,cb){this.cb=cb;return this},subscribe(status){this.status=status;queueMicrotask(()=>status('SUBSCRIBED'));return this}};channels.push(c);return c},removeChannel:async(c)=>{c.removed=true}}; window.__signal=(topic,revision)=>channels.filter(c=>!c.removed).forEach(c=>c.cb?.({new:{topic,revision}}));window.__status=s=>channels.filter(c=>!c.removed).forEach(c=>c.status?.(s));`;
  async function emit(topics) {
    for (const topic of topics) signals.set(topic, { topic, revision: crypto.randomUUID() });
    for (const p of pages) for (const topic of topics) await p.evaluate((signal) => window.__signal(signal.topic,signal.revision), signals.get(topic));
  }
  async function until(check, description) {
    for (let i=0;i<60;i++) { if (await check()) return; await pages[0].waitForTimeout(100); }
    throw new Error(description);
  }
  try {
    for (let session=0;session<2;session++) {
      const context=await page.context().browser().newContext({viewport:{width:1440,height:1000}});contexts.push(context);
      const fixture=await context.newPage();pages.push(fixture);
      await fixture.route("**/src/context/AuthContext.tsx*", route=>route.fulfill({contentType:"text/javascript",body:'export const useAuth=()=>window.__testAuth??{profile:null,accessToken:null,loading:false};export const AuthProvider=({children})=>children;export const getRoleBasedHomePath=()=>"/login";'}));
      await fixture.route("**/src/lib/supabase.ts*",route=>route.fulfill({contentType:"text/javascript",body:mockSupabase}));
      await fixture.route("**/api/**", async route=>{
        const request=route.request(),url=new URL(request.url());calls[session].push({method:request.method(),path:url.pathname});
        let data=[];
        if(url.pathname==="/api/realtime/changes") data=[...signals.values()];
        if(url.pathname.includes("/table-layouts/")) {
          if(request.method()==="PATCH") {const input=request.postDataJSON();if(input.expected_revision!==layoutRevision) return route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({success:false,message:"Layout changed"})});width=input.width_px;layoutRevision++;}
          const row={table_key:"operations",column_key:"route",width_px:width,revision:layoutRevision}; data=request.method()==="PATCH"?row:[row];
        }
        if(url.pathname.endsWith("/operations/page")) {
          const record={id,trip_id:trip,trip_stop_id:stop,reason:"Fixture reason",number_of_boxes:null,comments:remarks,items:[]};
          const row={id:"offload:"+id,source_type:"OFFLOAD",source_record_id:id,trip_id:trip,trip_stop_id:stop,trip_number:"Fixture trip",dispatch_number:"DSP-1",date:"2026-10-15T00:00:00Z",plate_number:"FIXTURE",driver_name:"Fixture Driver",route:"Fixture Route",dr_number:"DR-1",quantity:null,quantity_scope:null,total_cbm:null,report_type:"Offload",report_types:["Offload"],event_type_records:[{id,source_type:"OFFLOAD",event_type:"Offload"}],backload_records:[],offload_records:[record],line_items:[],remarks,reason:"Fixture reason",reported_by:"Fixture User",stop_sequence:1,scope_label:"Fixture transaction",assignment_id:null,loading_report_id:null,unloading_report_id:null,loading_timestamps:null,unloading_timestamps:null};
          data={trips:[],trip_options:[],stops:[],loading:[],unloading:[],backloads:[],offloads:[record],event_rows:[row],pagination:{page:1,limit:50,total:1,totalPages:1}};
        }
        if(!["GET","PATCH"].includes(request.method()) || (request.method()==="PATCH"&&!url.pathname.includes("/table-layouts/"))) throw new Error("Unexpected fixture write "+request.method()+" "+url.pathname);
        await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({success:true,data})});
      });
      await fixture.goto("http://localhost:5173/login");
      await fixture.evaluate(async session=>{
        await import("/src/index.css");window.__testAuth={profile:{id:"fixture-admin-"+session,role:"ADMIN"},accessToken:"fixture-token-"+session};
        const code=await(await fetch("/src/components/admin/OperationsReportsView.tsx")).text(),main=await(await fetch("/src/main.tsx")).text();
        const reactPath=code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1],domPath=main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1];
        const module=await import(reactPath),React=module.default??module,DOM=await import(domPath);
        const realtimePath=code.match(/from ["']([^"']*\/services\/realtime\.service\.ts[^"']*)["']/)[1];
        const {default:View}=await import("/src/components/admin/OperationsReportsView.tsx"),{startAdminRealtime}=await import(realtimePath);
        const root=document.createElement("div");root.id="realtime-fixture";Object.assign(root.style,{position:"fixed",inset:"0",zIndex:"99999",background:"white",overflow:"auto",padding:"20px"});document.body.append(root);
        (DOM.createRoot??DOM.default.createRoot)(root).render(React.createElement(View,{mode:"management"}));
        window.__stopRealtime=startAdminRealtime("fixture-token-"+session,"fixture-admin-"+session,"ADMIN");
        window.__startTrucker=()=>startAdminRealtime("trucker-token","trucker-profile","TRUCKER");
      },session);
      await fixture.locator("#realtime-fixture").getByRole("checkbox",{name:"Select row DSP-1",exact:true}).waitFor();
    }
    const roots=pages.map(p=>p.locator("#realtime-fixture"));
    const headerWidth=async n=>roots[n].locator('[data-ops-column="route"]').evaluate(el=>Math.round(el.getBoundingClientRect().width));
    await roots[0].getByRole("checkbox",{name:"Select row DSP-1",exact:true}).check();
    width=410;layoutRevision++;await emit(["shared_table_column_widths"]);
    await until(async()=>await headerWidth(0)===410&&await headerWidth(1)===410,"Shared layout did not propagate");
    for(let n=0;n<2;n++) {const finder=roots[n].getByRole("combobox",{name:"Search rows or columns"});await finder.fill("Route");await finder.press("ArrowDown");await finder.press("Enter");await finder.blur();}
    await pages[0].waitForTimeout(400);
    const handle=roots[0].getByRole("separator",{name:"Resize Route",exact:true});await handle.scrollIntoViewIfNeeded();const box=await handle.boundingBox();
    await pages[0].mouse.move(box.x+2,box.y+10);await pages[0].mouse.down();await pages[0].mouse.move(box.x+27,box.y+10);
    await pages[0].waitForTimeout(100);const draggingWidth=await headerWidth(0);if(draggingWidth<=410)throw new Error("Fixture did not activate resize handle "+JSON.stringify(box));width=470;layoutRevision++;await emit(["shared_table_column_widths"]);
    await until(async()=>await headerWidth(1)===470,"Other session missed remote layout");
    if(await headerWidth(0)!==draggingWidth) throw new Error("Remote layout interrupted active drag");
    await pages[0].mouse.up();await until(async()=>calls[0].some(c=>c.method==="PATCH"),"Resize was not committed");await emit(["shared_table_column_widths"]);
    await until(async()=>await headerWidth(0)===width&&await headerWidth(1)===width,"Committed layout did not converge");
    await roots[0].locator('td[title="Edit Remarks"]').click();
    const editor=roots[0].getByRole("textbox",{name:"Edit Remarks",exact:true});await editor.fill("Unsaved draft stays");
    const overviewCount=n=>calls[n].filter(c=>c.path.endsWith("/operations/page")).length;
    const before=[overviewCount(0),overviewCount(1)];remarks="Remote update";await emit(["offloads","offload_items","report_receipts"]);
    await until(async()=>overviewCount(1)===before[1]+1,"Source batch did not refresh other session exactly once");await pages[0].waitForTimeout(500);
    if(overviewCount(0)!==before[0]||await editor.inputValue()!=="Unsaved draft stays")throw new Error("Realtime overwrote or refreshed active editor");
    await editor.press("Escape");await until(async()=>overviewCount(0)===before[0]+1,"Deferred refresh did not resume");
    if(!await roots[0].getByRole("checkbox",{name:"Select row DSP-1",exact:true}).isChecked())throw new Error("Refresh discarded same physical selection");
    await roots[0].getByText("Remote update",{exact:true}).waitFor();
    await pages[1].evaluate(()=>window.__status("CHANNEL_ERROR"));await pages[1].waitForTimeout(1300);
    const activeChannels=await pages[1].evaluate(()=>window.__channels.filter(c=>!c.removed).length);if(activeChannels!==1)throw new Error("Reconnect duplicated channels");
    const after=overviewCount(1);await pages[1].evaluate(()=>{window.__stopRealtime();window.__startTrucker();});await emit(["offloads"]);await pages[0].waitForTimeout(500);
    if(overviewCount(1)!==after||await pages[1].evaluate(()=>window.__channels.some(c=>!c.removed)))throw new Error("Logout/Trucker isolation failed");
    return {mockedTwoContexts:true,productionWrites:0,sourceBatchRequests:[1,1],draftPreserved:true,selectionPreserved:true,remoteResizeDeferred:true,reconnectActiveChannels:activeChannels,logoutIsolated:true,requestCounts:calls.map(c=>c.length),overviewRequests:calls.map(c=>c.filter(r=>r.path.endsWith("/operations/page")).length)};
  } catch(error) {
    const state=[];for(const fixture of pages)state.push(await fixture.evaluate(()=>({channels:window.__channels?.map(c=>({name:c.name,removed:c.removed})),route:document.querySelector('[data-ops-column="route"]')?.getBoundingClientRect().width,active:document.activeElement?.outerHTML.slice(0,220),editor:document.querySelector('td[data-cell-hover-disabled="true"] input,td[data-cell-hover-disabled="true"] textarea,td[data-cell-hover-disabled="true"] [role=combobox]')?.outerHTML.slice(0,200),text:document.querySelector('#realtime-fixture')?.textContent.slice(0,250)})).catch(()=>({})));
    throw new Error(error.message+" "+JSON.stringify({state,calls}));
  } finally {for(const context of contexts)await context.close();}
}
