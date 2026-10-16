// Isolated Playwright fixture. All API calls and AuthContext are intercepted;
// this exercises the actual form, not production authentication/database writes.
async (page) => {
  const results = [];
  for (const role of ["ADMIN", "TRUCKER"]) {
    const context = await page.context().browser().newContext();
    const fixture = await context.newPage();
    const writes = [];
    try {
      await fixture.route("**/src/context/AuthContext.tsx*", (route) => route.fulfill({ contentType: "text/javascript", body: 'export const useAuth = () => window.__testAuth ?? { user: null, profile: null, accessToken: null, loading: false }; export const AuthProvider = ({children}) => children;' }));
      await fixture.route("**/api/**", async (route) => {
        const request = route.request(), url = new URL(request.url());
        let data = [];
        if (url.pathname.endsWith("offload-transactions")) data = { rows: [1, 2].map((n) => ({ id: `123e4567-e89b-42d3-a456-00000000002${n}`, trip_id: "123e4567-e89b-42d3-a456-000000000010", trip_stop_id: `123e4567-e89b-42d3-a456-00000000002${n}`, dr_number: "DR-9", dispatch_number: "SHARED", warehouse: "Fixture Warehouse", destination: `Fixture Store ${n}`, driver_name: "Shared Driver", plate_number: "Shared Truck", route: `Fixture Warehouse → Fixture Store ${n}`, quantity: n, total_cbm: n + 0.5 })), hasMore: false, page: 1 };
        if (url.pathname.endsWith("/reporters")) data = [{ id: "123e4567-e89b-42d3-a456-000000000001", name: "Fixture Reporter", role }];
        if (request.method() === "POST") {
          if (!url.pathname.endsWith("/offloads")) throw new Error("Unexpected write endpoint");
          writes.push(request.postDataJSON()); data = { id: "123e4567-e89b-42d3-a456-000000000099" };
        }
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data }) });
      });
      await fixture.goto("http://localhost:5173/login");
      await fixture.evaluate(async (role) => {
        await import("/src/index.css");
        window.__testAuth = { profile: { id: "123e4567-e89b-42d3-a456-000000000001", role, first_name: "Fixture", last_name: "Reporter" } };
        const code = await (await fetch("/src/components/admin/OperationsEventSubmissionForm.tsx")).text();
        const main = await (await fetch("/src/main.tsx")).text();
        const reactPath = code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1];
        const domPath = main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1];
        const module = await import(reactPath), React = module.default ?? module, DOM = await import(domPath);
        const { default: Form } = await import("/src/components/admin/OperationsEventSubmissionForm.tsx");
        const container = document.createElement("div"); container.id = "dr-form-fixture";
        Object.assign(container.style, { position: "fixed", inset: "0", zIndex: "2000", background: "white", overflow: "auto" }); document.body.append(container);
        window.__formEvents = { refreshed: 0, completed: 0 };
        (DOM.createRoot ?? DOM.default.createRoot)(container).render(React.createElement(Form, { token: "fixture-token", tripOptions: [], tripsLoading: false, onSubmitted: () => { window.__formEvents.refreshed++; }, onComplete: () => { window.__formEvents.completed++; } }));
      }, role);
      const root = fixture.locator("#dr-form-fixture");
      await root.getByRole("button", { name: "Select DR Number", exact: true }).click();
      const option = fixture.getByRole("option", { name: "DR-9 — Fixture Warehouse — Fixture Store 2", exact: true });
      await option.waitFor();
      const stacking = await option.evaluate((element) => { const box = element.closest('[role="listbox"]'), css = getComputedStyle(box); return { parent: css.zIndex, position: css.position, pointerEvents: css.pointerEvents, rect: JSON.stringify(box.getBoundingClientRect()), panel: getComputedStyle(document.getElementById("dr-form-fixture")).zIndex, point: document.elementFromPoint(element.getBoundingClientRect().x + 20, element.getBoundingClientRect().y + 10)?.outerHTML.slice(0, 180) }; });
      if (Number(stacking.parent) < Number(stacking.panel)) throw new Error(JSON.stringify(stacking));
      await option.click();
      if (await root.getByLabel("Quantity", { exact: true }).inputValue() !== "2") throw new Error("Quantity autofill mismatch");
      if (await root.getByLabel("Total CBM", { exact: true }).inputValue() !== "2.5") throw new Error("CBM autofill mismatch");
      if (await root.getByLabel("Driver", { exact: true }).inputValue() !== "Shared Driver") throw new Error("Assignment mismatch");
      const date = root.getByLabel("Report Date (Asia/Manila)", { exact: false });
      if (await date.isEditable() !== (role === "ADMIN")) throw new Error("Report Date permission mismatch");
      await root.getByLabel("Quantity", { exact: true }).fill("0");
      await root.getByLabel("Total CBM", { exact: true }).fill("1.25");
      await root.getByLabel("Reason", { exact: false }).fill("Fixture issue");
      await root.getByLabel("Remarks", { exact: true }).fill("Fixture remark");
      await root.getByRole("button", { name: "Add Report", exact: true }).click();
      await root.getByText("Report submitted.", { exact: true }).waitFor();
      if (writes.length !== 1 || writes[0].trip_stop_id !== "123e4567-e89b-42d3-a456-000000000022" || writes[0].quantity !== 0 || writes[0].total_cbm !== 1.25 || writes[0].trip_id !== "123e4567-e89b-42d3-a456-000000000010") throw new Error("Incorrect transaction submission");
      if (role === "TRUCKER" && ("reported_at" in writes[0] || "reported_by" in writes[0])) throw new Error("Trucker overrode report metadata");
      const events = await fixture.evaluate(() => window.__formEvents);
      if (events.refreshed !== 1 || events.completed !== 1) throw new Error("Completion did not refresh exactly once");
      results.push({ role, requests: writes.length, transaction: writes[0].trip_stop_id, quantity: writes[0].quantity, totalCbm: writes[0].total_cbm, events, stacking });
    } finally { await context.close(); }
  }
  return { isolated: true, productionWrites: 0, results };
}
