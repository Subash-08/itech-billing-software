import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

const artifactsDir = 'C:/Users/Dell/.gemini/antigravity-ide/brain/8dccc6c6-c2f4-4d74-8225-e23258e9e436';
const base = 'http://127.0.0.1:3000';
const email = 'admin.acc.1790008932582@example.com';
const password = 'Password123!';
const supplierId = 'SUP-MUBH4EZG-9N0N';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\Dell\\.gemini\\antigravity-ide\\brain\\8dccc6c6-c2f4-4d74-8225-e23258e9e436\\chrome-profile';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    const WS = globalThis.WebSocket;
    return new Promise((resolve, reject) => {
      this.ws = new WS(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && this.callbacks.has(data.id)) {
          const {resolve, reject} = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) reject(new Error(JSON.stringify(data.error)));
          else resolve(data.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, {resolve, reject});
      this.ws.send(JSON.stringify({id, method, params}));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result ? res.result.value : undefined;
  }

  async waitForFunction(fnStr, timeoutMs = 25000, pollMs = 300) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const ok = await this.evaluate(`Boolean(${fnStr})`);
        if (ok) return true;
      } catch {}
      await sleep(pollMs);
    }
    throw new Error(`Timeout waiting for condition: ${fnStr}`);
  }

  async screenshot(absolutePath) {
    const res = await this.send('Page.captureScreenshot', {format: 'png'});
    const buffer = Buffer.from(res.data, 'base64');
    await fs.writeFile(absolutePath, buffer);
    return absolutePath;
  }

  async close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function startChrome() {
  console.log('Starting headless Chrome on port 9222...');
  const proc = spawn(chromePath, [
    '--remote-debugging-port=9222',
    '--headless=new',
    '--disable-gpu',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], {
    detached: false,
    stdio: 'ignore',
  });

  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      const res = await fetch('http://127.0.0.1:9222/json/version');
      if (res.ok) {
        console.log('✓ Chrome CDP listening on port 9222');
        return proc;
      }
    } catch {}
  }
  proc.kill();
  throw new Error('Chrome failed to start CDP on port 9222');
}

