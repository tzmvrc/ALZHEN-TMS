// Run through Playwright against Vite. All APIs are isolated; no live imports.
async (page, mode) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const p = await context.newPage(), errors = [], checks = [], requests = [];
  let savedDraft, recoveryDraft;
  let savedOutcomes=[],savedHistory={},savedBatch,savedGroup;
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  p.on('pageerror', error => errors.push(error.message));
  const trucks = Array.from({ length: 6 }, (_, n) => ({ id: `truck-${n + 1}`, plate_number: `PLATE-${n + 1}`, truck_type: 'Van', capacity_cbm: 5, default_driver_id: `driver-${n + 1}`, default_driver_name: `Driver ${n + 1}` }));
  const columns = await (await p.request.get('http://127.0.0.1:5173/tests/master-list-columns.fixture.json')).json();
  try {
    await p.route('**/src/context/AuthContext.tsx*', route => route.fulfill({ contentType: 'text/javascript', body: "export const useAuth=()=>({accessToken:'isolated-csv-completion',profile:{id:'test-admin',role:'ADMIN'}});" }));
    await p.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname;
      requests.push({ method: req.method(), path });
      let data = [];
      if (path.includes('/lookups/')) {
        const kind = path.split('/').at(-1);
        data = kind === 'trucks' ? trucks : kind === 'drivers' ? trucks.map(t => ({ id: t.default_driver_id, full_name: t.default_driver_name })) : kind === 'trip-types' ? [{ id: 'delivery', name: 'Delivery' }] : [];
      } else if (path.endsWith('/columns')) data = { report: 'dispatch-monitoring', columns };
      else if (path.endsWith('/truck-availability')) data = trucks.map(t => ({ ...t, availability: 'AVAILABLE', reason: '', available_cbm: 5 }));
      else if (path.endsWith('/driver-availability')) data = trucks.map(t => ({ id: t.default_driver_id, availability: 'AVAILABLE', reason: '' }));
      else if (path.endsWith('/draft')) { savedDraft = req.postDataJSON().draft; data = { revision: req.postDataJSON().revision + 1 }; }
      else if (path.endsWith('/import/batches')) data = [{ id: 'address-recovery', state: 'Pending', revision: 1, imported: 0, failed: 0, awaiting_allocation: 0, updated_at: '2026-10-24T00:00:00Z' }];
      else if (path.endsWith('/import/batches/address-recovery')) data = { id: 'address-recovery', state: 'Pending', revision: 1, draft: recoveryDraft, outcomes: [], history: {}, cargo_saved: {} };
      else if(mode==='save-optional'&&path.endsWith('/import/commit')){
        const body=req.postDataJSON();savedBatch=body.batch_id;savedGroup=body.group;
        assert(Object.values(body.location_resolutions).every(value=>value.verified===false&&!value.latitude&&!value.longitude),'Optional address became required or confirmed during Save');
        savedOutcomes=body.rows.map((row,index)=>({source_identity:row.source_identity,status:'imported',trip_id:'123e4567-e89b-42d3-a456-426614174000',line_item_id:`123e4567-e89b-42d3-a456-${String(index+1).padStart(12,'0')}`,trip_created:true}));
        savedHistory=Object.fromEntries(savedOutcomes.map(row=>[row.source_identity,{status:'live',batch_id:savedBatch,line_item_id:row.line_item_id,trip_id:row.trip_id}]));
        data={batch_id:savedBatch,rows:savedOutcomes,history:savedHistory};
      }
      else if(mode==='save-optional'&&path.endsWith('/import/allocate'))data={trip_id:'123e4567-e89b-42d3-a456-426614174000'};
      else if(mode==='save-optional'&&savedBatch&&path.endsWith(`/import/batches/${savedBatch}`))data={id:savedBatch,state:'Completed',revision:3,draft:savedDraft,outcomes:savedOutcomes,history:savedHistory,cargo_saved:{[savedGroup]:true}};
      else if (path.endsWith('/import/location')) data = { status: 'found', source: 'geoapify', message: '', candidates: [{ display_name: `${url.searchParams.get('ship_to')}, Cebu City, Cebu`, latitude: 10.3, longitude: 123.9, provinces: ['Cebu'], cities: ['Cebu City'] }] };
      else if (path.endsWith('/import/preview')) {
        const rows = req.postDataJSON().files.flatMap(file => file.rows.map(row => ({ ...row, filename: file.name, errors: [], warnings: [], source_identity: `${file.name}:${row.line}`, fingerprint: 'fixture', signature: 'fixture', document_hash: 'fixture', duplicate: false, potential_duplicate: false })));
        data = { rows, detected: rows.length, valid: rows.length, invalid: 0, duplicates: 0, potential_duplicates: 0, setup_required: false, history: {}, warehouse_matches: {} };
      } else assert(req.method() === 'GET', `Unexpected API write ${path}`);
      await route.fulfill({ status: 200, json: { success: true, data } });
    });
    await p.goto('http://127.0.0.1:5173/tests/table-fixture.html');
    async function mount() {
      await p.evaluate(async () => {
        await import('/src/index.css');
        const main = await (await fetch('/src/main.tsx')).text();
        const React = (await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default;
        const DOM = await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
        window.csvCompletionRoot?.unmount();
        const root = (DOM.createRoot ?? DOM.default.createRoot)(document.body.appendChild(document.createElement('div'))); window.csvCompletionRoot = root;
        const { default: Modal } = await import('/src/components/admin/BulkTripImport.tsx');
        root.render(React.createElement(Modal, { onClose: () => root.unmount(), onImported: () => {}, initialTripDetails: { status: 'PLANNED', loading_date: '2026-10-24', estimated_delivery_date: '2026-10-25', remarks: null, trip_type_id: null, trip_type_name: null, origin_warehouse_id: null } }));
      });
    }
    const csv = 'Customer Name,Ship To,Province,City,Customer Model,Quantity,Total CBM,DR Number\n' + trucks.map((_, i) => `Customer,Store ${i % 2 + 1},Cebu,Cebu City,MODEL-${i + 1},1,4,DR-${i + 1}`).join('\n');
    async function upload(names) {
      await p.locator('input[type=file]').setInputFiles(names.map(name => ({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) })));
      await p.getByRole('button', { name: 'Check CSV', exact: true }).click();
      await p.getByRole('button', { name: 'Import CSV', exact: true }).click();
      await p.getByRole('tab', { name: 'Details', exact: true }).waitFor();
    }
    async function inspect(state) {
      for (const width of [1000, 1280, 1600]) {
        await p.setViewportSize({ width, height: 1000 });
        await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const result = await p.locator('[role=dialog]').evaluate(dialog => {
          const body = dialog.querySelector('.trip-flow-body'), footer = dialog.querySelector('.trip-flow-footer'), bounds = dialog.getBoundingClientRect();
          const horizontal = [...dialog.querySelectorAll('*')].filter(el => el.checkVisibility() && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(el).overflowX)).map(el => el.className);
          return { horizontal, bodyFits: body.scrollWidth <= body.clientWidth + 2, footerFits: footer.getBoundingClientRect().bottom <= bounds.bottom + 1, hasLeftPanel: !!dialog.querySelector('.group-rail') };
        });
        assert(!result.horizontal.length && result.bodyFits && result.footerFits && !result.hasLeftPanel, `${state} at ${width}: ${JSON.stringify(result)}`);
        checks.push({ state, width });
      }
    }
    await mount(); await upload(['One trip.csv']);
    assert(await p.locator('.group-identity h3').textContent() === 'One trip.csv', 'Single group identity missing');
    assert(await p.getByLabel('Current trip group').count() === 0, 'Single trip must not show a selector');
    assert(await p.getByRole('button', { name: 'Next: Stops', exact: true }).count() === 1, 'Details primary action is not guided');
    assert(await p.getByRole('tab', { name: 'Stops', exact: true }).getAttribute('data-status') === 'unvisited', 'Unvisited state missing');
    await inspect('details');
    // Jumping through the main stepper must use the same review guard.
    await p.getByRole('button', { name: 'Review & save', exact: false }).click();
    await p.getByRole('alert', { name: 'Complete before reviewing' }).waitFor();
    assert(await p.getByRole('tab', { name: 'Trucks & cargo', exact: true }).getAttribute('aria-selected') === 'true', 'Guard did not select required cargo section');
    assert(await p.locator('[data-csv-phase="3"]').count() === 0, 'Incomplete trip reached review');
    assert(!(await p.getByRole('alert', { name: 'Complete before reviewing' }).innerText()).includes('Verify address'), 'Optional address appeared as a blocker');
    await p.getByRole('tab', { name: 'Stops', exact: true }).click();
    assert((await p.getByRole('tab', { name: 'Stops', exact: true }).innerText()).includes('Address optional'), 'Optional address status missing');
    await p.getByRole('button', { name: 'Next: Trucks & cargo', exact: true }).click();
    assert(await p.getByRole('tab', { name: 'Trucks & cargo', exact: true }).getAttribute('aria-selected') === 'true', 'Optional address blocked Next');
    await p.getByRole('tab', { name: 'Stops', exact: true }).click();
    await inspect('stops');
    await p.getByRole('button', { name: 'Table preview', exact: true }).click(); await inspect('stops-table');
    await p.getByRole('button', { name: 'Edit stops', exact: true }).click();
    await p.getByRole('button', { name: 'Next: Trucks & cargo', exact: true }).click();
    await p.getByRole('button', { name: 'Review trip', exact: true }).click();
    assert(await p.getByRole('alert', { name: 'Complete before reviewing' }).innerText().then(t => t.includes('Add at least one truck')), 'Missing truck not explained');
    for (let n=1; n<=6; n++) {
      await p.getByRole('button', { name: 'Add truck', exact: true }).click();
      await p.getByRole('searchbox', { name: 'Find truck', exact: true }).fill(`PLATE-${n}`);
      await p.locator('.truck-picker-row').filter({ hasText: `PLATE-${n}` }).click();
    }
    await p.waitForFunction(() => document.querySelector('.csv-completion-tabs [aria-label="Trucks & cargo"]')?.dataset.status === 'complete');
    if(mode==='save-optional'){
      await p.getByRole('button',{name:'Review trip',exact:true}).click();
      await p.locator('[data-csv-phase="3"]').waitFor();
      await p.getByRole('button',{name:'Save trip',exact:true}).click();
      await p.getByRole('button',{name:'Trip saved',exact:true}).waitFor();
      assert(savedOutcomes.length===6,'Not all source products were saved');
      assert(requests.filter(request=>request.path.endsWith('/import/commit')).length===1,'Save retried optional address');
      assert(!errors.length,errors.join('; '));
      return {optionalAddressSave:true,rows:savedOutcomes.length,commitRequests:1,productionWrites:0,errors};
    }
    assert(await p.locator('.cargo-truck-summary').count() === 7, 'Six truck summaries plus Unassigned required');
    for (let n=1; n<=6; n++) {
      const row = p.locator('.cargo-truck-summary').filter({ hasText: `PLATE-${n}` });
      assert((await row.innerText()).includes('4 / 5 CBM'), `Truck ${n} lacks assigned/capacity CBM`);
      assert((await row.innerText()).includes(`Driver ${n}`), `Truck ${n} lacks driver`);
      await row.locator('.cargo-truck-select').click();
      assert(await p.locator('.trip-dr-title').count() === 1, 'Selected truck DRs not isolated');
    }
    await inspect('six-trucks');
    await p.locator('.trip-flow-body').evaluate(body => { body.scrollTop = 0; });
    await p.locator('.cargo-truck-list').evaluate(list => { list.scrollTop = 0; });
    await p.screenshot({ path: '.playwright-mcp/csv-complete-details-six-trucks.png' });
    const target = p.getByRole('combobox', { name: /Move DR allocations DR-6/ });
    await target.selectOption('unassigned');
    assert(await p.getByRole('tab', { name: 'Trucks & cargo', exact: true }).getAttribute('data-status') === 'attention', 'Manual unassignment did not invalidate status');
    await p.locator('.cargo-truck-summary').filter({ hasText: 'PLATE-1' }).locator('.cargo-truck-select').click();
    await p.getByRole('button', { name: 'Review trip', exact: true }).click();
    assert((await p.getByRole('alert', { name: 'Complete before reviewing' }).innerText()).includes('1 DR unassigned'), 'Unassigned DR count missing');
    assert(await p.locator('.cargo-truck-summary').first().locator('.cargo-truck-select').getAttribute('aria-pressed') === 'true', 'Cargo checklist did not select Unassigned');
    await p.getByRole('combobox', { name: /Move DR allocations DR-6 from Unassigned/ }).selectOption('truck-6');
    await p.locator('.trip-dr-card').dragTo(p.locator('.cargo-truck-summary').filter({ hasText: 'PLATE-5' }));
    const overloaded = p.locator('.cargo-truck-summary').filter({ hasText: 'PLATE-5' });
    assert((await overloaded.innerText()).includes('Over capacity'), 'Drag target lost over-capacity warning');
    await p.getByRole('combobox', { name: /Move DR allocations DR-6 from PLATE-5/ }).selectOption('truck-6');
    await p.getByRole('button', { name: 'Re-run auto-assign', exact: true }).click();
    await p.getByRole('button', { name: 'Undo', exact: true }).click();
    assert((await p.locator('.cargo-auto-notice').innerText()).includes('undone'), 'Undo no longer restores the allocation');
    await p.locator('.trip-dr-title').click();
    await p.getByRole('region', { name: 'DR details DR-6', exact: true }).waitFor();
    await p.getByText('Move entire DR group', { exact: true }).click();
    assert(await p.getByRole('combobox', { name: 'Truck for entire DR group DR-6', exact: true }).count() === 1, 'Full DR move removed');
    await inspect('expanded-dr');
    await p.getByRole('button', { name: 'Close DR details', exact: true }).click();
    await p.getByRole('button', { name: 'Back', exact: true }).click();
    assert(await p.getByRole('tab', { name: 'Stops', exact: true }).getAttribute('aria-selected') === 'true', 'Back must traverse sub-steps');
    await p.getByRole('button', { name: 'Back', exact: true }).click();
    assert(await p.getByRole('button', { name: 'Next: Stops', exact: true }).count() === 1, 'Back did not return to Details');
    await p.getByRole('tab', { name: 'Details', exact: true }).focus(); await p.keyboard.press('End');
    assert(await p.getByRole('tab', { name: 'Trucks & cargo', exact: true }).evaluate(el=>el===document.activeElement), 'Keyboard End failed');
    await p.keyboard.press('Enter');
    await p.getByRole('button', { name: 'Review trip', exact: true }).click();
    await p.locator('[data-csv-phase="3"]').waitFor();
    assert(await p.getByRole('button', { name: 'Save trip', exact: true }).isEnabled(), 'Completed trip cannot be reviewed');
    await p.getByRole('button', { name: 'Save draft', exact: true }).click();
    await p.waitForFunction(() => document.querySelector('.trip-footer-draft')?.textContent.includes('Draft saved'));
    const validDraft = structuredClone(savedDraft);
    // Missing or stale recovered addresses must not prevent continuing or reviewing.
    for (const staleConfirmed of [false, true]) {
      recoveryDraft = structuredClone(validDraft);
      const key = Object.keys(recoveryDraft.locations)[0];
      Object.assign(recoveryDraft.locations[key], { store_verified: true, verified: staleConfirmed, address: '', latitude: '', longitude: '' });
      await mount();
      await p.getByText('Resume a saved import', { exact: true }).click();
      await p.getByRole('button', { name: 'Load saved imports', exact: true }).click();
      await p.getByRole('button', { name: 'Reopen', exact: true }).click();
      await p.getByRole('button', { name: 'Next: Stops', exact: true }).click();
      await p.getByRole('button', { name: 'Next: Trucks & cargo', exact: true }).click();
      assert(await p.getByRole('tab', { name: 'Trucks & cargo', exact: true }).getAttribute('aria-selected') === 'true', 'Recovered address blocked Next');
      await p.getByRole('button', { name: 'Review & save', exact: false }).click();
      await p.locator('[data-csv-phase="3"]').waitFor();
      await p.getByRole('button', { name: 'Back', exact: true }).click();
      await p.getByRole('tab', { name: 'Stops', exact: true }).click();
      const card = p.locator('.address-card');
      assert(!(await card.innerText()).includes('Verified'), 'Incomplete recovered address still displays Verified');
      await card.getByRole('button', { name: 'Confirm address', exact: true }).click();
      await p.getByRole('button', { name: 'Next: Trucks & cargo', exact: true }).click();
      assert(await p.getByRole('tab', { name: 'Trucks & cargo', exact: true }).getAttribute('aria-selected') === 'true', 'Confirmed address could not continue');
    }
    // Multiple groups use the same compact selector across every sub-tab.
    await mount(); await upload(['North.csv', 'South.csv']);
    const select = p.getByRole('combobox', { name: 'Current trip group', exact: true });
    await select.selectOption('South.csv');
    await p.getByRole('button', { name: 'Next: Stops', exact: true }).click();
    assert(await select.inputValue() === 'South.csv', 'Selector lost group on tab change');
    await p.getByRole('button', { name: 'Verify all suggested matches (2)', exact: true }).click();
    await p.getByRole('button', { name: 'Next: Trucks & cargo', exact: true }).click();
    assert(await select.inputValue() === 'South.csv', 'Cargo header uses a different selector');
    await inspect('multiple-groups');
    await p.getByRole('button', { name: 'Review trip', exact: true }).click();
    assert((await p.getByRole('alert', { name: 'Complete before reviewing' }).innerText()).includes('North.csv'), 'Review guard ignored other groups');
    assert(!requests.some(r=>/\/commit$|\/confirm-cargo$/.test(r.path)), 'Unexpected import call');
    assert(!errors.length, errors.join('; '));
    return { checks, sixTruckSummary: true, guardedMainStepper: true, guardedSubsteps: true, optionalAddressNavigation: true, backNavigation: true, keyboardNavigation: true, moveAndExpand: true, dragAndCapacityWarning: true, rerunAndUndo: true, multiGroupGuard: true, productionWrites: 0, errors };
  } finally { await context.close(); }
}
