import { chromium } from 'file:///C:/Users/gunda/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';

// Isolated UI inspection: all API traffic is intercepted; no live deletion.
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const names = ['DES APPL. - SMCT MANGA', 'VIC IMPERIAL APPLIANCE - TAGBILARAN', 'DESMARK - PREMIO PANABO', 'DES-MARKETING BORONGAN', 'LGM - CARMEN', 'FIRSTAR INC. - BACOOR', 'RRS MKTG. - DOLORES', 'DES-MARKETING CATARMAN'];
  const stores = names.map((name, i) => ({ id: `10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`, name, status: 'ACTIVE' }));
  let replayedDeletes = 0;
  await page.route('**/src/context/AuthContext.tsx*', route => route.fulfill({ contentType: 'text/javascript', body: "export const useAuth=()=>({accessToken:'isolated-inspection',profile:{id:'inspection-admin',role:'ADMIN'}});" }));
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let data = [];
    if (path.includes('/delete')) {
      replayedDeletes++;
      data = { deleted: [], failed: stores.map(s => ({ id: s.id, message: 'This record is used by other records or protected attachments. Clear eligible relationships, or mark it inactive to preserve history.' })) };
    } else if (path.includes('/master-data/')) {
      const rows = /\/stores$/.test(path) ? stores : [];
      data = { rows, pagination: { page: 1, limit: 100, total: rows.length, totalPages: 1 } };
    }
    await route.fulfill({ status: 200, json: { success: true, data } });
  });
  await page.goto('http://127.0.0.1:5173/tests/table-fixture.html');
  await page.evaluate(async () => {
    await import('/src/index.css');
    const main = await (await fetch('/src/main.tsx')).text();
    const React = (await import(main.match(/from ["']([^"']*\/react\.js[^"']*)["']/)[1])).default;
    const DOM = await import(main.match(/from ["']([^"']*react-dom_client\.js[^"']*)["']/)[1]);
    const { default: View } = await import('/src/pages/Admin/views/MasterDataView.tsx');
    const el = document.createElement('div'); el.style.cssText='height:850px;display:flex;flex-direction:column'; document.body.append(el);
    (DOM.createRoot ?? DOM.default.createRoot)(el).render(React.createElement(View));
  });
  await page.getByRole('tab', { name: 'Stores', exact: true }).click();
  await page.getByText(names[0], { exact: true }).first().waitFor();
  const tabs = await page.getByRole('tab').allTextContents();
  await page.getByRole('button', { name: 'Select row 1', exact: true }).click();
  for (let i=2; i<=8; i++) await page.getByRole('checkbox', { name: `Select row ${i}`, exact: true }).check();
  await page.getByRole('button', { name: 'Bulk Delete selected database records', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete 8 records', exact: true }).click();
  await page.getByRole('dialog').getByRole('alert').waitFor();
  const alert = await page.getByRole('dialog').getByRole('alert').textContent();
  if (!alert.includes('8 records could not be deleted.')) throw Error(alert);
  console.log(JSON.stringify({ tabs, error: alert, hasExceptionManagementTab: tabs.some(t=>/exception/i.test(t)) }));
  await page.screenshot({ path: '.playwright-mcp/store-deletion-inspection.png' });
  console.log(JSON.stringify({ isolated: true, liveWrites: 0, replayedDeletes }));
} finally { await browser.close(); }