async function run() {
  let chromeProc = null;
  let session = null;

  try {
    chromeProc = await startChrome();

    const versionRes = await fetch('http://127.0.0.1:9222/json/new', {method: 'PUT'});
    const target = await versionRes.json();
    session = new CdpSession(target.webSocketDebuggerUrl);
    await session.connect();
    await session.send('Page.enable');
    await session.send('DOM.enable');
    await session.send('Runtime.enable');

    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 950,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // 1. Authenticate through /account form
    console.log('Navigating to /account to sign in...');
    await session.send('Page.navigate', {url: `${base}/account`});
    await session.waitForFunction(`document.querySelector('input[type="email"]')`);

    await session.evaluate(`
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
          const btn = document.querySelector('button[type="submit"]');
          if (btn) btn.click();
        }
      })()
    `);

    console.log('Waiting for live session to establish...');
    await session.waitForFunction(`
      document.body.innerText.includes('Acceptance Hardware & Electronics') &&
      !document.body.innerText.includes('Checking account...')
    `, 25000);
    console.log('✓ Signed in to Acceptance Hardware & Electronics');
    await sleep(1500);

    // 2. Screenshot 1: Customer List
    console.log('Capturing Screenshot 1: Customer List (/customers)...');
    await session.send('Page.navigate', {url: `${base}/customers`});
    await session.waitForFunction(`
      document.body.innerText.includes('Return Test Customer') &&
      document.querySelector('table')
    `, 20000);
    await sleep(2000);
    const shot1 = path.join(artifactsDir, 'customer_list.png');
    await session.screenshot(shot1);
    console.log('✓ Saved customer_list.png');

    // 3. Screenshot 2: Direct Serial Selection (/sales/new)
    console.log('Capturing Screenshot 2: Direct Serial Selection (/sales/new)...');
    await session.send('Page.navigate', {url: `${base}/sales/new`});
    await session.waitForFunction(`
      document.querySelector('select[aria-label="Select product to add"]') &&
      document.querySelector('select[aria-label="Select product to add"]').options.length > 1
    `, 20000);
    await sleep(1500);

    // Select customer and product
    await session.evaluate(`
      (() => {
        function setReactSelect(select, val) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
          setter.call(select, val);
          select.dispatchEvent(new Event('change', {bubbles: true}));
        }

        // 1. Select first customer in dropdown
        const custSelect = document.querySelectorAll('select')[0];
        if (custSelect && custSelect.options.length > 1) {
          setReactSelect(custSelect, custSelect.options[1].value);
        }

        // 2. Select product LG 24-inch Monitor
        const prodSelect = document.querySelector('select[aria-label="Select product to add"]');
        if (prodSelect && prodSelect.options.length > 1) {
          setReactSelect(prodSelect, prodSelect.options[1].value);
        }
      })()
    `);
    await sleep(800);

    // Click "Add item"
    console.log('Clicking "Add item"...');
    await session.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const addBtn = btns.find(b => b.textContent.includes('Add item'));
        if (addBtn) addBtn.click();
      })()
    `);

    // Wait for the line row to appear in table
    console.log('Waiting for line item button...');
    await session.waitForFunction(`
      Array.from(document.querySelectorAll('button')).some(b =>
        b.textContent.includes('Select stock / serial numbers') || b.textContent.includes('allocated')
      )
    `, 15000);

    // Click "Select stock / serial numbers"
    console.log('Opening Stock Allocation Modal...');
    await session.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const stockBtn = btns.find(b =>
          b.textContent.includes('Select stock / serial numbers') || b.textContent.includes('allocated')
        );
        if (stockBtn) stockBtn.click();
      })()
    `);

    // Wait for modal to open AND finish loading available lots
    console.log('Waiting for Stock Allocation Modal to load lots...');
    await session.waitForFunction(`
      document.querySelector('.modal') &&
      !document.querySelector('.modal').innerText.includes('Loading available lots')
    `, 20000);
    await sleep(2000);

    // Select manual serial (e.g. check serial box)
    await session.evaluate(`
      (() => {
        const cbs = Array.from(document.querySelectorAll('.modal input[type="checkbox"]'));
        if (cbs.length > 0 && !cbs[0].checked) {
          cbs[0].click();
        }
      })()
    `);
    await sleep(1000);

    const shot2 = path.join(artifactsDir, 'direct_serial_selection.png');
    await session.screenshot(shot2);
    console.log('✓ Saved direct_serial_selection.png');

    // 4. Screenshot 3: Customer Return Settlement (/returns)
    console.log('Capturing Screenshot 3: Customer Return Settlement (/returns)...');
    await session.send('Page.navigate', {url: `${base}/returns`});
    await session.waitForFunction(`
      Array.from(document.querySelectorAll('button')).some(b => b.textContent.includes('Customer return'))
    `, 20000);
    await sleep(1000);

    // Click "Customer return"
    await session.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const retBtn = btns.find(b => b.textContent.includes('Customer return'));
        if (retBtn) retBtn.click();
      })()
    `);

    // Wait for modal to open and invoices to load in the first select
    console.log('Waiting for issued invoices in return modal...');
    await session.waitForFunction(`
      (() => {
        const selects = Array.from(document.querySelectorAll('select'));
        const billSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('INV-')));
        return Boolean(billSelect && billSelect.options.length > 1);
      })()
    `, 25000);

    // Select the demo invoice
    await session.evaluate(`
      (() => {
        function setReactSelect(select, val) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
          setter.call(select, val);
          select.dispatchEvent(new Event('change', {bubbles: true}));
        }

        const selects = Array.from(document.querySelectorAll('select'));
        const billSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('INV-')));
        if (billSelect) {
          const opt = Array.from(billSelect.options).find(o => o.text.includes('0007') || o.text.includes('7,000')) || billSelect.options[1];
          if (opt) setReactSelect(billSelect, opt.value);
        }
      })()
    `);

    // Wait for invoice line to populate
    console.log('Waiting for invoice lines to populate...');
    await session.waitForFunction(`
      (() => {
        const selects = Array.from(document.querySelectorAll('select'));
        const lineSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('LG 24-inch Monitor') || o.text.includes('returnable')));
        return Boolean(lineSelect && lineSelect.options.length > 1);
      })()
    `, 20000);

    // Select invoice line, RestockSellable, RefundNow, Bank, reason, and check serial
    await session.evaluate(`
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

        const selects = Array.from(document.querySelectorAll('select'));
        const lineSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('LG 24-inch Monitor') || o.text.includes('returnable')));
        if (lineSelect && lineSelect.options.length > 1) {
          setReactSelect(lineSelect, lineSelect.options[1].value);
        }

        const dispSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'RestockSellable'));
        if (dispSelect) {
          setReactSelect(dispSelect, 'RestockSellable');
        }

        const settSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'RefundNow'));
        if (settSelect) {
          setReactSelect(settSelect, 'RefundNow');
        }

        const accSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'Bank'));
        if (accSelect) {
          setReactSelect(accSelect, 'Bank');
        }

        const reasonInput = document.querySelector('input[placeholder*="Defective item"]');
        if (reasonInput) {
          setReactInput(reasonInput, 'Customer return verified');
        }

        const cb = document.querySelector('.serial-list input[type="checkbox"]');
        if (cb && !cb.checked) {
          cb.click();
        }
      })()
    `);
    await sleep(2500);

    const shot3 = path.join(artifactsDir, 'customer_return_settlement.png');
    await session.screenshot(shot3);
    console.log('✓ Saved customer_return_settlement.png');

    // 5. Screenshot 4: Supplier Advance & Refund Result
    console.log(`Capturing Screenshot 4: Supplier Advance & Refund Result for ${supplierId}...`);
    await session.send('Page.navigate', {url: `${base}/suppliers/${supplierId}`});
    await session.waitForFunction(`
      Array.from(document.querySelectorAll('button, a, div[role="tab"]')).some(t => t.textContent.includes('Advances & credits'))
    `, 20000);
    await sleep(1500);

    // Click "Advances & credits" tab
    await session.evaluate(`
      (() => {
        const tabs = Array.from(document.querySelectorAll('button, a, div[role="tab"]'));
        const advTab = tabs.find(t => t.textContent.includes('Advances & credits'));
        if (advTab) advTab.click();
      })()
    `);

    // Wait for the advances & credits table to load
    await session.waitForFunction(`
      document.body.innerText.includes('CRN-2026-0001') ||
      document.body.innerText.includes('14,000') ||
      document.body.innerText.includes('Advances & credits')
    `, 20000);
    await sleep(2500);

    const shot4 = path.join(artifactsDir, 'supplier_advance_refund_result.png');
    await session.screenshot(shot4);
    console.log('✓ Saved supplier_advance_refund_result.png');

    console.log('🎉 All 4 acceptance screenshots captured successfully with live backend data!');
  } finally {
    if (session) {
      try { await session.close(); } catch {}
    }
    if (chromeProc) {
      console.log('Stopping Chrome process...');
      chromeProc.kill('SIGTERM');
      try {
        await sleep(1000);
        chromeProc.kill('SIGKILL');
      } catch {}
    }
  }
}

run().catch(err => {
  console.error('Fatal error during capture:', err);
  process.exit(1);
});
