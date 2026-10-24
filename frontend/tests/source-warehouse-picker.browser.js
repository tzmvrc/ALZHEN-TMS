// Run against the local Vite fixture. Every API request is mocked.
async page => {
  const context = await page.context().browser().newContext({ viewport: { width: 1366, height: 768 } });
  const p = await context.newPage(), writes = [];
  const assert = (value, message) => { if (!value) throw Error(message); };
  try {
    await p.route('**/src/context/AuthContext.tsx*', route => route.fulfill({ contentType: 'text/javascript', body: "export const useAuth=()=>({profile:{role:'ADMIN'}});" }));
    await p.route('**/api/**', async route => {
      const request = route.request();
      if (request.method() === 'POST') {
        assert(new URL(request.url()).pathname.endsWith('/master-data/warehouses'), 'Unexpected write');
        writes.push(request.postDataJSON());
        await route.fulfill({ json: { success: true, data: { id: 'created-warehouse', ...writes.at(-1) } } });
      } else await route.fulfill({ json: { success: true, data: [] } });
    });
    await p.goto('http://127.0.0.1:5173/tests/table-fixture.html');
    await p.evaluate(async () => {
      await import('/src/index.css');
      const main = await (await fetch('/src/main.tsx')).text();
      const React = (await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default;
      const DOM = await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
      const { default: Picker } = await import('/src/components/admin/SourceWarehousePicker.tsx');
      function Fixture() {
        const [choice, setChoice] = React.useState(null);
        return React.createElement(Picker, { token: 'fixture', source: 'Cebu SQ', value: choice?.label ?? 'Cebu SQ', matched: Boolean(choice), conflict: false, disabled: false, onSelect: option => { window.warehouseChoice = option; setChoice(option); } });
      }
      (DOM.createRoot ?? DOM.default.createRoot)(document.body.appendChild(document.createElement('div'))).render(React.createElement(Fixture));
    });
    await p.getByRole('button', { name: /Add.*Cebu SQ.*as a warehouse/ }).click();
    const dialog = p.getByRole('dialog', { name: 'Add warehouses' });
    assert(await dialog.getByLabel('Name', { exact: true }).inputValue() === 'Cebu SQ', 'CSV name not prefilled');
    assert(await dialog.getByLabel('Code', { exact: true }).inputValue() === 'Cebu SQ', 'CSV code not prefilled');
    assert(writes.length === 0, 'Warehouse created before explicit confirmation');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert(writes.length === 0, 'Cancel created warehouse');
    await p.getByRole('button', { name: /Add.*Cebu SQ.*as a warehouse/ }).click();
    await dialog.getByRole('button', { name: 'Create and select', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    assert(writes.length === 1 && writes[0].name === 'Cebu SQ' && writes[0].code === 'Cebu SQ', 'Wrong master-data create payload');
    assert((await p.evaluate(() => window.warehouseChoice)).id === 'created-warehouse', 'Created ID not selected');
    assert(await p.getByRole('button', { name: /as a warehouse/ }).count() === 0, 'Creation action remains on matched warehouse');
    return { csvNamePrefilled: true, explicitCreate: true, cancelSafe: true, createdIdSelected: true, productionWrites: 0 };
  } finally { await context.close(); }
}
