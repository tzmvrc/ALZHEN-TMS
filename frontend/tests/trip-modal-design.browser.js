// Run with the local Vite server. All API traffic is mocked; no production writes.
async (page) => {
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await context.newPage(); await p.emulateMedia({ reducedMotion: 'reduce' }); const errors = [], requests = [], layouts = [];
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  p.on('pageerror', error => errors.push(error.message));
  try {
    await p.route('**/src/context/AuthContext.tsx*', route => route.fulfill({ contentType: 'text/javascript', body: "export const useAuth=()=>({accessToken:'isolated-ui-preview',profile:{id:'preview-admin',role:'ADMIN'}});" }));
    await p.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      requests.push({ path, method: request.method() });
      let data = [];
      if (path.endsWith('/next-dispatch-number')) data = { dispatch_number: 'DISPATCH2610230001', trip_reference: 'TRIP2610230001', trip_reference_status: 'ready' };
      else if (path.endsWith('/draft')) data = { revision: (request.postDataJSON().revision ?? 0) + 1 };
      else if (path.endsWith('/import/preview')) {
        const { files } = request.postDataJSON();
        const rows = files.flatMap(file => file.rows.map(row => ({ ...row, filename: file.name, errors: [], warnings: [], source_identity: `${file.name}:${row.line}`, fingerprint: 'mock', signature: 'mock', document_hash: 'mock', duplicate: false, potential_duplicate: false })));
        data = { rows, detected: rows.length, valid: rows.length, invalid: 0, duplicates: 0, potential_duplicates: 0, setup_required: true, duplicate_check_status: 'unavailable', setup_message: 'Preview is available. Database setup is required before saving.' };
      } else assert(request.method() === 'GET', `Unexpected API write: ${path}`);
      await route.fulfill({ status: 200, json: { success: true, data } });
    });
    await p.goto('http://127.0.0.1:5173/tests/table-fixture.html');
    await p.evaluate(async () => {
      await import('/src/index.css');
      const main = await (await fetch('/src/main.tsx')).text();
      const React = (await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default;
      const DOM = await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
      const { default: AddTrip } = await import('/src/components/admin/AddTripForm.tsx');
      const opener = document.body.appendChild(document.createElement('button')); opener.textContent = 'Open trip planner'; opener.focus();
      const root = (DOM.createRoot ?? DOM.default.createRoot)(document.body.appendChild(document.createElement('div')));
      root.render(React.createElement(AddTrip, { onClose: () => root.unmount(), onSubmit: async payload => { window.submittedTrip = payload; } }));
    });
    await p.getByRole('heading', { name: 'Add trip', exact: true }).waitFor();
    await p.getByText('DISPATCH2610230001', { exact: true }).first().waitFor();
    for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080], [1093, 614], [768, 1024], [375, 812], [812, 375]]) {
      await p.setViewportSize({ width, height });
      await p.waitForFunction(() => { const modal = document.querySelector('.trip-flow:not(dialog)'); const height = innerHeight <= 500 ? innerHeight - 16 : innerWidth <= 639 ? innerHeight : Math.min(innerHeight * .9, 1080); return modal && Math.abs(modal.getBoundingClientRect().height - height) < 2; });
      await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const layout = await p.getByRole('dialog').evaluate(element => ({ shellHeight: element.clientHeight, cssHeight: getComputedStyle(element).height, width: innerWidth, overflow: element.scrollWidth > element.clientWidth || document.documentElement.scrollWidth > innerWidth, bodyHeight: element.querySelector('.trip-flow-body').clientHeight, footerBottom: element.querySelector('footer').getBoundingClientRect().bottom, viewportHeight: innerHeight }));
      assert(!layout.overflow && layout.bodyHeight > 50 && layout.footerBottom <= height + 1, `Add Trip layout failed: ${JSON.stringify(layout)}`);
      layouts.push({ modal: 'manual', ...layout });
    }
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p.getByRole('button', { name: 'Close', exact: true }).focus();
    await p.keyboard.press('Shift+Tab');
    assert(await p.getByRole('button', { name: 'Next', exact: true }).evaluate(element => element === document.activeElement), 'Backward focus did not wrap');
    await p.keyboard.press('Tab');
    assert(await p.getByRole('button', { name: 'Close', exact: true }).evaluate(element => element === document.activeElement), 'Forward focus did not wrap');
    await p.getByRole('button', { name: 'Choose status', exact: true }).click();
    await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Escape');
    assert(await p.getByRole('dialog').count() === 1, 'Dropdown Escape closed the modal');
    assert(await p.getByRole('button', { name: 'Choose status', exact: true }).evaluate(element => element === document.activeElement), 'Dropdown did not restore focus');
    await p.getByLabel('Loading date', { exact: false }).fill('2026-10-24');
    await p.getByLabel('Estimated delivery', { exact: false }).fill('2026-10-23');
    assert(await p.locator('input[aria-invalid=true]').count() === 1, 'Schedule error not exposed inline');
    await p.getByLabel('Estimated delivery', { exact: false }).fill('2026-10-25');
    await p.getByRole('button', { name: 'Next', exact: true }).click();
    await p.getByRole('button', { name: 'Import CSV / XLSX', exact: true }).click();
    await p.getByRole('heading', { name: 'Add trip from CSV', exact: true }).waitFor();
    for (const [width, height] of [[1366, 768], [1440, 900], [1920, 1080], [1093, 614], [768, 1024], [375, 812], [812, 375]]) {
      await p.setViewportSize({ width, height });
      await p.waitForFunction(() => { const modal = document.querySelector('.trip-flow:not(dialog)'); const height = innerHeight <= 500 ? innerHeight - 16 : innerWidth <= 639 ? innerHeight : Math.min(innerHeight * .9, 1080); return modal && Math.abs(modal.getBoundingClientRect().height - height) < 2; });
      await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const layout = await p.getByRole('dialog').evaluate(element => ({ shellHeight: element.clientHeight, cssHeight: getComputedStyle(element).height, width: innerWidth, overflow: element.scrollWidth > element.clientWidth || document.documentElement.scrollWidth > innerWidth, bodyHeight: element.querySelector('.trip-flow-body').clientHeight, footerBottom: element.querySelector('footer').getBoundingClientRect().bottom, viewportHeight: innerHeight }));
      assert(!layout.overflow && layout.bodyHeight > 50 && layout.footerBottom <= height + 1, `CSV layout failed: ${JSON.stringify(layout)}`);
      layouts.push({ modal: 'csv', ...layout });
    }
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p.locator('input[type=file]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not a spreadsheet') });
    await p.getByText('invalid.txt: choose CSV or XLSX.', { exact: true }).waitFor();
    await p.locator('.trip-upload-zone').evaluate(element => {
      const transfer = new DataTransfer(); transfer.items.add(new File(['Customer Name,Ship To,Customer Model,Quantity,CBM\nCustomer,Store,MODEL-1,2,1.5'], 'trip.csv', { type: 'text/csv' }));
      element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }));
      if (element.dataset.disabled === 'true') throw Error('Drop area incorrectly disabled');
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    });
    await p.getByRole('heading', { name: 'Review your source files', exact: true }).waitFor();
    assert(await p.getByText('trip.csv', { exact: true }).count() > 0, 'Dropped file name missing');
    await p.getByRole('button', { name: 'Check CSV', exact: true }).click();
    await p.getByText('An administrator needs to finish enabling trip imports. Your file and draft are safe.', { exact: true }).waitFor();
    assert(await p.getByRole('button', { name: 'Import CSV', exact: true }).isEnabled(), 'Signed rows should remain reviewable while server setup is pending');
    await p.getByRole('button', { name: 'Close import', exact: true }).click();
    await p.getByRole('heading', { name: 'Add trip', exact: true }).waitFor();
    await p.getByRole('button', { name: 'Back', exact: true }).click();
    assert(await p.getByLabel('Loading date', { exact: false }).inputValue() === '2026-10-24', 'Manual draft lost when returning from CSV');
    await p.emulateMedia({ reducedMotion: 'reduce' });
    const animation = await p.getByRole('dialog').evaluate(element => getComputedStyle(element).animationDuration);
    assert(parseFloat(animation) <= 0.001, 'Reduced motion ignored');
    await p.keyboard.press('Escape');
    await p.getByRole('dialog').waitFor({ state: 'detached' });
    assert(await p.getByRole('button', { name: 'Open trip planner' }).evaluate(element => element === document.activeElement), 'Opener focus not restored');
    assert(await p.evaluate(() => document.body.style.overflow) !== 'hidden', 'Scroll lock was not restored');
    assert(errors.length === 0, `Runtime errors: ${errors.join('; ')}`);
    return { layouts, focusWrap: true, focusRestored: true, dropdownKeyboard: true, inlineDateError: true, invalidFile: true, csvDropAndPreview: true, serverSetupWarningVisible: true, manualDraftPreserved: true, reducedMotion: true, productionWrites: 0, runtimeErrors: errors };
  } finally { await context.close(); }
}
