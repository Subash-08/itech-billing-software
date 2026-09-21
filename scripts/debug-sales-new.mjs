import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\Dell\\.gemini\\antigravity-ide\\brain\\8dccc6c6-c2f4-4d74-8225-e23258e9e436\\chrome-profile';
const artifactsDir = 'C:/Users/Dell/.gemini/antigravity-ide/brain/8dccc6c6-c2f4-4d74-8225-e23258e9e436';
const supplierId = 'SUP-MUBH4EZG-9N0N';

const proc = spawn(chromePath, [
  '--remote-debugging-port=9222',
  '--headless=new',
  '--disable-gpu',
  `--user-data-dir=${userDataDir}`,
  'about:blank',
]);

await new Promise(r => setTimeout(r, 1500));
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

async function screenshot(filename) {
  const res = await send('Page.captureScreenshot', {format: 'png'});
  const buf = Buffer.from(res.data, 'base64');
  const filePath = path.join(artifactsDir, filename);
  await fs.writeFile(filePath, buf);
  console.log(`✓ Saved ${filename}`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 950,
  deviceScaleFactor: 1,
  mobile: false,
});

// 1. Direct Serial Selection on /sales/new
console.log('Navigating to /sales/new...');
await send('Page.navigate', {url: 'http://127.0.0.1:3000/sales/new'});
await new Promise(r => setTimeout(r, 3000));

// Select product and click Add item
await send('Runtime.evaluate', {
  expression: `(() => {
    function setReactSelect(select, val) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(select, val);
      select.dispatchEvent(new Event('change', {bubbles: true}));
    }

    const prodSelect = document.querySelector('select[aria-label="Select product to add"]');
    if (prodSelect) {
      setReactSelect(prodSelect, "PRD-MUBH48T9-V234");
    }
  })()`,
  returnByValue: true
});
await new Promise(r => setTimeout(r, 800));

await send('Runtime.evaluate', {
  expression: `(() => {
    const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add item'));
    addBtn?.click();
  })()`,
  returnByValue: true
});
await new Promise(r => setTimeout(r, 1500));

// Click "Select stock / serial numbers"
console.log('Clicking "Select stock / serial numbers"...');
await send('Runtime.evaluate', {
  expression: `(() => {
    const stockBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Select stock / serial numbers'));
    stockBtn?.click();
  })()`,
  returnByValue: true
});

// Wait for modal and lots to load
console.log('Waiting for modal lots to load...');
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 500));
  const res = await send('Runtime.evaluate', {
    expression: `Boolean(document.querySelector('.modal') && !document.querySelector('.modal').innerText.includes('Loading available lots'))`,
    returnByValue: true
  });
  if (res.result?.value) break;
}
await new Promise(r => setTimeout(r, 1000));

// Check serial checkbox in modal
await send('Runtime.evaluate', {
  expression: `(() => {
    const cbs = Array.from(document.querySelectorAll('.modal input[type="checkbox"]'));
    if (cbs.length > 0 && !cbs[0].checked) cbs[0].click();
  })()`,
  returnByValue: true
});
await new Promise(r => setTimeout(r, 1000));
await screenshot('direct_serial_selection.png');

// 2. Customer Return Settlement on /returns
console.log('Navigating to /returns...');
await send('Page.navigate', {url: 'http://127.0.0.1:3000/returns'});
await new Promise(r => setTimeout(r, 3000));

// Click "Customer return"
await send('Runtime.evaluate', {
  expression: `(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const retBtn = btns.find(b => b.textContent.includes('Customer return'));
    retBtn?.click();
  })()`,
  returnByValue: true
});

console.log('Waiting for return modal issued invoices...');
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 500));
  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const billSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('INV-')));
      return Boolean(billSelect && billSelect.options.length > 1);
    })()`,
    returnByValue: true
  });
  if (res.result?.value) break;
}

// Select invoice
await send('Runtime.evaluate', {
  expression: `(() => {
    function setReactSelect(select, val) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(select, val);
      select.dispatchEvent(new Event('change', {bubbles: true}));
    }

    const selects = Array.from(document.querySelectorAll('select'));
    const billSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('INV-')));
    if (billSelect && billSelect.options.length > 1) {
      const opt = Array.from(billSelect.options).find(o => o.text.includes('0007') || o.text.includes('7,000')) || billSelect.options[1];
      setReactSelect(billSelect, opt.value);
    }
  })()`,
  returnByValue: true
});

console.log('Waiting for return modal lines...');
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 500));
  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const lineSelect = selects.find(s => Array.from(s.options).some(o => o.text.includes('LG 24-inch Monitor') || o.text.includes('returnable')));
      return Boolean(lineSelect && lineSelect.options.length > 1);
    })()`,
    returnByValue: true
  });
  if (res.result?.value) break;
}

// Select line, RestockSellable, RefundNow, Bank, serial, reason
await send('Runtime.evaluate', {
  expression: `(() => {
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
    if (dispSelect) setReactSelect(dispSelect, 'RestockSellable');

    const settSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'RefundNow'));
    if (settSelect) setReactSelect(settSelect, 'RefundNow');

    const accSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'Bank'));
    if (accSelect) setReactSelect(accSelect, 'Bank');

    const reasonInput = document.querySelector('input[placeholder*="Defective item"]');
    if (reasonInput) setReactInput(reasonInput, 'Customer return settlement verified');

    const cb = document.querySelector('.serial-list input[type="checkbox"]');
    if (cb && !cb.checked) cb.click();
  })()`,
  returnByValue: true
});
await new Promise(r => setTimeout(r, 2000));
await screenshot('customer_return_settlement.png');

// 3. Supplier Advance & Refund Result on /suppliers/[supplierId]
console.log(`Navigating to /suppliers/${supplierId}...`);
await send('Page.navigate', {url: `http://127.0.0.1:3000/suppliers/${supplierId}`});
await new Promise(r => setTimeout(r, 3000));

// Click "Advances & credits" tab
await send('Runtime.evaluate', {
  expression: `(() => {
    const tabs = Array.from(document.querySelectorAll('button, a, div[role="tab"]'));
    const advTab = tabs.find(t => t.textContent.includes('Advances & credits'));
    advTab?.click();
  })()`,
  returnByValue: true
});

console.log('Waiting for advances & credits data...');
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 500));
  const res = await send('Runtime.evaluate', {
    expression: `Boolean(document.body.innerText.includes('CRN-2026-0001') || document.body.innerText.includes('14,000'))`,
    returnByValue: true
  });
  if (res.result?.value) break;
}
await new Promise(r => setTimeout(r, 2000));
await screenshot('supplier_advance_refund_result.png');

console.log('All remaining screenshots captured successfully!');
proc.kill();
