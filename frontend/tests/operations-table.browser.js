// Playwright MCP fixture: pass this file to browser_run_code_unsafe.
// Uses an isolated browser context and intercepts EVERY /api request.
// It never authenticates or writes to the operational database.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  const fixture = await context.newPage();
  const deleted = [], calls = [], widths = new Map(), pendingCleanup = new Map();
  try {
    await fixture.route("**/api/**", async (route) => {
      const request = route.request(), url = new URL(request.url());
      calls.push({ method: request.method(), path: url.pathname });
      if (url.pathname.endsWith("/offload-cleanup")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [...pendingCleanup.values()] }) });
      if (url.pathname.includes("/offload-cleanup/") && request.method() === "POST") { pendingCleanup.clear(); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { cleanup_pending: false } }) }); }
      if (url.pathname.includes("/table-layouts/")) {
        if (request.method() === "PATCH") { const input = request.postDataJSON(), column = url.pathname.split("/").pop(); const row = { column_key: column, width_px: input.width_px, revision: input.expected_revision + 1 }; widths.set(column, row); return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: row }) }); }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [...widths.values()] }) });
      }
      if (request.method() === "DELETE") {
        const id = url.pathname.split("/").pop();
        if (!["123e4567-e89b-42d3-a456-000000000001", "123e4567-e89b-42d3-a456-000000000002", "123e4567-e89b-42d3-a456-000000000003"].includes(id)) throw new Error("Unexpected delete identity");
        if (id.endsWith("2")) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ success: false, message: "This protected historical report cannot be deleted." }) });
        deleted.push(id);
        await fixture.evaluate((id) => window.__fixtureDeleted.add(id), id);
        const operationId = "123e4567-e89b-42d3-a456-000000000099";
        if (id.endsWith("3")) pendingCleanup.set(operationId,{ id: operationId, offload_id: id, state: "PENDING_STORAGE", attempts: 1 });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { record_id: id, source_type: "OFFLOAD", cleanup_pending: id.endsWith("3"), operation_id: operationId } }) });
      }
      return route.fulfill({ status: url.pathname.includes("/auth/") ? 401 : 200, contentType: "application/json", body: JSON.stringify({ success: !url.pathname.includes("/auth/"), data: [], message: "Fixture session only" }) });
    });
    await fixture.route('**/login',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text()).replace('<script type="module" src="/src/main.tsx"></script>','')});});
    await fixture.goto("http://localhost:5173/login");
    await fixture.evaluate(async () => {
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
    const root = fixture.locator("#ops-browser-fixture");
    await root.getByRole("status", { name: "Loading report table" }).waitFor();
    await fixture.evaluate(() => window.__fixtureLoad());
    const finder = root.getByRole("combobox", { name: "Search rows or columns" });
    const originalOrder = await root.locator("tbody tr[aria-selected]").evaluateAll((rows) => rows.map((row) => row.textContent));
    await finder.fill("rou"); await root.getByRole("option", { name: "Route", exact: true }).click();
    await fixture.waitForTimeout(400);
    const highlight = await root.locator('[data-ops-column="route"]').evaluate((cell) => getComputedStyle(cell).boxShadow);
    if (!highlight.includes("inset")) throw new Error("Column Finder did not highlight Route");
    const afterOrder = await root.locator("tbody tr[aria-selected]").evaluateAll((rows) => rows.map((row) => row.textContent));
    if (JSON.stringify(originalOrder) !== JSON.stringify(afterOrder)) throw new Error("Column Finder changed rows");
    await root.getByRole("button", { name: "Clear search", exact: true }).click();
    const edit = root.getByRole("button", { name: "Edit selected row", exact: true }), remove = root.getByRole("button", { name: "Delete selected reports", exact: true });
    if (await edit.count() !== 0 || await remove.count() !== 0) throw new Error("Toolbar actions must be hidden without checked rows");
    await root.getByRole("checkbox", { name: "Select row DSP-FIXTURE-1", exact: true }).check();
    await root.getByRole("checkbox", { name: "Select row DSP-FIXTURE-2", exact: true }).check();
    if (await edit.count() !== 0 || await remove.count() !== 1) throw new Error("Multiple selection must hide Edit and retain Delete");
    await root.getByRole("checkbox", { name: "Select row DSP-FIXTURE-2", exact: true }).uncheck();
    await edit.click();
    await root.getByRole("dialog", { name: "Edit report row" }).waitFor();
    await root.getByRole("dialog", { name: "Edit report row" }).getByRole("button", { name: "Cancel", exact: true }).click();
    await remove.click();
    await root.getByRole("alertdialog").getByText("123e4567-e89b-42d3-a456-000000000001", { exact: false }).waitFor();
    await root.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
    if (deleted.length) throw new Error("Cancel deleted a report");
    const search = finder;
    await search.fill("no-match"); await search.press("Enter");
    if (await remove.count()) throw new Error("Hidden selection retained actions");
    await search.fill(""); await search.press("Enter");
    if (await remove.count()) throw new Error("Old selection resurrected");
    await root.getByRole("checkbox", { name: "Select row DSP-FIXTURE-1", exact: true }).check();
    await fixture.evaluate(() => window.__fixtureRefresh());
    await fixture.waitForTimeout(50);
    if (await remove.count() !== 1 || !await root.getByRole("checkbox", { name: "Select row DSP-FIXTURE-1", exact: true }).isChecked()) throw new Error("Same-identity refresh discarded a valid selection");
    await root.getByRole("checkbox", { name: "Select row DSP-FIXTURE-1", exact: true }).check();
    await remove.click();
    await root.getByRole("alertdialog").getByRole("button", { name: "Delete 1 report", exact: true }).click();
    await root.getByText("1 of 1 report deleted.", { exact: true }).waitFor();
    if (await remove.count() || deleted.length !== 1 || deleted[0].endsWith("2")) throw new Error("Delete scope/reset failed");
    await root.getByRole("checkbox", { name: "Select row DSP-FIXTURE-2", exact: true }).check();
    await remove.click();
    await root.getByRole("alertdialog").getByRole("button", { name: "Delete 1 report", exact: true }).click();
    await root.getByRole("status").filter({ hasText: /protected historical report/ }).waitFor();
    if (!await root.getByRole("checkbox", { name: "Select row DSP-FIXTURE-2", exact: true }).isVisible()) throw new Error("Protected row vanished");
    await root.getByRole("button", { name: "Clear selection", exact: true }).click();
    await root.getByRole("checkbox", { name: "Select row DSP-FIXTURE-3", exact: true }).check();
    await remove.click();
    await root.getByRole("alertdialog").getByRole("button", { name: "Delete 1 report", exact: true }).click();
    await root.getByRole("region", { name: "Pending Offload image cleanup" }).waitFor();
    await root.getByRole("button", { name: "Retry image cleanup", exact: true }).click();
    await root.getByRole("region", { name: "Pending Offload image cleanup" }).waitFor({ state: "detached" });
    const handle = root.getByRole("separator", { name: "Resize Date", exact: true });
    const box = await handle.boundingBox();
    await fixture.mouse.move(box.x + box.width / 2, box.y + 10); await fixture.mouse.down(); await fixture.mouse.move(box.x + 80, box.y + 10); await fixture.mouse.up();
    await fixture.waitForTimeout(100);
    const width = await fixture.evaluate(() => JSON.parse(localStorage.getItem("alzhen:operations-report-column-layout:v1:isolated-fixture")).widths.date);
    if (!(width > 180)) throw new Error("Resize did not persist");
    await fixture.evaluate(() => window.__fixtureRemount()); await fixture.waitForTimeout(100);
    const restored = await root.locator("colgroup col").nth(1).evaluate((col) => parseFloat(col.style.width));
    if (Math.abs(restored-width) > 1) throw new Error("Saved width did not restore");
    return { fixtureOnly: true, productionWrites: 0, checks: ["skeleton", "conditional toolbar", "Column Finder", "Edit modal", "Delete cancel", "filter/refresh isolation", "physical-ID deletion", "selection reset", "protected historical error", "pending cleanup/retry", "column resize/persistence"], deleteRequests: calls.filter((call) => call.method === "DELETE"), savedDateWidth: width };
  } finally { await context.close(); }
}
