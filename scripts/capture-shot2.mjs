import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = 'C:\\Users\\Dell\\.gemini\\antigravity-ide\\brain\\8dccc6c6-c2f4-4d74-8225-e23258e9e436\\chrome-profile';
const artifactsDir = 'C:/Users/Dell/.gemini/antigravity-ide/brain/8dccc6c6-c2f4-4d74-8225-e23258e9e436';

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
        resolve(data.result);
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

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 950,
  deviceScaleFactor: 1,
  mobile: false,
});

console.log('Navigating directly to /sales/new...');
await send('Page.navigate', {url: 'http://127.0.0.1:3000/sales/new'});
await sleep(3500);

const domInfo = await evalFn(`
  (() => {
    const prodSelect = document.querySelector('select[aria-label="Select product to add"]');
    return {
      prodSelectFound: !!prodSelect,
      options: Array.from(prodSelect?.options || []).map(o => ({text: o.text, value: o.value})),
      isLiveText: document.body.innerText.includes('Acceptance Hardware & Electronics')
    };
  })()
`);
console.log('DOM Info on /sales/new:', JSON.stringify(domInfo, null, 2));

// Select product
console.log('Selecting product PRD-MUBH48T9-V234...');
await evalFn(`
  (() => {
    function setReactSelect(select, val) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(select, val);
      select.dispatchEvent(new Event('change', {bubbles: true}));
    }
    const prodSelect = document.querySelector('select[aria-label="Select product to add"]');
    const val = prodSelect.options[1]?.value || "PRD-MUBH48T9-V234";
    setReactSelect(prodSelect, val);
  })()
`);
await sleep(1000);

console.log('Clicking Add item...');
await evalFn(`
  (() => {
    const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Add item'));
    addBtn?.click();
  })()
`);
await sleep(2000);

const afterAdd = await evalFn(`
  (() => {
    return {
      tableRows: document.querySelectorAll('table tbody tr').length,
      buttons: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean)
    };
  })()
`);
console.log('After Add Item:', JSON.stringify(afterAdd, null, 2));

console.log('Clicking Select stock / serial numbers...');
await evalFn(`
  (() => {
    const stockBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Select stock / serial numbers'));
    stockBtn?.click();
  })()
`);

console.log('Waiting for modal table to finish loading...');
for (let i = 0; i < 30; i++) {
  await sleep(600);
  const done = await evalFn(`
    Boolean(document.querySelector('.modal table tbody tr') && !document.querySelector('.modal')?.innerText?.includes('Loading available lots'))
  `);
  if (done) {
    console.log(`✓ Modal lots loaded after ${(i + 1) * 0.6}s`);
    break;
  }
}
await sleep(1500);

const modalState = await evalFn(`
  (() => {
    const modal = document.querySelector('.modal');
    return {
      hasModal: !!modal,
      modalHead: document.querySelector('.modal-head')?.textContent,
      modalText: modal?.innerText,
      checkboxes: document.querySelectorAll('.modal input[type="checkbox"]').length
    };
  })()
`);
console.log('Modal State:', JSON.stringify(modalState, null, 2));

// Check a serial checkbox if available
await evalFn(`
  (() => {
    const cbs = Array.from(document.querySelectorAll('.modal input[type="checkbox"]'));
    if (cbs.length > 0 && !cbs[0].checked) cbs[0].click();
  })()
`);
await sleep(1000);

const res = await send('Page.captureScreenshot', {format: 'png'});
const buf = Buffer.from(res.data, 'base64');
await fs.writeFile(path.join(artifactsDir, 'direct_serial_selection.png'), buf);
console.log('✓ Saved direct_serial_selection.png successfully!');

proc.kill();

