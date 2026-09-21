import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\Dell\\.gemini\\antigravity-ide\\brain\\8dccc6c6-c2f4-4d74-8225-e23258e9e436\\chrome-profile';
const artifactsDir = 'C:/Users/Dell/.gemini/antigravity-ide/brain/8dccc6c6-c2f4-4d74-8225-e23258e9e436';
const email = 'admin.acc.1790008932582@example.com';
const password = 'Password123!';
const supplierId = 'SUP-MUBH4EZG-9N0N';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const proc = spawn(chromePath, [
  '--remote-debugging-port=9222',
  '--headless=new',
  '--disable-gpu',
  `--user-data-dir=${userDataDir}`,
  'about:blank',
]);

await sleep(1500);
const versionRes = await fetch('http://127.0.0.1:9222/json/new', {method: 'PUT'});
const target = await versionRes.json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 100000);
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
  const res = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  return res.result?.value;
}

async function waitFor(expr, timeoutMs = 25000, pollMs = 300) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await evalFn(`Boolean(${expr})`);
      if (ok) return true;
    } catch {}
    await sleep(pollMs);
  }
  throw new Error(`Timeout waiting for condition: ${expr}`);
}

async function screenshot(filename) {
  const res = await send('Page.captureScreenshot', {format: 'png'});
  const buf = Buffer.from(res.data, 'base64');
  const filePath = path.join(artifactsDir, filename);
  await fs.writeFile(filePath, buf);
  console.log(`✓ Saved ${filename}`);
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 950,
    deviceScaleFactor: 1,
    mobile: false,
  });

  // Step 1: Ensure Logged In
  console.log('Verifying login session...');
  await send('Page.navigate', {url: 'http://127.0.0.1:3000/account'});
  await sleep(2000);
  const alreadyLive = await evalFn(`document.body.innerText.includes('Acceptance Hardware & Electronics')`);
  if (!alreadyLive) {
    console.log('Signing in at /account...');
    await evalFn(`
      (() => {
        function setReactInput(input, val) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(input, val);
          input.dispatchEvent(new Event('input', {bubbles: true}));
          input.dispatchEvent(new Event('change', {bubbles: true}));
        }
        const emailInput = document.querySelector('input[type="email"]');
        const passInput = document.querySelector('input[type="password"]');
        if (emailInput && passInput) {
          setReactInput(emailInput, ${JSON.stringify(email)});
          setReactInput(passInput, ${JSON.stringify(password)});
          document.querySelector('button[type="submit"]')?.click();
        }
      })()
    `);
    await waitFor(`document.body.innerText.includes('Acceptance Hardware & Electronics')`, 25000);
  }
  console.log('✓ Session verified: Acceptance Hardware & Electronics');

  // Step 2: Customer List (Screenshot 1)
  console.log('Checking /customers...');
  await send('Page.navigate', {url: 'http://127.0.0.1:3000/customers'});
  await waitFor(`document.querySelector('table') && document.body.innerText.includes('Return Test Customer')`, 20000);
  await sleep(1500);
  await screenshot('customer_list.png');

  // Step 3: Direct Serial Selection (Screenshot 2)
  console.log('Navigating to /sales/new...');
  await send('Page.navigate', {url: 'http://127.0.0.1:3000/sales/new'});
  await waitFor(`
    document.querySelector('select[aria-label="Select product to add"]') &&
    document.querySelector('select[aria-label="Select product to add"]').options.length > 1
  `, 20000);
  await sleep(1000);

  // Select customer & product
  console.log('Selecting product...');
  await evalFn(`
    (() => {
      function setReactSelect(select, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(select, val);
        select.dispatchEvent(new Event('change', {bubbles: true}));
      }

      const prodSelect = document.querySelector('select[aria-label="Select product to add"]');
      if (prodSelect) {
        setReactSelect(prodSelect, prodSelect.options[1].value);
      }
    })()
  `);
  await sleep(800);

  console.log('Clicking Add item...');
  await evalFn(`
    (() => {
      const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add item'));
      addBtn?.click();
    })()
  `);

  await waitFor(`
    Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Select stock / serial numbers'))
  `, 15000);

  console.log('Opening stock allocation modal...');
  await evalFn(`
    (() => {
      const stockBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Select stock / serial numbers'));
      stockBtn?.click();
    })()
  `);

  await waitFor(`
    document.querySelector('.modal') &&
    !document.querySelector('.modal').innerText.includes('Loading available lots')
  `, 20000);
  await sleep(2000);

  // Select serial checkbox in modal
  await evalFn(`
    (() => {
      const cbs = Array.from(document.querySelectorAll('.modal input[type="checkbox"]'));
      if (cbs.length > 0 && !cbs[0].checked) cbs[0].click();
    })()
  `);
  await sleep(1000);
  await screenshot('direct_serial_selection.png');

  // Step 4: Customer Return Settlement (Screenshot 3)
  console.log('Navigating to /returns...');
  await send('Page.navigate', {url: 'http://127.0.0.1:3000/returns'});
  await waitFor(`
    Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Customer return'))
  `, 20000);
  await sleep(1000);

  console.log('Opening Customer return modal...');
  await evalFn(`
    (() => {
      const retBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Customer return'));
      retBtn?.click();
    })()
  `);

  // Wait for billSelect options to load
  console.log('Waiting for issued invoices to populate in return modal...');
  await waitFor(`
    (() => {
      const selects = Array.from(document.querySelectorAll('.modal select'));
      const billSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('INV-')));
      return Boolean(billSelect && billSelect.options.length > 1);
    })()
  `, 25000);

  console.log('Selecting invoice...');
  await evalFn(`
    (() => {
      function setReactSelect(select, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(select, val);
        select.dispatchEvent(new Event('change', {bubbles: true}));
      }

      const selects = Array.from(document.querySelectorAll('.modal select'));
      const billSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('INV-')));
      if (billSelect) {
        const opt = Array.from(billSelect.options).find(o => o.text.includes('0007') || o.text.includes('7,000')) || billSelect.options[1];
        setReactSelect(billSelect, opt.value);
      }
    })()
  `);

  console.log('Waiting for return invoice lines...');
  await waitFor(`
    (() => {
      const selects = Array.from(document.querySelectorAll('.modal select'));
      const lineSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('LG 24-inch Monitor') || o.text.includes('returnable')));
      return Boolean(lineSelect && lineSelect.options.length > 1);
    })()
  `, 20000);

  console.log('Configuring settlement options (RestockSellable, RefundNow, Bank)...');
  await evalFn(`
    (() => {
      function setReactSelect(select, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(select, val);
        select.dispatchEvent(new Event('change', {bubbles: true}));
      }
      function setReactInput(input, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, val);
        input.dispatchEvent(new Event('input', {bubbles: true}));
        input.dispatchEvent(new Event('change', {bubbles: true}));
      }

      const selects = Array.from(document.querySelectorAll('.modal select'));
      const lineSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('LG 24-inch Monitor') || o.text.includes('returnable')));
      if (lineSelect && lineSelect.options.length > 1) {
        setReactSelect(lineSelect, lineSelect.options[1].value);
      }

      const dispSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'RestockSellable'));
      if (dispSelect) setReactSelect(dispSelect, 'RestockSellable');

      const settSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'RefundNow'));
      if (settSelect) setReactSelect(settSelect, 'RefundNow');

      const accSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'Bank'));
      if (accSelect) setReactSelect(accSelect, 'Bank');

      const reasonInput = document.querySelector('.modal input[placeholder*="Defective item"]');
      if (reasonInput) setReactInput(reasonInput, 'Customer return settlement verified');

      const cb = document.querySelector('.modal .serial-list input[type="checkbox"]');
      if (cb && !cb.checked) cb.click();
    })()
  `);
  await sleep(2000);
  await screenshot('customer_return_settlement.png');

  // Step 5: Supplier Advance & Refund Result (Screenshot 4)
  console.log(`Navigating to /suppliers/${supplierId}...`);
  await send('Page.navigate', {url: `http://127.0.0.1:3000/suppliers/${supplierId}`});
  await waitFor(`
    document.querySelector('.tabs') &&
    Array.from(document.querySelectorAll('.tabs button')).some(t => t.textContent.includes('Advances & credits'))
  `, 20000);
  await sleep(1500);

  console.log('Clicking "Advances & credits" tab...');
  await evalFn(`
    (() => {
      const tabBtn = Array.from(document.querySelectorAll('.tabs button')).find(t => t.textContent.includes('Advances & credits'));
      tabBtn?.click();
    })()
  `);

  await waitFor(`
    document.body.innerText.includes('CRN-2026-0001') ||
    document.body.innerText.includes('14,000')
  `, 20000);
  await sleep(2000);
  await screenshot('supplier_advance_refund_result.png');

  console.log('🎉 ALL 4 ACCEPTANCE SCREENSHOTS CAPTURED SUCCESSFULLY!');
} finally {
  proc.kill();
}
