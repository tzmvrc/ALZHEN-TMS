// Run with Vite and mocked APIs. Pass an optional second argument for a local CSV file.
async (page, csvPath) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: 'reduce' });
  const p = await context.newPage(), errors = [], commits = [], drafts = new Map(), checks = [];
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const columns = await (await p.request.get('http://127.0.0.1:5173/tests/master-list-columns.fixture.json')).json();
  let historical = false, previewRows = [], previousHistory = {}, manualPayload = null, rejectNextCommit = true, addressSetupRejected = false;
  const catalog = [
    { id: 'truck-a', plate_number: 'UNIT-A', truck_type: 'Wing Van', capacity_cbm: 54, default_driver_id: 'driver-a', default_driver_name: 'Ada Cruz', status: 'ACTIVE' },
    { id: 'truck-b', plate_number: 'UNIT-B', truck_type: 'Van', capacity_cbm: 24, default_driver_id: 'driver-b', default_driver_name: 'Lin Santos', status: 'ACTIVE' },
    { id: 'truck-m', plate_number: 'UNIT-M', truck_type: 'Van', capacity_cbm: 24, default_driver_name: 'Sam Reyes', status: 'MAINTENANCE' },
  ];
  const batchSummary = (id, state) => ({ id, state: 'Pending', revision: state.revision, imported: state.outcomes.length, failed: 0, awaiting_allocation: 0, last_error: null, updated_at: '2026-10-23T00:00:00Z' });
  p.on('pageerror', error => errors.push(error.message));
  try {
    await p.route('**/src/context/AuthContext.tsx*', route => route.fulfill({ contentType: 'text/javascript', body: "export const useAuth=()=>({accessToken:'review-fixture',profile:{id:'admin',role:'ADMIN'}});" }));
    await p.route('**/api/**', async route => {
      try {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        let data = [];
        if (path.endsWith('/columns')) { assert(url.searchParams.get('source_lines') === 'true', 'Wrong master-list projection'); data = { report: 'dispatch-monitoring', columns }; }
        else if (path.endsWith('/next-dispatch-number')) data = { dispatch_number: 'DISPATCH2610230001', trip_reference: 'TRIP2610230001', trip_reference_status: 'ready' };
        else if (path.endsWith('/truck-availability')) data = catalog.filter(truck => truck.status === 'ACTIVE').map(truck => ({ ...truck, available_cbm: truck.capacity_cbm, availability: truck.id === 'truck-b' ? 'CONFLICT' : 'AVAILABLE', reason: truck.id === 'truck-b' ? 'Booked: TRIP261020-3, Oct 23–24' : 'No conflicting scheduled assignment' }));
        else if (path.endsWith('/driver-availability')) data = [{ id: 'driver-a', availability: 'AVAILABLE', reason: '' }, { id: 'driver-b', availability: 'AVAILABLE', reason: '' }];
        else if (path.endsWith('/lookups/trucks')) data = catalog;
        else if (path.endsWith('/lookups/drivers')) data = [{ id: 'driver-a', full_name: 'Ada Cruz' }, { id: 'driver-b', full_name: 'Lin Santos' }];
        else if (path.endsWith('/lookups/stores')) data = [{ id: 'store', name: 'Store', customer_id: 'customer', city: 'Manila', province: 'Metro Manila', address: '', latitude: null, longitude: null, location_verified: false }];
        else if (path.endsWith('/lookups/products')) data = [...new Set(previewRows.map(row => row.values.customer_model).filter(Boolean))].map(model => ({ id: `product-${model}`, name: model, sku: model, model_code: model }));
        else if (path.endsWith('/import/location')) data = { status: 'found', candidates: [{ display_name: `${url.searchParams.get('ship_to')}, Tagbilaran, Bohol`, latitude: 9.65, longitude: 123.85, provinces: ['Bohol'], cities: ['Tagbilaran'] }], message: '', source: 'geoapify' };
        else if (path.endsWith('/import/preview')) {
          const { files } = request.postDataJSON();
          previewRows = files.flatMap(file => file.rows.map(row => ({ ...row, filename: file.name, errors: [], warnings: [], source_identity: `${file.name}:${row.line}`, fingerprint: 'fixture', signature: 'fixture', document_hash: 'fixture', duplicate: false, potential_duplicate: false })));
          previousHistory = historical ? Object.fromEntries(previewRows.map(row => [row.source_identity, { status: 'missing', batch_id: 'old-batch', source_row: row.line, model: row.values.customer_model, line_item_id: null, imported_at: '2026-10-01T00:00:00Z' }])) : {};
          data = { rows: previewRows, detected: previewRows.length, valid: previewRows.length, invalid: 0, duplicates: 0, potential_duplicates: 0, setup_required: false, history: previousHistory, warehouse_matches: Object.fromEntries([...new Set(previewRows.map(row => row.values.source_warehouse).filter(Boolean))].map(source => [source, { status: 'missing', candidates: [] }])) };
        } else if (path.endsWith('/draft')) {
          const body = request.postDataJSON(), id = path.split('/').at(-2), old = drafts.get(id);
          drafts.set(id, { draft: body.draft, revision: body.revision + 1, outcomes: old?.outcomes || [], history: old?.history || previousHistory }); data = { revision: body.revision + 1 };
        } else if (path.endsWith('/import/batches')) data = [...drafts].map(([id, state]) => batchSummary(id, state));
        else if (/\/import\/batches\/[^/]+$/.test(path)) { const id = path.split('/').at(-1), state = drafts.get(id); data = { ...batchSummary(id, state), draft: state.draft, outcomes: [...state.outcomes, ...Object.entries(state.history || {}).filter(([identity, item]) => item.status === 'missing' && !state.outcomes.some(row => row.source_identity === identity)).map(([identity]) => ({ source_identity: identity, status: 'failed', error: 'Previously imported product is missing.' }))], history: state.history, cargo_saved: {} }; }
        else if (path.endsWith('/master-data/warehouses') && request.method() === 'POST') {
          const body = request.postDataJSON(); assert(body.name === 'Cebu SQ', 'CSV warehouse creation lost source name');
          data = { id: 'created-cebu', ...body };
        } else if (path.endsWith('/import/commit')) {
          if (rejectNextCommit) { rejectNextCommit = false; await route.fulfill({ status: 503, json: { success: false, message: 'Saving imported trip details requires approval and application of 2026_10_23_proposed_import_trip_details.sql. No rows in this chunk were saved.', error: { code: 'IMPORT_TRIP_DETAILS_SETUP_REQUIRED' } } }); return; }

          const body = request.postDataJSON();
          if (Object.values(body.location_resolutions).some(location => location.verified === true)) {
            addressSetupRejected = true;
            await route.fulfill({ status: 503, json: { success: false, message: 'Trip-only address saving needs an administrator update. No new rows saved.', error: { code: 'TRIP_DELIVERY_LOCATION_SETUP_REQUIRED' } } }); return;
          }
          assert(!('review_annotations' in body), 'Invented annotation field in commit contract');
          for (const row of body.rows) {
            assert(JSON.stringify(row.values) === JSON.stringify(previewRows.find(source => source.source_identity === row.source_identity).values), 'Original source values changed');
            const location = body.location_resolutions[row.source_identity];
            assert(location.verified === false && location.latitude === '' && location.longitude === '', 'Unmatched location gained fake coordinates');
            assert(location.update_store_location === false && location.address.length > 0, 'Missing trip text or unauthorized store-master update');
            if (historical) assert(location.restore_missing_source === true, 'Recovery was silently approved or sent unapproved');
          }
          commits.push(body);
          data = { batch_id: body.batch_id, rows: body.rows.map(row => ({ source_identity: row.source_identity, status: 'imported', trip_id: 'trip', line_item_id: `line-${row.line}`, trip_created: true, trip_reference: 'TRIP2610230001' })), history: Object.fromEntries(body.rows.map(row => [row.source_identity, { status: 'live', batch_id: body.batch_id, line_item_id: `line-${row.line}`, imported_at: '2026-10-23T00:00:00Z' }])) };
          const state = drafts.get(body.batch_id); state.outcomes.push(...data.rows); state.history = { ...state.history, ...data.history };
        } else if (path.endsWith('/import/allocate')) data = { trip_id: 'trip' };
        else assert(request.method() === 'GET', `Unexpected write: ${path}`);
        await route.fulfill({ status: 200, json: { success: true, data } });
      } catch (error) { errors.push(error.message); await route.fulfill({ status: 500, json: { success: false, message: error.message } }); }
    });
    await p.goto('http://127.0.0.1:5173/tests/table-fixture.html');
    async function mount(mode = 'csv') {
      await p.evaluate(async mode => {
        await import('/src/index.css');
        const main = await (await fetch('/src/main.tsx')).text(), React = (await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default, DOM = await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
        window.reviewRoot?.unmount();
        const root = (DOM.createRoot ?? DOM.default.createRoot)(document.body.appendChild(document.createElement('div'))); window.reviewRoot = root;
        const { default: Modal } = await import(mode === 'csv' ? '/src/components/admin/BulkTripImport.tsx' : '/src/components/admin/AddTripForm.tsx');
        root.render(React.createElement(Modal, { initialTripDetails: mode === 'csv' ? { trip_type_id: null, trip_type_name: null, status: 'PLANNED', loading_date: null, estimated_delivery_date: null, remarks: null, origin_warehouse_id: null } : undefined, onClose: () => root.unmount(), onImported: () => {}, onSubmit: async payload => { window.manualReviewPayload = payload; } }));
      }, mode);
      await p.getByRole('dialog').waitFor();
    }
    async function upload() {
      if (csvPath) await p.locator('input[type=file]').setInputFiles(csvPath);
      else { const csv = 'Customer Name,Ship To,Province,City,Customer Model,Quantity,Total CBM,DR Number,PH TRUCK NAME,Warehouse\n' + Array.from({ length: 56 }, (_, n) => `Customer,Store ${n % 4},Bohol,Tagbilaran,S45H,1,0.5,DR-${n},PHTRUCK202609100299,Cebu SQ`).join('\n'); await p.locator('input[type=file]').setInputFiles({ name: 'Cebu trip request 1.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) }); }
      await p.getByRole('button', { name: 'Check CSV', exact: true }).click();
      await p.getByRole('button', { name: 'Import CSV', exact: true }).click();
    }
    async function review() {
      // Complete the new guided UI without fabricating optional booking fields.
      await p.getByRole('tab', { name: 'Details', exact: true }).click();
      const warehouses = p.locator('summary').filter({ hasText: /^Warehouses/ });
      if (!await warehouses.evaluate(el=>el.parentElement.open)) await warehouses.click();
      const add = p.getByRole('button', { name: /Add.*Cebu SQ.*as a warehouse/ });
      if (await add.count()) { await add.click(); await p.getByRole('dialog', { name: 'Add warehouses', exact: true }).getByRole('button', { name: 'Create and select', exact: true }).click(); await p.getByRole('dialog', { name: 'Add warehouses', exact: true }).waitFor({ state: 'detached' }); }
      await p.getByRole('tab', { name: 'Stops', exact: true }).click();
      const verify = p.getByRole('button', { name: /Verify all suggested matches/ });
      if (await verify.isEnabled()) await verify.click();
      await p.getByRole('tab', { name: 'Trucks & cargo', exact: true }).click();
      if (await p.locator('.cargo-truck-summary').count() === 1) { await p.getByRole('button', { name: 'Add truck', exact: true }).click(); await p.locator('.truck-picker-row').filter({ hasText: 'UNIT-A' }).click(); }
      const unreserved = p.getByRole('checkbox', { name: 'Plan without reserving dates', exact: true });
      if (await unreserved.count()) await unreserved.check();
      await p.waitForFunction(() => document.querySelector('.csv-completion-tabs [aria-label="Trucks & cargo"]')?.dataset.status === 'complete');
      await p.getByRole('button', { name: 'Review trip', exact: true }).click(); await p.locator('.review-preview-table thead th').nth(2).waitFor();
    }
    const productRows = () => p.locator('tr[data-review-row]');
    async function menu(row, keyboard = false) { if (keyboard) { await row.focus(); await p.keyboard.press('Shift+F10'); } else await row.locator('td').nth(2).click({ button: 'right' }); await p.getByRole('menu', { name: /Row review actions/ }).waitFor(); }
    async function color(name) { await p.getByRole('menuitem', { name: 'Highlight color', exact: false }).click(); await p.getByRole('menuitem', { name, exact: true }).click(); }
    await mount(); await upload(); await review();
    await p.getByRole('button', { name: 'Save trip', exact: true }).click();
    await p.getByRole('button', { name: 'Save trip', exact: true }).waitFor({ state: 'visible' });
    await p.waitForFunction(() => document.querySelector('[aria-busy="false"].trip-flow'));
    await p.getByText(/Saving imported trip details requires approval and application/).waitFor();
    await p.getByRole('button', { name: 'Back', exact: true }).click();
    await p.getByRole('tab', { name: 'Details', exact: true }).click();
    if (!await p.locator('summary').filter({ hasText: /^Warehouses/ }).evaluate(el=>el.parentElement.open)) await p.locator('summary').filter({ hasText: /^Warehouses/ }).click();
    const addWarehouse = p.getByRole('button', { name: /Add.*Cebu SQ.*as a warehouse/ });
    assert(await addWarehouse.count() === 0, 'The previously selected warehouse match was lost');
    assert(await p.getByRole('combobox', { name: 'Search warehouses', exact: true }).last().isEnabled(), 'Warehouse selection stayed locked');
    assert(await addWarehouse.count() === 0, 'Created warehouse did not match source');
    await review();
    assert(await productRows().count() === 56, 'Expected 56 product lines');
    assert(await p.locator('tr[data-review-color=yellow]').count() === 56, 'Automatic warning colors are missing');
    const actualHeaders = await p.locator('.review-preview-table thead th').allTextContents();
    assert(JSON.stringify(actualHeaders.slice(2, -1).map(text => text.trim())) === JSON.stringify(columns.map(column => column.title)), 'Columns differ from the master list');
    assert((await p.locator('.review-group-heading').innerText()).includes('PHTRUCK202609100299'), 'Missing PHTRUCK header');
    assert(await p.getByRole('button', { name: 'Save trip', exact: true }).isEnabled(), 'Optional omissions disabled Save');
    assert(await productRows().first().locator('td').last().evaluate(cell => { const a = cell.getBoundingClientRect(), b = cell.closest('.review-preview-scroll').getBoundingClientRect(); return a.left >= b.left && a.right <= b.right + 1; }), 'Touch row menu is offscreen');
    await menu(productRows().nth(0)); await p.getByRole('menuitem', { name: /Mark as reviewed/ }).click();
    assert(await productRows().nth(0).getAttribute('data-review-color') === 'none', 'Reviewed warning stayed yellow');
    await p.getByRole('checkbox', { name: 'Flagged only', exact: true }).check(); assert(await productRows().count() === 55, 'Flagged filter ignored reviewed state'); await p.getByRole('checkbox', { name: 'Flagged only', exact: true }).uncheck();
    await productRows().nth(0).locator('td').nth(2).click(); await productRows().nth(1).locator('td').nth(2).click({ modifiers: ['Shift'] }); await menu(productRows().nth(1)); await color('Blue');
    assert(await p.locator('tr[data-review-color=blue]').count() === 2, 'Bulk row coloring failed');
    await productRows().nth(0).locator('td').nth(2).click(); await menu(productRows().nth(0), true); await p.getByRole('menuitem', { name: 'Reset to automatic', exact: true }).click(); assert(await productRows().nth(0).getAttribute('data-review-color') === 'yellow', 'Reset did not restore automatic yellow');
    await productRows().nth(2).getByRole('button', { name: /Review actions/ }).click(); await p.getByRole('menuitem', { name: /Mark as reviewed/ }).click();
    await p.getByRole('button', { name: 'Save draft', exact: true }).click();
    await p.waitForFunction(() => document.querySelector('.trip-footer-draft')?.textContent.includes('Draft saved'));
    const retained = [...drafts.values()].at(-1).draft.review_annotations;
    assert(Object.values(retained).some(value => value.color === 'blue') && Object.values(retained).some(value => value.reviewedFor), 'Annotations were not saved in the draft');
    await mount(); await p.getByText('Resume a saved import', { exact: true }).click(); await p.getByRole('button', { name: 'Load saved imports' }).click(); await p.getByRole('button', { name: 'Reopen', exact: true }).last().click(); await review();
    assert(await p.locator('tr[data-review-color=blue]').count() === 1, 'Draft colors were not recovered');
    assert(await productRows().nth(2).getAttribute('data-review-color') === 'none', 'Reviewed state was not recovered');
    const savedDraft = [...drafts.values()].at(-1).draft;
    const firstDestination = Object.keys(savedDraft.locations)[0];
    assert(Boolean(firstDestination), 'Missing location draft fixture');
    savedDraft.locations[firstDestination] = { ...savedDraft.locations[firstDestination], address: 'Reviewed Cebu address', province: 'Cebu', city: 'Cebu City', latitude: '10.3157', longitude: '123.8854', verified: true, update_store_location: false };
    await mount(); await p.getByText('Resume a saved import', { exact: true }).click(); await p.getByRole('button', { name: 'Load saved imports' }).click(); await p.getByRole('button', { name: 'Reopen', exact: true }).last().click(); await review();
    for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080], [1093, 614], [1152, 720], [375, 812]]) {
      await p.setViewportSize({ width, height });
      await p.waitForFunction(() => { const shell = document.querySelector('.trip-flow:not(dialog)'); return Math.abs(shell.getBoundingClientRect().height - (innerWidth < 640 ? innerHeight : Math.min(innerHeight * .9, 1080))) < 2; });
      const result = await p.getByRole('dialog').evaluate(dialog => { const body = dialog.querySelector('.trip-flow-body'); return { overflow: dialog.scrollWidth > dialog.clientWidth + 1, nested: [...dialog.querySelectorAll('*')].filter(node => node.checkVisibility() && /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1 && node !== body).map(node => node.className), footer: dialog.querySelector(':scope>footer').getBoundingClientRect().bottom }; });
      assert(!result.overflow && !result.nested.length && result.footer <= height + 1, `Review layout ${width}x${height}: ${JSON.stringify(result)}`); checks.push({ width, height });
    }
    await p.setViewportSize({ width: 1366, height: 768 });
    await p.locator('.trip-flow-body').evaluate(body => { body.scrollTop = 1000; });
    await p.waitForFunction(() => { const header = document.querySelector('.review-preview-table thead').getBoundingClientRect(), toolbar = document.querySelector('.review-preview-toolbar').getBoundingClientRect(); return Math.abs(header.top - toolbar.bottom) < 3; });
    await p.screenshot({ path: '.playwright-mcp/master-list-review.png' });
    const beforeSave = commits.length; await p.getByRole('button', { name: 'Save trip', exact: true }).click(); await p.waitForFunction(() => document.querySelector('[aria-busy="false"].trip-flow')); await p.getByRole('heading', { name: 'Import results', exact: true }).waitFor();
    assert(commits.slice(beforeSave).reduce((sum, body) => sum + body.rows.length, 0) === 56, 'Unmatched addresses prevented row saving');
    assert(addressSetupRejected, 'Address-storage setup failure was not exercised');
    await p.getByText(/Trip-only map pins could not be stored/).waitFor();
    assert(Object.values([...drafts.values()].at(-1).draft.locations).some(location => location.verified === true && location.latitude === '10.3157'), 'Fallback erased reviewed coordinates from the draft');

    assert(commits.at(-1).target.trip_details?.loading_date == null && commits.at(-1).target.trip_details?.trip_type_id == null, 'Optional dates or trip type were fabricated');
    historical = true; await mount(); await upload(); await review();
    assert(await p.locator('.previous-import-summary').count() === 1, 'Recovery is still a list of cards');
    const pendingCommits = commits.length; await p.getByRole('button', { name: 'Save trip', exact: true }).click(); await p.getByText(/products still need the server's recovery approval/).waitFor(); assert(commits.length === pendingCommits, 'Unapproved historical rows were silently recreated');
    // Match the screenshot: reopen a started draft with 56 synthetic history
    // failures, but zero persisted rows. These warnings must not lock warehouses.
    await p.waitForFunction(() => document.querySelector('[aria-busy="false"].trip-flow'));
    await p.getByRole('button', { name: 'Save draft', exact: true }).click();
    await p.waitForFunction(() => document.querySelector('.trip-footer-draft')?.textContent.includes('Draft saved'));
    [...drafts.values()].at(-1).draft.started = true;
    Object.values([...drafts.values()].at(-1).draft.targets).forEach(target => { target.warehouse_ids = {}; });
    await mount(); await p.getByText('Resume a saved import', { exact: true }).click();
    await p.getByRole('button', { name: 'Load saved imports' }).click();
    await p.getByRole('button', { name: 'Reopen', exact: true }).last().click();
    await p.getByRole('tab', { name: 'Details', exact: true }).click();
    await p.locator('summary').filter({ hasText: /^Warehouses/ }).click();
    const historicalWarehouse = p.getByRole('button', { name: /Add.*Cebu SQ.*as a warehouse/ });
    assert(await historicalWarehouse.isEnabled(), 'Historical warnings disabled warehouse creation after reopening');
    assert(await p.getByRole('combobox', { name: 'Search warehouses', exact: true }).last().isEnabled(), 'Historical warnings disabled warehouse selection');
    await p.screenshot({ path: '.playwright-mcp/warehouse-history-recovery.png' });
    await historicalWarehouse.click();
    await p.getByRole('dialog', { name: 'Add warehouses', exact: true }).getByRole('button', { name: 'Create and select', exact: true }).click();
    await p.getByRole('dialog', { name: 'Add warehouses', exact: true }).waitFor({ state: 'detached' });
    await review();
    await p.getByRole('button', { name: 'Approve all 56', exact: true }).click();
    await p.getByRole('button', { name: 'Review details', exact: true }).click();
    assert(await p.locator('.previous-import-details>details[open]').count() === 0, 'DR detail groups should begin collapsed');
    await p.locator('.previous-import-details>details>summary').first().click();
    await p.getByText('Original model matches ✓', { exact: true }).first().waitFor();
    await p.getByRole('button', { name: 'Skip', exact: true }).first().click(); assert(await productRows().count() === 55, 'Skip did not exclude only that source line'); await p.getByRole('button', { name: 'Include', exact: true }).click(); assert(await productRows().count() === 56, 'Include did not restore the source line');
    await p.getByRole('button', { name: 'Save trip', exact: true }).click(); await p.waitForFunction(() => document.querySelector('[aria-busy="false"].trip-flow')); assert(commits.at(-1).rows.length === 56, 'Recovery did not retain all 56 source rows');
    historical = false; await mount(); await upload();
    await review(); await p.getByRole('button', { name: 'Back', exact: true }).click();
    await p.getByRole('tab', { name: 'Details', exact: true }).click();
    await p.getByLabel('Loading date', { exact: false }).fill('2026-10-23'); await p.getByLabel('Estimated delivery', { exact: false }).fill('2026-10-24'); await p.getByRole('tab', { name: 'Trucks & cargo', exact: true }).click();
    // Remove the fixture truck so the picker still exercises the unselected catalog.
    await p.getByRole('button', { name: 'Remove UNIT-A', exact: true }).click(); await p.getByRole('button', { name: 'Add truck', exact: true }).click();
    await p.locator('.truck-picker-row').filter({ hasText: 'UNIT-A' }).waitFor(); assert(await p.locator('.truck-picker-row').count() === 3, 'Busy or maintenance trucks were hidden'); assert(await p.locator('.truck-picker-row').filter({ hasText: 'UNIT-B' }).isDisabled(), 'Backend-forbidden busy truck was selectable'); assert((await p.locator('.truck-picker').innerText()).includes('Ada Cruz') && (await p.locator('.truck-picker').innerText()).includes('Booked: TRIP261020-3'), 'Driver or booking details missing');
    await p.getByRole('checkbox', { name: 'Available only', exact: true }).check(); assert(await p.locator('.truck-picker-row').count() === 1, 'Availability filter failed'); await p.getByRole('checkbox', { name: 'Available only', exact: true }).uncheck(); await p.getByRole('searchbox', { name: 'Find truck', exact: true }).fill('Lin'); assert(await p.locator('.truck-picker-row').count() === 1, 'Driver-name search failed'); await p.getByRole('searchbox', { name: 'Find truck', exact: true }).fill(''); await p.screenshot({ path: '.playwright-mcp/truck-picker.png' }); await p.locator('.truck-picker-row').filter({ hasText: 'UNIT-A' }).click();
    await p.getByRole('button', { name: 'Driver and company for UNIT-A', exact: true }).click(); await p.getByRole('button', { name: 'Assign later', exact: true }).click(); await p.getByRole('button', { name: 'Close UNIT-A settings', exact: true }).click(); assert((await p.locator('.cargo-truck-summary').filter({ hasText: 'UNIT-A' }).innerText()).includes('Assign driver later'), 'Driver could not be deferred');
    await mount('manual'); await p.getByRole('button', { name: 'Next', exact: true }).click(); await p.getByRole('combobox', { name: 'Search stores', exact: true }).fill('Store'); await p.getByRole('option', { name: /^Store/ }).click(); await p.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('1.5'); await p.getByRole('spinbutton', { name: 'Total CBM', exact: true }).fill('2'); await p.getByRole('button', { name: 'Add product line', exact: true }).click(); await p.getByRole('spinbutton', { name: 'Quantity', exact: true }).last().fill('-1'); await p.getByRole('button', { name: 'Next', exact: true }).click(); await p.getByRole('button', { name: 'Save trip', exact: true }).click();
    manualPayload = await p.evaluate(() => window.manualReviewPayload); assert(manualPayload.stops[0].line_items.length === 1 && manualPayload.stops[0].line_items[0].quantity === '1.5', 'Malformed row exclusion or decimal quantity handling failed'); assert(manualPayload.trip.loading_date === null && manualPayload.trip.trip_type_id === null && manualPayload.assignments.length === 0 && manualPayload.stops[0].line_items[0].dr_number === null && manualPayload.stops[0].line_items[0].product_id === null, 'Optional values were fabricated or blocked');
    assert(!errors.length, errors.join('; '));
    return { csv: csvPath ? 'provided Cebu CSV' : '56-row fixture', sourceRows: 56, masterColumns: columns.length, layouts: checks.length, unmatchedAddressSave: true, failedSaveWarehouseRecovery: true, historicalDraftWarehouseRecovery: true, optionalAddressSetupFallback: true, optionalFieldsSave: true, draftAnnotationRecovery: true, rightClickAndKeyboardMenus: true, multiSelectColors: true, oneClickHistoryApproval: true, existingRecoveryGuardRespected: true, driverAndAvailabilityPicker: true, incompleteManualRowExcluded: true, productionWrites: 0, runtimeErrors: errors };
  } catch (error) { console.log(JSON.stringify({ fixtureErrors: errors, commits: commits.length, body: (await p.locator('body').innerText()).slice(-3000) })); throw error; } finally { await context.close(); }
}
