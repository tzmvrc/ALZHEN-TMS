// Run against local Vite. All API calls are intercepted; no operational data is written.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 850 }, reducedMotion: 'reduce' });
  const p = await context.newPage();
  const errors = [], writes = [], progress = [];
  let revision = 0, failCommit = true, savedRows = [], cargoSaved = false, refreshed = 0, finished = false;
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const csv = 'Customer Name,Ship To,Province,City,Customer Model,Quantity,Total CBM,DR Number\n' +
    ['Acme,Store A,Cebu,Cebu City,MODEL-A,1,1,DR-A', 'Acme,Store A,Cebu,Cebu City,MODEL-B,1,1,DR-B', 'Acme,Store B,Cebu,Cebu City,MODEL-C,1,1,DR-C'].join('\n');
  const trucks = [1, 2].map(n => ({ id: `truck-${n}`, plate_number: `TRUCK-${n}`, truck_type: 'Van', capacity_cbm: 2, default_driver_id: `driver-${n}`, default_driver_name: `Driver ${n}`, status: 'ACTIVE' }));
  p.on('pageerror', error => errors.push(error.message));
  try {
    await p.route('**/src/context/AuthContext.tsx*', route => route.fulfill({ contentType: 'text/javascript', body: "export const useAuth=()=>({accessToken:'isolated-simple-trip',profile:{id:'admin',role:'ADMIN'}});" }));
    await p.route('**/api/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      if (req.method() !== 'GET') writes.push(path);
      let data = [];
      if (path.endsWith('/lookups/trucks')) data = trucks;
      else if (path.endsWith('/lookups/drivers')) data = [1, 2].map(n => ({ id: `driver-${n}`, full_name: `Driver ${n}` }));
      else if (path.endsWith('/truck-availability')) data = trucks.map(truck => ({ ...truck, availability: 'AVAILABLE', available_cbm: 2 }));
      else if (path.endsWith('/driver-availability')) data = [1, 2].map(n => ({ id: `driver-${n}`, availability: 'AVAILABLE' }));
      else if (path.endsWith('/draft')) data = { revision: ++revision };
      else if (path.endsWith('/import/preview')) {
        const { files } = req.postDataJSON();
        const rows = files.flatMap(file => file.rows.map(row => ({ ...row, filename: file.name, source_identity: `${file.name}:${row.line}`, document_hash: 'source', fingerprint: `${row.line}`, signature: `signed-${row.line}`, errors: [], warnings: [], duplicate: false, potential_duplicate: false })));
        const key = (name) => JSON.stringify(['acme', JSON.stringify([name.toLowerCase(), 'cebu', 'cebu city'])]);
        data = { rows, detected: rows.length, valid: rows.length, invalid: 0, duplicates: 0, potential_duplicates: 0, setup_required: false, history: {}, warehouse_matches: {}, store_matches: { [key('Store A')]: { status: 'matched', id: 'store-a' }, [key('Store B')]: { status: 'missing' } } };
      } else if (path.endsWith('/import/commit')) {
        if (failCommit) { failCommit = false; await route.fulfill({ status: 503, json: { success: false, message: 'Temporary save failure' } }); return; }
        await new Promise(resolve => setTimeout(resolve, 80));
        const body = req.postDataJSON();
        savedRows = body.rows.map(row => ({ source_identity: row.source_identity, status: 'imported', line_item_id: `line-${row.line}`, trip_id: 'trip-1', trip_created: true }));
        data = { batch_id: body.batch_id, rows: savedRows, history: {} };
      } else if (path.endsWith('/import/allocate')) { await new Promise(resolve => setTimeout(resolve, 80)); cargoSaved = true; data = { trip_id: 'trip-1' }; }
      else if (/\/import\/batches\/[^/]+$/.test(path)) data = { revision, outcomes: savedRows, history: {}, cargo_saved: cargoSaved ? { 'trip.csv': true } : {}, draft: {}, state: cargoSaved ? 'Completed' : 'Pending' };
      else if (req.method() !== 'GET') throw Error(`Unexpected write ${path}`);
      await route.fulfill({ status: 200, json: { success: true, data } });
    });
    await p.goto('http://127.0.0.1:5173/tests/table-fixture.html');
    await p.evaluate(async () => {
      await import('/src/index.css');
      const main = await (await fetch('/src/main.tsx')).text();
      const React = (await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default;
      const DOM = await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
      const { ToastProvider } = await import('/src/components/ui/Toast.tsx');
      const { default: Modal } = await import('/src/components/admin/BulkTripImport.tsx');
      const root = (DOM.createRoot ?? DOM.default.createRoot)(document.body.appendChild(document.createElement('div')));
      window.simpleTrip = { root, refreshed: 0, finished: false };
      function Shell() { const [open, setOpen] = React.useState(true); const close = () => { window.simpleTrip.finished = true; setOpen(false); }; return open ? React.createElement(Modal, { onClose: close, onComplete: close, onImported: () => { window.simpleTrip.refreshed++; } }) : null; }
      root.render(React.createElement(ToastProvider, null, React.createElement(Shell)));
    });
    await p.getByRole('dialog').waitFor();
    await p.locator('input[type=file]').setInputFiles({ name: 'trip.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await p.getByRole('button', { name: 'Preview rows' }).click();
    await p.getByText('3 of 3 rows ready').waitFor();
    assert(await p.getByRole('region', { name: 'CSV data table' }).locator('tbody tr').count() === 3, 'Actual CSV rows are missing');
    assert(await p.locator('.trip-simple-store').count() === 1, 'Matched stores were not hidden');
    assert((await p.locator('.trip-simple-store').innerText()).includes('Store B'), 'Wrong store needs attention');
    assert(await p.getByRole('tablist').count() === 0, 'Nested tabs remain');
    await p.screenshot({ path: '.playwright-mcp/add-trip-simple-preview.png' });
    await p.getByRole('button', { name: 'Next: Truck allocation' }).click();
    await p.getByRole('button', { name: 'Add truck' }).click();
    await p.locator('.truck-picker-row').filter({ hasText: 'TRUCK-1' }).click();
    await p.getByRole('button', { name: 'Add truck' }).click();
    await p.locator('.truck-picker-row').filter({ hasText: 'TRUCK-2' }).click();
    await p.waitForFunction(() => document.querySelectorAll('.trip-simple-truck').length === 2 && document.querySelector('.trip-simple-allocation')?.textContent.includes('Ready'));
    await p.screenshot({ path: '.playwright-mcp/add-trip-simple-trucks.png' });
    await p.getByRole('contentinfo').getByRole('button', { name: 'Review & save' }).click();
    assert(await p.locator('.review-preview-table').count() === 0, 'Old review table remains');
    assert(await p.getByRole('button', { name: 'Save trip' }).isEnabled(), 'Valid trip cannot be saved');
    await p.screenshot({ path: '.playwright-mcp/add-trip-simple-review.png' });
    await p.setViewportSize({ width: 390, height: 844 });
    const width = await p.getByRole('dialog').evaluate(dialog => ({ dialog: dialog.scrollWidth, client: dialog.clientWidth, document: document.documentElement.scrollWidth, viewport: innerWidth }));
    assert(width.dialog <= width.client + 1 && width.document <= width.viewport + 1, `Mobile overflow: ${JSON.stringify(width)}`);
    await p.screenshot({ path: '.playwright-mcp/add-trip-simple-mobile.png' });
    await p.setViewportSize({ width: 1280, height: 850 });
    await p.getByRole('button', { name: 'Save trip' }).click();
    await p.getByText(/Retry this batch; completed rows are protected/).waitFor();
    assert(await p.getByRole('dialog').count() === 1, 'Failed save closed the form');
    await p.evaluate(() => { window.simpleTrip.progress = []; const observer = new MutationObserver(() => { const value = document.querySelector('.trip-save-progress span')?.textContent; if (value && !window.simpleTrip.progress.includes(value)) window.simpleTrip.progress.push(value); }); observer.observe(document.body, { subtree: true, childList: true, characterData: true }); window.simpleTrip.observer = observer; });
    await p.getByRole('button', { name: 'Save trip' }).click();
    await p.waitForFunction(() => window.simpleTrip.finished === true);
    const state = await p.evaluate(() => window.simpleTrip);
    refreshed = state.refreshed; finished = state.finished; progress.push(...state.progress);
    assert(refreshed === 1 && finished, 'Successful save did not refresh and close');
    assert(await p.getByRole('status', { name: 'Trip added successfully!' }).count() > 0 || await p.getByText('Trip added successfully!').count() > 0, 'Success toast was not shown');
    assert(savedRows.length === 3 && cargoSaved, 'Rows or cargo were lost');
    assert(progress.some(value => { const n = Number.parseInt(value); return n > 0 && n < 100; }), `No real intermediate progress: ${progress.join(', ')}`);
    assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
    return { rows: savedRows.length, storesNeedingAttention: 1, trucks: 2, failedSavePreserved: true, successClosed: finished, refreshed, progress, writes };
  } finally { await context.close(); }
}
