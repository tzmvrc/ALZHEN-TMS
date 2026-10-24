// Isolated Playwright regression. Optional second argument: local trip-request CSV.
async (page, csvPath) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const p = await context.newPage(), errors = [], writes = [];
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const truck = { id: 'physical-truck', plate_number: 'SHARED-40', truck_type: 'Wing Van', capacity_cbm: 40, default_driver_id: 'driver-1', default_driver_name: 'Driver 1' };
  const name = csvPath ? (await import('node:path')).basename(csvPath) : 'Shared delivery.csv';
  const csv = csvPath ? await (await import('node:fs/promises')).readFile(csvPath, 'utf8') : 'Customer Name,Ship To,Province,City,Customer Model,Quantity,Total CBM,DR Number,PH TRUCK NAME\n' + Array.from({ length: 6 }, (_, n) => `Customer,Store ${n + 1},Cebu,Cebu City,MODEL-${n + 1},1,1,DR-${n + 1},PH-${n + 1}`).join('\n');
  let previewRows = [], savedDraft, recoveryDraft, recorded = false;
  p.on('pageerror', error => errors.push(error.message));
  try {
    await p.route('**/src/context/AuthContext.tsx*', route => route.fulfill({ contentType: 'text/javascript', body: "export const useAuth=()=>({accessToken:'isolated-shared-trucks',profile:{id:'admin',role:'ADMIN'}});" }));
    await p.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname;
      if (req.method() !== 'GET') writes.push(path);
      let data = [];
      if (path.endsWith('/lookups/trucks')) data = [truck];
      else if (path.endsWith('/lookups/drivers')) data = [{ id: 'driver-1', full_name: 'Driver 1' }];
      else if (path.endsWith('/truck-availability')) data = [{ ...truck, availability: 'AVAILABLE', available_cbm: 40 }];
      else if (path.endsWith('/driver-availability')) data = [{ id: 'driver-1', availability: 'AVAILABLE' }];
      else if (path.endsWith('/draft')) { const body = req.postDataJSON(); savedDraft = body.draft; data = { revision: body.revision + 1 }; }
      else if (path.endsWith('/import/batches')) data = [{ id: 'legacy-ph', state: 'Pending', revision: 1, imported: recorded ? 1 : 0, failed: 0, awaiting_allocation: 0, updated_at: '2026-10-24T00:00:00Z' }];
      else if (path.endsWith('/import/batches/legacy-ph')) data = { id: 'legacy-ph', state: recorded ? 'Partially Imported' : 'Pending', revision: 1, imported: recorded ? 1 : 0, failed: 0, awaiting_allocation: 0, draft: recoveryDraft, outcomes: [], history: {}, cargo_saved: {} };
      else if (path.endsWith('/import/preview')) {
        previewRows = req.postDataJSON().files.flatMap(file => file.rows.map(row => ({ ...row, filename: file.name, source_identity: `${file.name}:${row.line}`, document_hash: 'mock-document', fingerprint: `row-${row.line}`, signature: 'mock-signature', errors: [], warnings: [], duplicate: false, potential_duplicate: false })));
        const sources = [...new Set(previewRows.map(row => row.values.source_warehouse).filter(Boolean))];
        data = { rows: previewRows, detected: previewRows.length, valid: previewRows.length, invalid: 0, duplicates: 0, potential_duplicates: 0, setup_required: false, history: {}, warehouse_matches: Object.fromEntries(sources.map(code => [code, { id: 'warehouse', label: code, status: 'matched', candidates: [{ id: 'warehouse', name: code, code }] }])) };
      } else if (path.endsWith('/import/location')) data = { status: 'not_found', candidates: [], source: 'none' };
      else assert(req.method() === 'GET', `Unexpected write: ${path}`);
      await route.fulfill({ status: 200, json: { success: true, data } });
    });
    await p.goto('http://127.0.0.1:5173/tests/table-fixture.html');
    async function mount() {
      await p.evaluate(async () => {
        await import('/src/index.css');
        const main = await (await fetch('/src/main.tsx')).text();
        const React = (await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default;
        const DOM = await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
        window.sharedTruckRoot?.unmount();
        const root = (DOM.createRoot ?? DOM.default.createRoot)(document.body.appendChild(document.createElement('div'))); window.sharedTruckRoot = root;
        const { default: Modal } = await import('/src/components/admin/BulkTripImport.tsx');
        root.render(React.createElement(Modal, { onClose: () => root.unmount(), onImported: () => {}, initialTripDetails: { status: 'PLANNED', loading_date: '2026-10-24', estimated_delivery_date: '2026-10-25', trip_type_id: null, trip_type_name: null, origin_warehouse_id: null, remarks: null } }));
      });
    }
    async function checkAndEnter() {
      await p.getByRole('button', { name: 'Check CSV', exact: true }).click();
      await p.getByRole('button', { name: 'Import CSV', exact: true }).click();
      await p.getByRole('tab', { name: 'Details', exact: true }).waitFor();
    }
    async function chooseTruck() {
      await p.getByRole('tab', { name: 'Trucks & cargo', exact: true }).click();
      await p.getByRole('button', { name: 'Add truck', exact: true }).click();
      await p.locator('.truck-picker-row').filter({ hasText: 'SHARED-40' }).click();
      await p.waitForFunction(() => document.querySelector('.csv-completion-tabs [aria-label="Trucks & cargo"]')?.dataset.status === 'complete');
      await p.getByRole('button', { name: 'Save draft', exact: true }).click();
      await p.waitForFunction(() => document.querySelector('.trip-footer-draft')?.textContent.includes('Draft saved'));
    }
    await mount();
    await p.locator('input[type=file]').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await checkAndEnter();
    const source = structuredClone(previewRows), refs = new Set(source.map(row => row.values.ph_truck_reference));
    assert(refs.size > 1, 'Fixture must include multiple PH references');
    assert(new Set(source.map(row => row.group)).size === 1, 'New imports still split by PH reference');
    assert(await p.getByRole('combobox', { name: 'Current trip group', exact: true }).count() === 0, 'PH references generated multiple group panels');
    await chooseTruck();
    const fresh = structuredClone(savedDraft), plan = fresh.plans[name];
    assert(plan.trucks.length === 1 && plan.placements.length === source.length, 'One truck did not receive every product across PH references');
    assert(plan.placements.every(item => item.truck_id === 'physical-truck'), 'Multiple physical trucks were forced');
    assert(fresh.preview.rows.every((row, index) => JSON.stringify(row.values) === JSON.stringify(source[index].values)), 'Source values changed');
    await p.getByRole('tab', { name: 'Stops', exact: true }).click();
    const stops = new Set(source.map(row => JSON.stringify([row.values.customer_name, row.values.ship_to, row.values.province, row.values.city]))).size;
    assert(await p.locator('.stop-chip[role=tab]').count() === stops, 'Stops were lost while sharing the truck');
    // Reopen an old draft split by PH, then combine through the explicit replan action.
    recoveryDraft = structuredClone(fresh); recoveryDraft.plans = {}; recoveryDraft.targets = {};
    for (const file of recoveryDraft.files) for (const row of file.rows) row.group = `${file.name} / ${row.cells[file.mapping.ph_truck_reference].trim()}`;
    for (const row of recoveryDraft.preview.rows) { row.group = `${row.filename} / ${row.values.ph_truck_reference}`; recoveryDraft.targets[row.group] = structuredClone(fresh.targets[name]); recoveryDraft.plans[row.group] = { ...structuredClone(plan), placements: [], confirmed: false, signature: '' }; }
    const legacy = structuredClone(recoveryDraft);
    await mount();
    async function reopen() { await p.getByText('Resume a saved import', { exact: true }).click(); await p.getByRole('button', { name: 'Load saved imports', exact: true }).click(); await p.getByRole('button', { name: 'Reopen', exact: true }).click(); }
    await reopen();
    const combine = p.getByRole('button', { name: 'Combine PH groups', exact: true });
    assert(await combine.isEnabled(), 'Unrecorded legacy draft cannot be combined');
    await combine.click();
    await p.getByRole('dialog', { name: 'Combine PH reference groups', exact: true }).getByRole('button', { name: 'Keep groups', exact: true }).click();
    assert(await p.getByRole('combobox', { name: 'Current trip group', exact: true }).locator('option').count() === refs.size, 'Cancelling changed groups');
    await combine.click(); await p.getByRole('button', { name: 'Combine and replan', exact: true }).click();
    await checkAndEnter();
    await chooseTruck();
    assert(Object.keys(savedDraft.plans).length === 1 && savedDraft.plans[name].trucks.length === 1, 'Orphaned PH truck plans survived combination');
    assert(savedDraft.plans[name].placements.length === source.length, 'Combining lost products');
    assert(savedDraft.preview.rows.every((row, index) => row.source_identity === source[index].source_identity && JSON.stringify(row.values) === JSON.stringify(source[index].values)), 'Combining changed source identities or PH metadata');
    await p.locator('.cargo-truck-summary').filter({ hasText: 'SHARED-40' }).locator('.cargo-truck-select').click();
    await p.locator('.trip-flow-body').evaluate(body => { body.scrollTop = 0; });
    await p.screenshot({ path: '.playwright-mcp/csv-shared-physical-truck.png' });
    // Recorded trips retain their group identities and cannot be silently regrouped.
    recorded = true; recoveryDraft = legacy; await mount(); await reopen();
    assert(await p.getByRole('button', { name: 'Combine PH groups', exact: true }).isDisabled(), 'Recorded batch allowed regrouping');
    assert(!writes.some(path => /\/commit$|\/allocate$/.test(path)), 'A live-style import write was attempted');
    assert(!errors.length, errors.join('; '));
    return { sourceRows: source.length, phReferences: refs.size, stops, physicalTrucks: 1, freshSharedPlan: true, legacyCombineAndCancel: true, recordedBatchProtected: true, sourceValuesPreserved: true, productionWrites: 0, errors };
  } finally { await context.close(); }
}
