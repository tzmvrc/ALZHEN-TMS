// Playwright MCP fixture: pass this file to browser_run_code_unsafe.
// Uses an isolated browser context and intercepts EVERY /api request.
// It never authenticates or writes to the operational database.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  const fixture = await context.newPage();
  const deleted = [], calls = [], widths = new Map(), pendingCleanup = new Map(); let recovered=false,uploads=0;
  try {
    await fixture.route("**/api/**", async (route) => {
      const request = route.request(), url = new URL(request.url());
      if(url.pathname.endsWith('/receipts')) {
        if(request.method()==='POST') {
          if(request.headers()['x-upload-request-id']!=='123e4567-e89b-42d3-a456-000000000077')throw Error('Wrong recovery identity');
          if(!url.pathname.includes('/offload/123e4567-e89b-42d3-a456-000000000001/'))throw Error('Wrong physical report');
          uploads++;recovered=true;
          return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({success:true,data:{id:'receipt-own'}})});
        }
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:[
          {id:'receipt-own',file_name:'original.png',mime_type:'image/png',file_size_bytes:9,upload_status:recovered?'READY':'PENDING',upload_request_id:recovered?undefined:'123e4567-e89b-42d3-a456-000000000077',signed_url:recovered?'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBkcAAAAASUVORK5CYII=':''},
          {id:'receipt-other',file_name:'other.png',mime_type:'image/png',file_size_bytes:9,upload_status:'PENDING',signed_url:''}
        ]})});
      }

      calls.push({ method: request.method(), path: url.pathname });
      if (url.pathname.endsWith("/report-cleanup")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [...pendingCleanup.values()] }) });
      if (url.pathname.includes("/report-cleanup/") && request.method() === "POST") { pendingCleanup.clear(); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { cleanup_pending: false } }) }); }
      if (url.pathname.includes("/table-layouts/")) {
        if (request.method() === "PATCH") { const input = request.postDataJSON(), column = url.pathname.split("/").pop(); const row = { column_key: column, width_px: input.width_px, revision: input.expected_revision + 1 }; widths.set(column, row); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: row }) }); }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [...widths.values()] }) });
      }
      if(url.pathname.endsWith("/operations/reports/delete")){
        const input=request.postDataJSON();if(input.current_password!=="fixture-password")throw Error("Missing current-user password");
        const outcomes=[];
        for(const target of input.targets){
          const id=target.record_id;
          if(id.endsWith("2")){outcomes.push({...target,success:false,message:"This protected historical report cannot be deleted."});continue;}
          deleted.push(id);await fixture.evaluate(id=>window.__fixtureDeleted.add(id),id);
          const operationId="123e4567-e89b-42d3-a456-000000000099";
          if(id.endsWith("3"))pendingCleanup.set(operationId,{id:operationId,offload_id:id,state:"PENDING_STORAGE",attempts:1});
          outcomes.push({...target,success:true,result:{record_id:id,source_type:"OFFLOAD",cleanup_pending:id.endsWith("3"),operation_id:operationId}});
        }
        return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({success:true,data:{outcomes}})});
      }
      return route.fulfill({ status: url.pathname.includes("/auth/") ? 401 : 200, contentType: "application/json", body: JSON.stringify({ success: !url.pathname.includes("/auth/"), data: [], message: "Fixture session only" }) });
    });
    await fixture.goto("http://localhost:5173/tests/table-fixture.html");
    await fixture.evaluate(async () => {
      await import("/src/index.css");
      const code = await (await fetch("/src/components/admin/OperationsReportsView.tsx")).text();
      const main = await (await fetch("/src/main.tsx")).text();
      const reactPath = code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1];
      const domPath = main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1];
      const reactModule = await import(reactPath), React = reactModule.default ?? reactModule, DOM = await import(domPath);
      const { OperationsEventsTable } = await import("/src/components/admin/OperationsReportsView.tsx");
      const makeRow = (n) => {
        const id = "123e4567-e89b-42d3-a456-" + String(n).padStart(12, "0");
        return { id: "offload:" + id, source_type: "OFFLOAD", source_record_id: id, trip_id: "123e4567-e89b-42d3-a456-000000000010", trip_stop_id: "123e4567-e89b-42d3-a456-" + String(20 + n).padStart(12, "0"),
          trip_number: "Fixture trip", dispatch_number: "DSP-FIXTURE-" + n, date: "2026-10-15T00:00:00Z", plate_number: "FIXTURE", driver_name: "Fixture Driver", route: "Fixture Route", dr_number: null, quantity: null, quantity_scope: null, total_cbm: null, report_type: "Offload", report_types: ["Offload"], event_type_records: [{ id, source_type: "OFFLOAD", event_type: "Offload" }], backload_records: [], offload_records: [{ id, trip_id: "123e4567-e89b-42d3-a456-000000000010", trip_stop_id: "123e4567-e89b-42d3-a456-" + String(20+n).padStart(12, "0"), reason: "Fixture reason", number_of_boxes: null, comments: "Fixture comment", items: [] }], line_items: [], remarks: "Fixture comment", reason: "Fixture reason", reported_by: "Fixture User", stop_sequence: n, scope_label: "Fixture transaction", assignment_id: null, loading_report_id: null, unloading_report_id: null, loading_timestamps: null, unloading_timestamps: null };
      };
      const initial = [makeRow(1), makeRow(2), makeRow(3)];
      window.__fixtureDeleted = new Set();
      const container = document.createElement("div"); container.id = "ops-browser-fixture";
      Object.assign(container.style, { position: "fixed", inset: "0", zIndex: "99999", background: "white", overflow: "auto", padding: "20px" }); document.body.append(container);
      function Fixture() {
        const [rows, setRows] = React.useState([]), [loading, setLoading] = React.useState(true), [version, setVersion] = React.useState(0);
        window.__fixtureLoad = () => { setRows(initial.map((row) => ({ ...row }))); setLoading(false); };
        window.__fixtureRefresh = () => setRows((current) => current.map((row) => ({ ...row })));
        window.__fixtureRemount = () => setVersion((current) => current + 1);
        return React.createElement(OperationsEventsTable, { key: version, rows, loading, hasLoaded: !loading, loadError: null, token: "isolated-fixture", profileId: "isolated-fixture", canManageReports: true, onSaved: async () => setRows((current) => current.filter((row) => !window.__fixtureDeleted.has(row.source_record_id))), toolbarActions: React.createElement("button", { type: "button" }, "Add Report") });
      }
      (DOM.createRoot ?? DOM.default.createRoot)(container).render(React.createElement(Fixture));
    });
    await fixture.waitForFunction(()=>Boolean(window.__fixtureLoad));
    await fixture.evaluate(()=>window.__fixtureLoad());
    const root=fixture.locator('#ops-browser-fixture');
    await root.getByRole('button',{name:'View Details',exact:true}).first().click();
    const input=fixture.locator('input[type="file"]');
    await input.waitFor();
    if(await input.count()!==1)throw Error('Another uploader must not get a recovery control');
    await input.setInputFiles({name:'wrong.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10,1])});
    await fixture.getByText('Choose the original image with its original filename.').waitFor();
    if(uploads)throw Error('Wrong filename caused a write');
    await input.setInputFiles({name:'original.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10,1])});
    await input.waitFor({state:'detached'});
    if(uploads!==1||!recovered)throw Error('Image recovery failed');
    if(await fixture.locator('img[src=""]').count())throw Error('Pending image used an empty image URL');
    return {mocked:true,productionWrites:0,ownUploadRecovery:true,otherUploaderNoRecovery:true,wrongFilenameRejected:true,exactRequestAndReport:true,readyAfterRecovery:true};
  } finally {await context.close();}
}
