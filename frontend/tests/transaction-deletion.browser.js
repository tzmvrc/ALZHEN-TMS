// Isolated Playwright MCP fixture. Every API request and AuthContext intercepted.
// Never authenticates against Supabase or deletes real operational records.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  const fixture = await context.newPage();
  const deleted = [], requests = [];
  const errors = [];
  fixture.on("pageerror", (error) => errors.push(error.message));
  let protectedRecord = false, removed = false, pending = false;
  const trip = "123e4567-e89b-42d3-a456-000000000010";
  const stop = "123e4567-e89b-42d3-a456-000000000012";
  const job = "123e4567-e89b-42d3-a456-000000000099";
  try {
    await fixture.route("**/src/context/AuthContext.tsx*", (route) => route.fulfill({ contentType: "text/javascript", body: 'const auth = { profile: { id: "fixture-admin", role: "ADMIN" }, accessToken: "fixture-session", refreshSession: async () => {} }; export const useAuth = () => auth; export const AuthProvider = ({children}) => children; export const getRoleBasedHomePath = () => "/login";' }));
    await fixture.route("**/api/**", async (route) => {
      const request = route.request(), url = new URL(request.url());
      requests.push({ method: request.method(), path: url.pathname });
      let data = [];
      if (url.pathname.endsWith("/transaction-cleanup")) data = pending ? [{ id: job, trip_id: trip, trip_stop_id: stop, transaction_id: stop }] : [];
      if (url.pathname.includes("/transaction-cleanup/") && request.method() === "POST") { pending = false; data = { cleanup_pending: false }; }
      if (url.pathname.endsWith("/dispatch-monitoring/columns")) data = { columns: [
        { key: "dispatch_number", title: "Dispatch Number", type: "text" },
        { key: "transaction_dr_number", title: "DR Number", type: "text" },
        { key: "store_name", title: "Store", type: "text" },
      ] };
      if (url.pathname.endsWith("/dispatch-monitoring")) data = { rows: [1, 2, 3].filter((n) => !(removed && n === 2)).map((n) => ({ trip_id: trip, trip_stop_id: `123e4567-e89b-42d3-a456-00000000001${n}`, dispatch_number: `DSP-${n}`, transaction_dr_number: `DR-${n}`, store_name: `Store ${n}` })), pagination: { page: 1, limit: 50, total: removed ? 2 : 3, totalPages: 1 } };
      if (request.method() === "DELETE") {
        if (url.pathname !== `/api/trips/${trip}/stops/${stop}`) throw new Error("Wrong physical transaction deletion URL");
        deleted.push(url.pathname);
        if (protectedRecord) return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ success: false, message: "Conversion history protects this transaction." }) });
        removed = true; pending = true;
        data = { operation_id: job, trip_id: trip, trip_stop_id: stop, transaction_id: stop, cleanup_pending: true };
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data }) });
    });
    await fixture.goto("http://localhost:5173/login");
    await fixture.evaluate(async () => {
      await import("/src/index.css");
      const code = await (await fetch("/src/components/admin/ReportDataView.tsx")).text();
      const main = await (await fetch("/src/main.tsx")).text();
      const reactPath = code.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1];
      const domPath = main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1];
      const reactModule = await import(reactPath), React = reactModule.default ?? reactModule, DOM = await import(domPath);
      const routerPath = code.match(/from ["']([^"']*react-router-dom\.js[^"']*)["']/)[1];
      const { MemoryRouter } = await import(routerPath);
      const { default: View } = await import("/src/components/admin/ReportDataView.tsx");
      const container = document.createElement("div"); container.id = "transaction-delete-fixture";
      Object.assign(container.style, { position: "fixed", inset: "0", zIndex: "2000", background: "white", overflow: "auto" }); document.body.append(container);
      (DOM.createRoot ?? DOM.default.createRoot)(container).render(React.createElement(MemoryRouter, null, React.createElement(View, { initialReport: "dispatch-monitoring", transactionView: true, showReportPicker: false })));
    });
    const root = fixture.locator("#transaction-delete-fixture");
    await root.getByRole("checkbox", { name: "Select row DSP-2", exact: true }).check();
    await root.getByRole("button", { name: "Permanently delete selected transaction", exact: true }).click();
    const dialog = root.getByRole("alertdialog");
    await dialog.getByText("DR-2", { exact: false }).waitFor();
    if (!(await dialog.textContent()).includes("Store 2")) throw new Error("Destination missing from confirmation");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    if (deleted.length) throw new Error("Cancel performed deletion");
    protectedRecord = true;
    await root.getByRole("button", { name: "Permanently delete selected transaction", exact: true }).click();
    await dialog.getByRole("button", { name: "Permanently delete", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "Conversion history" }).waitFor();
    if (removed) throw new Error("Protected record deleted");
    protectedRecord = false;
    await dialog.getByRole("button", { name: "Permanently delete", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await root.getByRole("checkbox", { name: "Select row DSP-2", exact: true }).waitFor({ state: "detached" });
    await root.getByRole("checkbox", { name: "Select row DSP-1", exact: true }).waitFor();
    await root.getByRole("checkbox", { name: "Select row DSP-3", exact: true }).waitFor();
    await root.getByRole("button", { name: "Retry image cleanup", exact: true }).click();
    await root.getByRole("button", { name: "Retry image cleanup", exact: true }).waitFor({ state: "detached" });
    if (await root.getByRole("button", { name: "Permanently delete selected transaction", exact: true }).count()) throw new Error("Deleted selection remained active");
    if (await root.getByText("Archived transactions", { exact: true }).count()) throw new Error("Archive interface still present");
    return { isolated: true, productionWrites: 0, deletionRequests: deleted.length, protectedFailure: true, cancellation: true, exactStop: stop, siblingsPreserved: true, cleanupRetried: true, requests: requests.length };
  } catch (error) {
    throw new Error(`${error.message}\nFixture: ${await fixture.locator("#transaction-delete-fixture").innerText().catch(() => "not mounted")}\nRequests: ${JSON.stringify(requests)}\nErrors: ${JSON.stringify(errors)}`);
  } finally { await context.close(); }
}
