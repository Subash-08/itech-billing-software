import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\Dell\\.gemini\\antigravity-ide\\brain\\8dccc6c6-c2f4-4d74-8225-e23258e9e436\\chrome-profile';
const artifactsDir = 'C:/Users/Dell/.gemini/antigravity-ide/brain/8dccc6c6-c2f4-4d74-8225-e23258e9e436';
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
  return new Promise((resolve) => {
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

  // ==========================================
  // SCREENSHOT 2: Direct Serial Selection (/sales/new)
  // ==========================================
  console.log('--- Step 2: Direct Serial Selection ---');
  await send('Page.navigate', {url: 'http://127.0.0.1:3000/sales/new'});
  console.log('Waiting for live session and products to hydrate...');
  for (let i = 0; i < 30; i++) {
    await sleep(600);
    const ready = await evalFn(`
      document.body.innerText.includes('Acceptance Hardware & Electronics') &&
      document.querySelector('select[aria-label="Select product to add"]')?.options?.length > 1 &&
      Array.from(document.querySelector('select[aria-label="Select product to add"]').options).some(o => o.text.includes('LG 24-inch Monitor'))
    `);
    if (ready) {
      console.log(`✓ Hydrated after ${(i + 1) * 0.6}s`);
      break;
    }
  }

  // Select LG 24-inch Monitor
  await evalFn(`
    (() => {
      function setReactSelect(select, val) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(select, val);
        select.dispatchEvent(new Event('change', {bubbles: true}));
      }
      const prodSelect = document.querySelector('select[aria-label="Select product to add"]');
      const opt = Array.from(prodSelect.options).find(o => o.text.includes('LG 24-inch Monitor'));
      if (opt) setReactSelect(prodSelect, opt.value);
    })()
  `);
  await sleep(800);

  // Click Add item
  await evalFn(`
    (() => {
      const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add item'));
      addBtn?.click();
    })()
  `);
  await sleep(1500);

  // Click "Select stock / serial numbers"
  await evalFn(`
    (() => {
      const stockBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Select stock / serial numbers'));
      stockBtn?.click();
    })()
  `);

  // Wait for modal table to finish loading lots
  console.log('Waiting for modal table to load lots...');
  for (let i = 0; i < 35; i++) {
    await sleep(600);
    const loaded = await evalFn(`
      Boolean(document.querySelector('.modal table tbody tr') && !document.querySelector('.modal')?.innerText?.includes('Loading available lots'))
    `);
    if (loaded) {
      console.log(`✓ Lots loaded after ${(i + 1) * 0.6}s`);
      break;
    }
  }
  await sleep(1500);

  // Auto-allocate FIFO or check oldest lot
  await evalFn(`
    (() => {
      const fifoBtn = Array.from(document.querySelectorAll('.modal button')).find(b => b.textContent.includes('FIFO') || b.textContent.includes('oldest'));
      fifoBtn?.click();
    })()
  `);
  await sleep(1500);

  // Select a serial checkbox
  await evalFn(`
    (() => {
      const cbs = Array.from(document.querySelectorAll('.modal input[type="checkbox"]'));
      if (cbs.length > 0 && !cbs[0].checked) cbs[0].click();
    })()
  `);
  await sleep(1000);
  await screenshot('direct_serial_selection.png');

  // ==========================================
  // SCREENSHOT 3: Customer Return Settlement (/returns)
  // ==========================================
  console.log('--- Step 3: Customer Return Settlement ---');
  await send('Page.navigate', {url: 'http://127.0.0.1:3000/returns'});
  await sleep(2500);

  // Click Customer return button
  await evalFn(`
    (() => {
      const retBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Customer return'));
      retBtn?.click();
    })()
  `);

  console.log('Waiting for issued invoices to load in return modal...');
  for (let i = 0; i < 35; i++) {
    await sleep(600);
    const ready = await evalFn(`
      (() => {
        const selects = Array.from(document.querySelectorAll('.modal select'));
        const billSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('INV-')));
        return Boolean(billSelect && billSelect.options.length > 1);
      })()
    `);
    if (ready) {
      console.log(`✓ Issued invoices loaded after ${(i + 1) * 0.6}s`);
      break;
    }
  }

  // Select demo invoice (INV-2026-2027-0007 or invoice with 7,000)
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

  console.log('Waiting for return invoice lines to load...');
  for (let i = 0; i < 35; i++) {
    await sleep(600);
    const ready = await evalFn(`
      (() => {
        const selects = Array.from(document.querySelectorAll('.modal select'));
        const lineSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('LG 24-inch Monitor') || o.text.includes('returnable')));
        return Boolean(lineSelect && lineSelect.options.length > 1);
      })()
    `);
    if (ready) {
      console.log(`✓ Lines loaded after ${(i + 1) * 0.6}s`);
      break;
    }
  }

  // Select line, RestockSellable, RefundNow, Bank, reason, and check serial
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
  await sleep(2500);
  await screenshot('customer_return_settlement.png');

  // ==========================================
  // SCREENSHOT 4: Supplier Advance & Refund Result (/suppliers/[id])
  // ==========================================
  console.log('--- Step 4: Supplier Advance & Refund Result ---');
  await send('Page.navigate', {url: `http://127.0.0.1:3000/suppliers/${supplierId}`});
  console.log('Waiting for supplier page tabs to load...');
  for (let i = 0; i < 30; i++) {
    await sleep(600);
    const ready = await evalFn(`
      document.querySelector('.tabs') &&
      Array.from(document.querySelectorAll('.tabs button')).some(t => t.textContent.includes('Advances & credits'))
    `);
    if (ready) {
      console.log(`✓ Supplier tabs ready after ${(i + 1) * 0.6}s`);
      break;
    }
  }

  // Click Advances & credits tab
  await evalFn(`
    (() => {
      const tabBtn = Array.from(document.querySelectorAll('.tabs button')).find(t => t.textContent.includes('Advances & credits'));
      tabBtn?.click();
    })()
  `);

  console.log('Waiting for Advances & credits table...');
  for (let i = 0; i < 35; i++) {
    await sleep(600);
    const ready = await evalFn(`
      document.body.innerText.includes('CRN-2026-0001') ||
      document.body.innerText.includes('14,000')
    `);
    if (ready) {
      console.log(`✓ Advances table rendered after ${(i + 1) * 0.6}s`);
      break;
    }
  }
  await sleep(2000);
  await screenshot('supplier_advance_refund_result.png');

  console.log('🎉 ALL SCREENSHOTS COMPLETED!');
} finally {
  proc.kill();
}
