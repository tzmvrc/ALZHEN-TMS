import { chromium } from 'file:///C:/Users/gunda/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const filename = process.argv[2] || 'frontend/tests/csv-complete-details.browser.js';
  const run = (0, eval)(`(${await readFile(filename, 'utf8')})`);
  console.log(JSON.stringify(await run(page, process.argv[3])));
} finally { await browser.close(); }
