import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactsDir = 'C:/Users/Dell/.gemini/antigravity-ide/brain/0586cfe3-8666-4147-8747-0db07f5ed1bb';
const userDataDir = path.join(artifactsDir, 'scratch', 'chrome-profile');

await fs.mkdir(userDataDir, {recursive: true});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const chromeProc = spawn(chromePath, [
  '--remote-debugging-port=9225',
  '--headless=new',
  '--disable-gpu',
  `--user-data-dir=${userDataDir}`,
  'about:blank',
]);

await sleep(1500);

const versionRes = await fetch('http://127.0.0.1:9225/json/new', {method: 'PUT'});
const target = await versionRes.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const cb = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === id) {
        ws.removeEventListener('message', cb);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', cb);
    ws.send(JSON.stringify({id, method, params}));
  });
}

async function evalFn(expr) {
  let code = expr.trim();
  if (!code.startsWith('(() =>') && !code.startsWith('{')) {
    if (code.includes('const ') || code.includes('let ') || code.includes('function ') || code.includes('return ')) {
      code = `(() => {\n${code}\n})()`;
    }
  }
  const res = await send('Runtime.evaluate', {
    expression: code,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error('Eval error: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result?.value;
}

async function screenshot(filename) {
  const res = await send('Page.captureScreenshot', {format: 'png'});
  const buf = Buffer.from(res.data, 'base64');
  const filePath = path.join(artifactsDir, filename);
  await fs.writeFile(filePath, buf);
  console.log(`✓ Saved screenshot: ${filename}`);
}

const results = {};

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 950,
    deviceScaleFactor: 1,
    mobile: false,
  });

  console.log('====================================================');
  console.log('🚀 Running AntiGravity Browser Verification for Pricing Helper');
  console.log('====================================================\n');

  // ====================================================
  // PART A: PRODUCT SETUP IN /inventory
  // ====================================================
  console.log('--- PART A: Product Setup in /inventory ---');
  await send('Page.navigate', {url: 'http://127.0.0.1:3000/inventory'});
  await sleep(1500);

  // 1. Initial locked state: header says Unlock profit
  const initialHeaderBtn = await evalFn(`
    Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('profit'))?.textContent.trim()
  `);
  console.log('Initial header button:', initialHeaderBtn);
  assert.equal(initialHeaderBtn, 'Unlock profit', 'Initial header must be "Unlock profit"');

  // 2. Open Add Product modal while locked
  await evalFn(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add product'));
    btn?.click();
  `);
  await sleep(600);

  // Helper must be ABSENT while locked
  const helperInProductModalLocked = await evalFn(`
    document.body.innerText.includes('Help me set the selling price')
  `);
  assert.equal(helperInProductModalLocked, false, 'Pricing helper must be ABSENT in product modal while profit is locked');
  console.log('✓ Product modal (locked): Pricing helper is ABSENT');
  await screenshot('browser_locked_product_modal.png');

  // Close modal
  await evalFn(`
    const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel');
    cancelBtn?.click();
  `);
  await sleep(400);

  // 3. Unlock profit
  console.log('Unlocking profit...');
  await evalFn(`
    const unlockBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Unlock profit'));
    unlockBtn?.click();
  `);
  await sleep(400);

  await evalFn(`
    const passInput = document.querySelector('input[type="password"]');
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(passInput, 'ProfitDemo2026!');
    passInput.dispatchEvent(new Event('input', {bubbles: true}));
    passInput.dispatchEvent(new Event('change', {bubbles: true}));
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Unlock Totals'));
    submitBtn?.click();
  `);
  await sleep(600);

  const headerBtnUnlockedA = await evalFn(`
    Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('profit'))?.textContent.trim()
  `);
  assert.equal(headerBtnUnlockedA, 'Lock profit', 'Header must now say "Lock profit"');
  console.log('✓ Profit unlocked. Header says "Lock profit"');

  // 4. Open Add Product modal while unlocked -> Helper must be PRESENT & collapsed
  await evalFn(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add product'));
    btn?.click();
  `);
  await sleep(600);

  const helperPresentProductModal = await evalFn(`
    Array.from(document.querySelectorAll('summary')).some(s => s.textContent.includes('Help me set the selling price'))
  `);
  assert.equal(helperPresentProductModal, true, 'Pricing helper must now appear in product setup modal');
  console.log('✓ Product modal (unlocked): Pricing helper is PRESENT and collapsed');

  // 5. Expand helper and test Case 2 inputs
  await evalFn(`
    const summary = Array.from(document.querySelectorAll('summary')).find(s => s.textContent.includes('Help me set the selling price'));
    summary?.click();
  `);
  await sleep(400);

  await evalFn(`
    (() => {
      function setVal(selector, val) {
        const el = document.querySelector(selector);
        const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
      }
      const select = document.querySelector('details.notice select');
      if (select) {
        Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, 'recoverable');
        select.dispatchEvent(new Event('change', {bubbles: true}));
      }
      setVal('input[aria-label="Purchase GST percentage"]', '18');
      setVal('input[aria-label="Pricing cost per unit"]', '11800');
      setVal('input[aria-label="Desired profit per unit"]', '2000');
    })()
  `);
  await sleep(400);

  // Verify "Cost used: ₹10,000.00 per unit."
  const costUsedTextProduct = await evalFn(`
    document.querySelector('details.notice')?.innerText.includes('Cost used: ₹10,000.00 per unit.')
  `);
  assert.equal(costUsedTextProduct, true, 'Cost used must display ₹10,000.00 per unit');
  console.log('✓ Product setup: Recoverable GST removed correctly (Cost used: ₹10,000.00)');

  // Click "Use cost + desired profit"
  await evalFn(`
    const useBtn = Array.from(document.querySelectorAll('details.notice button')).find(b => b.textContent.includes('Use cost + desired profit'));
    useBtn?.click();
  `);
  await sleep(500);

  // Check product setup preview boxes
  const previewBoxes = await evalFn(`
    Array.from(document.querySelectorAll('.summary-box')).map(b => ({
      label: b.querySelector('p')?.textContent.trim(),
      val: (b.querySelector('h2') || b.querySelector('strong'))?.textContent.trim(),
    }))
  `);
  console.log('Product setup preview boxes:', previewBoxes);
  assert.deepEqual(previewBoxes, [
    {label: 'Price without GST', val: '₹12,000.00'},
    {label: 'GST (18%)', val: '₹2,160.00'},
    {label: 'Customer pays', val: '₹14,160.00'}
  ], 'Product setup preview boxes must be ₹12,000 / ₹2,160 / ₹14,160');

  // Check estimate text inside helper
  const productEstimateText = await evalFn(`
    document.querySelector('details.notice p[aria-live="polite"]')?.textContent.trim()
  `);
  console.log('Product setup helper estimate text:', productEstimateText);
  assert.ok(productEstimateText.includes('before GST ₹12,000.00'), 'Must include before GST ₹12,000.00');
  assert.ok(productEstimateText.includes('GST ₹2,160.00'), 'Must include GST ₹2,160.00');
  assert.ok(productEstimateText.includes('customer pays ₹14,160.00'), 'Must include customer pays ₹14,160.00');
  assert.ok(productEstimateText.includes('Estimated line profit after discounts: ₹2,000.00'), 'Must include estimated profit ₹2,000.00');

  await screenshot('browser_product_setup_unlocked.png');
  results.partA_product_setup = true;

  // Close product modal
  await evalFn(`
    const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel');
    cancelBtn?.click();
  `);
  await sleep(400);

  // 6. Test Relocking on /inventory -> Helper must DISAPPEAR
  console.log('Testing relocking on /inventory...');
  await evalFn(`
    const lockBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Lock profit'));
    lockBtn?.click();
  `);
  await sleep(400);

  // Open Add Product modal again -> helper must be ABSENT
  await evalFn(`
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add product'));
    btn?.click();
  `);
  await sleep(500);

  const helperPresentAfterLock = await evalFn(`
    document.body.innerText.includes('Help me set the selling price')
  `);
  assert.equal(helperPresentAfterLock, false, 'Pricing helper must disappear after relocking profit');
  console.log('✓ Product modal: Pricing helper disappeared after relocking');

  // Close modal
  await evalFn(`
    const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel');
    cancelBtn?.click();
  `);
  await sleep(400);

  // ====================================================
  // PART B: SALES INVOICE & DOCUMENT COMPOSER
  // ====================================================
  console.log('\n--- PART B: Sales Invoice & Document Composer in /sales/new ---');
  await send('Page.navigate', {url: 'http://127.0.0.1:3000/sales/new'});
  await sleep(1500);

  // 1. Initial locked state on sales composer
  const salesHeaderBtn = await evalFn(`
    Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('profit'))?.textContent.trim()
  `);
  assert.equal(salesHeaderBtn, 'Unlock profit', 'Sales composer initial header must be "Unlock profit"');

  // Add custom charge line
  await evalFn(`
    const chargeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('custom charge'));
    chargeBtn?.click();
  `);
  await sleep(400);

  // Add catalog product
  await evalFn(`
    const select = document.querySelector('select[aria-label="Select product to add"]');
    if (select && select.options.length > 1) {
      select.value = select.options[1].value;
      select.dispatchEvent(new Event('change', {bubbles: true}));
    }
    const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add item'));
    addBtn?.click();
  `);
  await sleep(600);

  // Verify pricing helper is ABSENT on all rows while locked
  const salesHelperLocked = await evalFn(`
    document.body.innerText.includes('Help me set the selling price')
  `);
  assert.equal(salesHelperLocked, false, 'Pricing helper must be ABSENT on all sales rows while locked');
  console.log('✓ Sales composer (locked): Pricing helper is ABSENT on all rows');
  await screenshot('browser_locked_sales_composer.png');

  // 2. Unlock profit on sales composer
  console.log('Unlocking profit on sales composer...');
  await evalFn(`
    const unlockBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Unlock profit'));
    unlockBtn?.click();
  `);
  await sleep(400);

  await evalFn(`
    const passInput = document.querySelector('input[type="password"]');
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(passInput, 'ProfitDemo2026!');
    passInput.dispatchEvent(new Event('input', {bubbles: true}));
    passInput.dispatchEvent(new Event('change', {bubbles: true}));
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Unlock Totals'));
    submitBtn?.click();
  `);
  await sleep(600);

  const salesHeaderUnlocked = await evalFn(`
    Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('profit'))?.textContent.trim()
  `);
  assert.equal(salesHeaderUnlocked, 'Lock profit', 'Header must now say "Lock profit"');

  // 3. Verify helper is present on Custom charge row, and ABSENT on Catalog product row
  const helperSummaryPresentSales = await evalFn(`
    Array.from(document.querySelectorAll('summary')).some(s => s.textContent.includes('Help me set the selling price'))
  `);
  assert.equal(helperSummaryPresentSales, true, 'Pricing helper must appear on custom charge line');

  const catalogRowHasHelperSales = await evalFn(`
    (() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'));
      // Row 2 is catalog product
      const row2 = rows[1];
      return row2 ? row2.innerText.includes('Help me set the selling price') : false;
    })()
  `);
  assert.equal(catalogRowHasHelperSales, false, 'Existing catalog product line must NOT have a pricing helper');
  console.log('✓ Custom charge row has pricing helper; Catalog product row does NOT');

  // 4. Test Case 2 on Custom Charge Row
  console.log('\n--- Case 2: Recoverable GST 18%, Cost 11800, Profit 2000 ---');
  // Expand helper on custom charge line
  await evalFn(`
    const summary = Array.from(document.querySelectorAll('summary')).find(s => s.textContent.includes('Help me set the selling price'));
    summary?.click();
  `);
  await sleep(300);

  await evalFn(`
    (() => {
      function setVal(selector, val) {
        const el = document.querySelector(selector);
        const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, val);
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
      }
      const select = document.querySelector('details.notice select');
      if (select) {
        Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, 'recoverable');
        select.dispatchEvent(new Event('change', {bubbles: true}));
      }
      setVal('input[aria-label="Purchase GST percentage"]', '18');
      setVal('input[aria-label="Pricing cost per unit"]', '11800');
      setVal('input[aria-label="Desired profit per unit"]', '2000');
    })()
  `);
  await sleep(400);

  // Click "Use cost + desired profit"
  await evalFn(`
    const useBtn = Array.from(document.querySelectorAll('details.notice button')).find(b => b.textContent.includes('Use cost + desired profit'));
    useBtn?.click();
  `);
  await sleep(500);

  const line1Rates = await evalFn(`
    (() => {
      const incl = document.querySelector('input[aria-label="Item 1 rate including GST"]')?.value;
      const excl = document.querySelector('input[aria-label="Item 1 rate excluding GST"]')?.value;
      const total = document.querySelectorAll('table tbody tr')[0]?.querySelector('td.amount')?.childNodes[0]?.textContent?.trim();
      const estimate = document.querySelector('details.notice p[aria-live="polite"]')?.textContent.trim();
      return {incl, excl, total, estimate};
    })()
  `);
  console.log('Case 2 applied line 1 rates:', line1Rates);
  assert.equal(Number(line1Rates.excl), 12000, 'Exclusive rate must be 12000');
  assert.equal(Number(line1Rates.incl), 14160, 'Inclusive rate must be 14160');
  assert.equal(line1Rates.total, '₹14,160.00', 'Customer total must be ₹14,160.00');
  assert.ok(line1Rates.estimate.includes('Estimated line profit after discounts: ₹2,000.00'), 'Estimated profit must be ₹2,000.00');
  await screenshot('browser_service_rate_case2.png');
  results.partB_case2 = true;

  // 5. Case 3: Quantity 2 and 10% Discount
  console.log('\n--- Case 3: Quantity 2 and 10% Discount ---');
  await evalFn(`
    (() => {
      const qtyInput = document.querySelector('input[aria-label="Item 1 quantity"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(qtyInput, '2');
      qtyInput.dispatchEvent(new Event('input', {bubbles: true}));
      qtyInput.dispatchEvent(new Event('change', {bubbles: true}));
    })()
  `);
  await sleep(400);

  const lineQty2 = await evalFn(`
    (() => {
      const total = document.querySelectorAll('table tbody tr')[0]?.querySelector('td.amount')?.childNodes[0]?.textContent?.trim();
      const estimate = document.querySelector('details.notice p[aria-live="polite"]')?.textContent.trim();
      return {total, estimate};
    })()
  `);
  console.log('Qty 2 results:', lineQty2);
  assert.equal(lineQty2.total, '₹28,320.00', 'Qty 2 total must be ₹28,320.00');
  assert.ok(lineQty2.estimate.includes('Estimated line profit after discounts: ₹4,000.00'), 'Qty 2 profit must be ₹4,000.00');

  // Apply 10% discount
  await evalFn(`
    (() => {
      const discInput = document.querySelector('input[aria-label="Item 1 discount"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(discInput, '10');
      discInput.dispatchEvent(new Event('input', {bubbles: true}));
      discInput.dispatchEvent(new Event('change', {bubbles: true}));
    })()
  `);
  await sleep(400);

  const lineDisc10 = await evalFn(`
    (() => {
      const total = document.querySelectorAll('table tbody tr')[0]?.querySelector('td.amount')?.childNodes[0]?.textContent?.trim();
      const estimate = document.querySelector('details.notice p[aria-live="polite"]')?.textContent.trim();
      return {total, estimate};
    })()
  `);
  console.log('10% discount results:', lineDisc10);
  assert.ok(lineDisc10.estimate.includes('before GST ₹21,600.00'), 'Taxable value before GST must be ₹21,600.00');
  assert.ok(lineDisc10.estimate.includes('Estimated line profit after discounts: ₹1,600.00'), 'Estimated profit after 10% discount must be ₹1,600.00');
  await screenshot('browser_service_qty2_discount10.png');
  results.partB_case3 = true;

  // 6. Case 4: Full Nonrecoverable Cost 11800 + Profit 2000 -> 13800
  console.log('\n--- Case 4: Full Nonrecoverable Cost (13800) ---');
  await evalFn(`
    (() => {
      const select = document.querySelector('details.notice select');
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, 'full');
      select.dispatchEvent(new Event('change', {bubbles: true}));
      const useBtn = Array.from(document.querySelectorAll('details.notice button')).find(b => b.textContent.includes('Use cost + desired profit'));
      useBtn?.click();
    })()
  `);
  await sleep(400);

  const nonrecoverableRate = await evalFn(`
    document.querySelector('input[aria-label="Item 1 rate excluding GST"]')?.value
  `);
  console.log('Nonrecoverable exclusive rate:', nonrecoverableRate);
  assert.equal(Number(nonrecoverableRate), 13800, 'Nonrecoverable rate must be 13800');
  assert.notEqual(Number(nonrecoverableRate), 12000, 'Must differ from recoverable Case 2 rate (12000)');
  await screenshot('browser_service_nonrecoverable_case4.png');
  results.partB_case4 = true;

  // 7. Case 5: Purchase tax 18%, sales tax 5% and zero-tax treatments
  console.log('\n--- Case 5: Sales Tax 5%, Exempt, NonGST, Taxable 0% ---');
  // Reset discount to 0, qty to 1, helper to recoverable 18% cost 11800, profit 2000 -> rate 12000
  await evalFn(`
    (() => {
      function setVal(selector, val) {
        const el = document.querySelector(selector);
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, val);
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
      }
      setVal('input[aria-label="Item 1 quantity"]', '1');
      setVal('input[aria-label="Item 1 discount"]', '0');
      const select = document.querySelector('details.notice select');
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, 'recoverable');
      select.dispatchEvent(new Event('change', {bubbles: true}));
      const useBtn = Array.from(document.querySelectorAll('details.notice button')).find(b => b.textContent.includes('Use cost + desired profit'));
      useBtn?.click();
    })()
  `);
  await sleep(400);

  // Set sales tax to 5%
  await evalFn(`
    (() => {
      const taxSelect = document.querySelector('select[aria-label="Item 1 GST rate or treatment"]');
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(taxSelect, '5');
      taxSelect.dispatchEvent(new Event('change', {bubbles: true}));
    })()
  `);
  await sleep(400);

  const tax5Result = await evalFn(`
    (() => {
      const total = document.querySelectorAll('table tbody tr')[0]?.querySelector('td.amount')?.childNodes[0]?.textContent?.trim();
      const estimate = document.querySelector('details.notice p[aria-live="polite"]')?.textContent.trim();
      return {total, estimate};
    })()
  `);
  console.log('5% Sales Tax Result:', tax5Result);
  assert.equal(tax5Result.total, '₹12,600.00', 'At 5% GST on ₹12,000, customer total must be ₹12,600.00');
  assert.ok(tax5Result.estimate.includes('GST ₹600.00'), 'Sales GST must be ₹600.00');
  assert.ok(tax5Result.estimate.includes('Estimated line profit after discounts: ₹2,000.00'), 'Profit must remain ₹2,000.00');

  // Test Exempt
  await evalFn(`
    (() => {
      const taxSelect = document.querySelector('select[aria-label="Item 1 GST rate or treatment"]');
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(taxSelect, 'Exempt');
      taxSelect.dispatchEvent(new Event('change', {bubbles: true}));
    })()
  `);
  await sleep(300);
  const exemptTotal = await evalFn(`document.querySelectorAll('table tbody tr')[0]?.querySelector('td.amount')?.childNodes[0]?.textContent?.trim()`);
  assert.equal(exemptTotal, '₹12,000.00', 'Exempt should add 0 output GST');

  // Test NonGST
  await evalFn(`
    (() => {
      const taxSelect = document.querySelector('select[aria-label="Item 1 GST rate or treatment"]');
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(taxSelect, 'NonGST');
      taxSelect.dispatchEvent(new Event('change', {bubbles: true}));
    })()
  `);
  await sleep(300);
  const nonGstTotal = await evalFn(`document.querySelectorAll('table tbody tr')[0]?.querySelector('td.amount')?.childNodes[0]?.textContent?.trim()`);
  assert.equal(nonGstTotal, '₹12,000.00', 'NonGST should add 0 output GST');

  // Test Taxable 0%
  await evalFn(`
    (() => {
      const taxSelect = document.querySelector('select[aria-label="Item 1 GST rate or treatment"]');
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(taxSelect, '0');
      taxSelect.dispatchEvent(new Event('change', {bubbles: true}));
    })()
  `);
  await sleep(300);
  const zeroTotal = await evalFn(`document.querySelectorAll('table tbody tr')[0]?.querySelector('td.amount')?.childNodes[0]?.textContent?.trim()`);
  assert.equal(zeroTotal, '₹12,000.00', 'Taxable 0% should add 0 output GST');
  console.log('✓ Sales tax 5% and zero-tax treatments verified');
  results.partB_case5 = true;

  // 8. Case 6: Below-cost Warning & Validation
  console.log('\n--- Case 6: Below-cost Warning & Validation ---');
  // Set sales tax back to 18% and enter rate = 8000 (below cost 10000)
  await evalFn(`
    (() => {
      const taxSelect = document.querySelector('select[aria-label="Item 1 GST rate or treatment"]');
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(taxSelect, '18');
      taxSelect.dispatchEvent(new Event('change', {bubbles: true}));
      const exclInput = document.querySelector('input[aria-label="Item 1 rate excluding GST"]');
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(exclInput, '8000');
      exclInput.dispatchEvent(new Event('input', {bubbles: true}));
      exclInput.dispatchEvent(new Event('change', {bubbles: true}));
    })()
  `);
  await sleep(400);

  const belowCostText = await evalFn(`
    document.querySelector('details.notice p[aria-live="polite"]')?.textContent.trim()
  `);
  console.log('Below-cost estimate text:', belowCostText);
  assert.ok(belowCostText.includes('Estimated line profit after discounts: -₹2,000.00'), 'Must show negative profit of -₹2,000.00');
  assert.ok(belowCostText.includes('This price is below the entered cost.'), 'Must display below-cost warning message');
  console.log('✓ Below-cost warning verified');
  await screenshot('browser_below_cost_warning.png');
  results.partB_case6 = true;

  // 9. Relocking Profit -> Sensitive Helper & Estimates DISAPPEAR
  console.log('\n--- Relocking Profit (Sensitive Estimates Vanish) ---');
  await evalFn(`
    const lockBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Lock profit'));
    lockBtn?.click();
  `);
  await sleep(500);

  const headerBtnRelockedB = await evalFn(`
    Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('profit'))?.textContent.trim()
  `);
  assert.equal(headerBtnRelockedB, 'Unlock profit', 'Header button must change back to "Unlock profit"');

  const helperPresentAfterLockB = await evalFn(`
    document.body.innerText.includes('Help me set the selling price')
  `);
  assert.equal(helperPresentAfterLockB, false, 'Pricing helper and sensitive estimates must completely disappear when relocked');
  console.log('✓ Relocked profit: Pricing helper and sensitive estimates vanished immediately');
  await screenshot('browser_relocked_profit_state.png');
  results.partB_relock = true;

  console.log('\n====================================================');
  console.log('🎉 ALL AntiGravity Verification Steps PASSED cleanly!');
  console.log('====================================================');
  console.log('Results Summary:', results);

} catch (err) {
  console.error('❌ Verification failed with error:', err);
  process.exitCode = 1;
} finally {
  try {
    chromeProc.kill();
  } catch {}
}
