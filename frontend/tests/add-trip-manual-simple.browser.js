// Isolated manual Add Trip flow. Run against local Vite; no backend writes.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1280, height: 850 }, reducedMotion: 'reduce' });
  const p = await context.newPage(); const errors = [];
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  let attempts = 0;
  const trucks = [1, 2].map(n => ({ id: `truck-${n}`, plate_number: `TRUCK-${n}`, truck_type: 'Van', capacity_cbm: 2, default_driver_id: `driver-${n}`, default_driver_name: `Driver ${n}`, status: 'ACTIVE' }));
  p.on('pageerror', error => errors.push(error.message));
  try {
    await p.route('**/src/context/AuthContext.tsx*', route => route.fulfill({ contentType: 'text/javascript', body: "export const useAuth=()=>({accessToken:'isolated-manual-trip',profile:{id:'admin',role:'ADMIN'}});" }));
    await p.route('**/api/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      let data = [];
      if (path.endsWith('/next-dispatch-number')) data = { dispatch_number: 'DISPATCH2610270001', trip_reference: 'TRIP2610270001', trip_number: 1, trip_reference_status: 'ready' };
      else if (path.endsWith('/lookups/trucks')) data = trucks;
      else if (path.endsWith('/lookups/drivers')) data = [1, 2].map(n => ({ id: `driver-${n}`, full_name: `Driver ${n}` }));
      else if (path.endsWith('/lookups/stores')) data = [{ id: 'store-1', name: 'Store 1', store_name: 'Store 1', city: 'Cebu City', province: 'Cebu', address: 'Main Street' }];
      else if (path.endsWith('/lookups/products')) data = [{ id: 'product-1', name: 'MODEL-1', sku: 'MODEL-1', model_code: 'MODEL-1' }];
      else if (path.endsWith('/truck-availability')) data = trucks.map(truck => ({ ...truck, availability: 'AVAILABLE', available_cbm: 2 }));
      else if (path.endsWith('/driver-availability')) data = [1, 2].map(n => ({ id: `driver-${n}`, availability: 'AVAILABLE' }));
      await route.fulfill({ status: 200, json: { success: true, data } });
    });
    await p.goto('http://127.0.0.1:5173/tests/table-fixture.html');
    await p.evaluate(async () => {
      await import('/src/index.css');
      const main = await (await fetch('/src/main.tsx')).text();
      const React = (await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default;
      const DOM = await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
      const { default: Modal } = await import('/src/components/admin/AddTripForm.tsx');
      const root = (DOM.createRoot ?? DOM.default.createRoot)(document.body.appendChild(document.createElement('div')));
      window.manualTrip = { finished: false, attempts: 0 };
      root.render(React.createElement(Modal, { onClose: () => { window.manualTrip.finished = true; root.unmount(); }, onSubmit: async payload => { window.manualTrip.payload = payload; window.manualTrip.attempts++; if (window.manualTrip.attempts === 1) throw Error('Temporary manual save failure'); } }));
    });
    await p.getByRole('dialog').waitFor();
    await p.getByRole('button', { name: 'Next', exact: true }).click();
    await p.getByRole('combobox', { name: 'Search stores', exact: true }).fill('Store 1');
    await p.getByRole('option', { name: /Store 1/ }).click();
    await p.getByRole('combobox', { name: 'Search products', exact: true }).fill('MODEL');
    await p.getByRole('option', { name: /MODEL-1/ }).click();
    await p.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('3');
    await p.getByRole('spinbutton', { name: 'Total CBM', exact: true }).fill('3');
    await p.getByRole('button', { name: 'Next', exact: true }).click();
    await p.getByRole('button', { name: 'Choose truck', exact: true }).click();
    await p.locator('.truck-picker-row').filter({ hasText: 'TRUCK-1' }).click();
    await p.getByRole('button', { name: '+ Add another truck' }).click();
    await p.locator('.truck-picker-row').filter({ hasText: 'TRUCK-2' }).click();
    await p.waitForTimeout(1200);
    assert(await p.locator('.trip-simple-allocation').count() === 1, `Simple allocation missing: ${(await p.getByRole('dialog').innerText()).slice(0, 1500)}`);
    assert((await p.locator('.trip-simple-allocation').innerText()).includes('3 / 4 CBM'), 'Product CBM was not automatically distributed across the two trucks');
    assert(await p.locator('.trip-cargo-board:visible').count() === 0, 'Detailed cargo board is still shown for a valid allocation');
    await p.screenshot({ path: '.playwright-mcp/add-trip-manual-trucks.png' });
    await p.getByRole('button', { name: 'Next', exact: true }).click();
    assert(await p.getByRole('heading', { name: 'Review your trip' }).count() === 1, 'Summary step missing');
    await p.screenshot({ path: '.playwright-mcp/add-trip-manual-review.png' });
    await p.getByRole('button', { name: 'Save trip' }).click();
    await p.getByText(/Temporary manual save failure/).waitFor();
    assert(await p.getByRole('dialog').count() === 1, 'Failed manual save closed the form');
    await p.getByRole('button', { name: 'Save trip' }).click();
    await p.waitForFunction(() => window.manualTrip.finished);
    const result = await p.evaluate(() => window.manualTrip);
    assert(result.attempts === 2 && result.payload.assignments.length === 2 && result.payload.stops[0].line_items.length === 1, 'Manual trip payload lost assignments or products');
    assert(result.payload.cargo_plan?.placements.length === 2 && result.payload.cargo_plan.confirmed, 'Manual trip payload lost multi-truck cargo allocation');
    assert(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
    attempts = result.attempts;
    return { trucks: result.payload.assignments.length, productRows: result.payload.stops[0].line_items.length, failurePreserved: true, successClosed: result.finished, attempts };
  } finally { await context.close(); }
}
