// Acceptance Test: 14-Step Manual Business Flow & Correctness Findings Verification
// Company Name: Acceptance Test September

import {MongoClient, ObjectId} from 'mongodb';
import {hashPassword} from 'better-auth/crypto';
import {randomUUID, scrypt, randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

async function hashProfitPassword(password) {
  const salt = randomBytes(24).toString('hex');
  const key = await new Promise((resolve, reject) =>
    scrypt(password, salt, 64, {N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024}, (err, k) => (err ? reject(err) : resolve(k)))
  );
  return 'scrypt-v1$' + salt + '$' + key.toString('hex');
}

process.env.DISABLE_AUTH_RATE_LIMIT = 'true';
process.env.NODE_ENV = 'test';
process.loadEnvFile('.env.local');

if (process.env.MONGODB_DB !== 'itech_dev') {
  throw new Error('This test requires the isolated itech_dev development database.');
}

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db('itech_dev');
const base = 'http://127.0.0.1:3000';

const tracked = {
  tenants: [],
  users: [],
  customers: [],
  suppliers: [],
  products: [],
  stockLots: [],
  serialUnits: [],
  purchases: [],
  supplierReceipts: [],
  supplierReturns: [],
  supplierCreditNotes: [],
  supplierPayments: [],
  supplierAllocations: [],
  invoices: [],
  customerReturns: [],
  customerReceipts: [],
  customerAllocations: [],
  warranties: [],
  serviceJobs: [],
  accountMovements: [],
  tenantAccountBalances: [],
  dailyClosings: [],
  businessDayGates: [],
  invoiceTemplates: [],
  templateRevisions: [],
  files: [],
  openingSetups: [],
  auditHistory: [],
};

async function api(method, path, body, cookie, extraHeaders = {}, asBuffer = false) {
  const headers = {
    origin: base,
    ...(cookie ? {cookie} : {}),
    ...(body ? {'content-type': 'application/json'} : {}),
    ...extraHeaders,
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(base + path, {
        method,
        headers,
        ...(body ? {body: JSON.stringify(body)} : {}),
      });
      if (asBuffer) {
        const buf = await res.arrayBuffer();
        return {status: res.status, buffer: Buffer.from(buf), headers: res.headers};
      }
      let json = null;
      const text = await res.text();
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
      return {status: res.status, body: json, headers: res.headers};
    } catch (err) {
      if (attempt < 3 && (err?.cause?.code === 'ECONNRESET' || err?.message?.includes('fetch failed'))) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
}

try {
  console.log('=== Starting 14-Step Manual Acceptance & Correctness Suite ===\n');

  // Dates
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata'}).format(now);
  const yesterdayDate = new Date(now.getTime() - 86400000);
  const yesterday = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata'}).format(yesterdayDate);

  console.log(`Transactions date: ${today}`);
  console.log(`Opening cutoff date: ${yesterday}\n`);

  // Create isolated fresh test company: "Acceptance Test September"
  const tenantId = `acc-sept-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const userId = new ObjectId();
  const email = `acceptance-sept-${Date.now()}@itech.local`;
  const password = 'Password123!';
  const hashedPassword = await hashPassword(password);

  await db.collection('tenants').insertOne({
    _id: tenantId,
    companyName: 'Acceptance Test September',
    verified: true,
    disabled: false,
    createdAt: new Date(),
  });
  tracked.tenants.push(tenantId);

  const profitPasswordHash = await hashProfitPassword('itech2026');
  await db.collection('authUsers').insertOne({
    _id: userId,
    name: 'Acceptance Manager',
    email,
    emailVerified: true,
    tenantId,
    profitPasswordHash,
    verified: true,
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  tracked.users.push(userId);

  await db.collection('authAccounts').insertOne({
    _id: new ObjectId(),
    userId,
    accountId: userId.toString(),
    providerId: 'credential',
    password: hashedPassword,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.collection('companySettings').insertOne({
    _id: `sett-${tenantId}`,
    tenantId,
    name: 'Acceptance Test September',
    phase3Migration: {status: 'Completed'},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Seed default invoice template
  const defTplId = `tpl-sept-${Date.now()}`;
  const tplRecord = {
    _id: defTplId,
    tenantId,
    name: 'Standard September Template',
    nameNormalized: 'standard september template',
    title: 'TAX INVOICE',
    accent: '#2563eb',
    borders: true,
    striped: false,
    logoPosition: 'left',
    fields: {
      logo: true,
      shopName: true,
      shopAddress: true,
      shopGst: true,
      shopPhone: true,
      number: true,
      date: true,
      due: true,
      customerName: true,
      customerAddress: true,
      customerPhone: true,
      shipping: true,
      serials: true,
      warranty: true,
      subtotal: true,
      taxes: true,
      grandTotal: true,
      payments: true,
    },
    columns: [
      {id: 'index', label: '#', show: true, align: 'left'},
      {id: 'description', label: 'Item Description', show: true, align: 'left'},
      {id: 'hsn', label: 'HSN', show: true, align: 'left'},
      {id: 'qty', label: 'Qty', show: true, align: 'right'},
      {id: 'rate', label: 'Rate (₹)', show: true, align: 'right'},
      {id: 'tax', label: 'Tax', show: true, align: 'right'},
      {id: 'amount', label: 'Amount (₹)', show: true, align: 'right'},
    ],
    footer: 'Acceptance Test September computer generated invoice.',
    isDefault: true,
    currentRevision: 1,
    status: 'Active',
    createdAt: new Date(),
  };
  await db.collection('invoiceTemplates').insertOne(tplRecord);
  tracked.invoiceTemplates.push(defTplId);

  await db.collection('templateRevisions').insertOne({
    _id: `${defTplId}_rev_1`,
    templateId: defTplId,
    tenantId,
    revision: 1,
    snapshot: tplRecord,
    createdAt: new Date(),
    createdBy: userId.toString(),
  });
  tracked.templateRevisions.push(`${defTplId}_rev_1`);

  // Sign in
  const loginRes = await api('POST', '/api/auth/sign-in/email', {email, password});
  assert.strictEqual(loginRes.status, 200, `Sign in failed: ${JSON.stringify(loginRes.body)}`);
  const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
  const cookie = setCookies.map(c => c?.split(';')[0]).filter(Boolean).join('; ');

  // ---------------------------------------------------------------------------
  // STEP 1: Create customer Test Kumar, with phone number. Create supplier Test Computers.
  // ---------------------------------------------------------------------------
  console.log('--- Step 1: Create customer & supplier ---');
  const custRes = await api('POST', '/api/master/customers', {
    name: 'Test Kumar',
    phone: '9876543210',
    email: 'testkumar@example.com',
    address: '123 Test Street, Chennai',
  }, cookie);
  assert.strictEqual(custRes.status, 200, `Create customer failed: ${JSON.stringify(custRes.body)}`);
  const customerId = custRes.body._id;
  tracked.customers.push(customerId);

  const suppRes = await api('POST', '/api/master/suppliers', {
    name: 'Test Computers',
    phone: '9876500001',
    email: 'testcomputers@example.com',
    address: '456 Tech Park, Chennai',
    terms: 30,
  }, cookie);
  assert.strictEqual(suppRes.status, 200, `Create supplier failed: ${JSON.stringify(suppRes.body)}`);
  const supplierId = suppRes.body._id;
  tracked.suppliers.push(supplierId);

  // Reload check: both appear in their lists and are searchable after reload
  const custReload = await api('GET', `/api/master/customers?q=Test+Kumar`, null, cookie);
  assert.strictEqual(custReload.status, 200);
  assert.ok(custReload.body.records.some(c => c._id === customerId && c.name === 'Test Kumar'));

  const suppReload = await api('GET', `/api/master/suppliers?q=Test+Computers`, null, cookie);
  assert.strictEqual(suppReload.status, 200);
  assert.ok(suppReload.body.records.some(s => s._id === supplierId && s.name === 'Test Computers'));
  console.log('✓ Step 1 Passed: Customer and Supplier created and searchable on reload.');

  // ---------------------------------------------------------------------------
  // STEP 2: Create serialized laptop product Test Laptop. Purchase rate ₹60,000; selling rate ₹70,000.
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 2: Create serialized laptop product ---');
  const prodRes = await api('POST', '/api/master/products', {
    name: 'Test Laptop',
    category: 'Laptops',
    brand: 'TestBrand',
    model: 'TL-1',
    hsn: '84713010',
    costPaise: 6000000,        // ₹60,000
    sellingPricePaise: 7000000, // ₹70,000
    isSerialTracked: true,
    priceEntryMode: 'Inclusive',
    taxBasisPoints: 1800,       // 18% GST
  }, cookie);
  assert.strictEqual(prodRes.status, 200, `Create product failed: ${JSON.stringify(prodRes.body)}`);
  const productId = prodRes.body._id;
  tracked.products.push(productId);

  // Reload check: product alone creates no stock
  const prodReload1 = await api('GET', `/api/master/products/${productId}`, null, cookie);
  assert.strictEqual(prodReload1.status, 200);
  assert.strictEqual(prodReload1.body.stock, 0, 'Product alone must create no stock');
  console.log('✓ Step 2 Passed: Serialized product created with 0 initial stock.');

  // ---------------------------------------------------------------------------
  // STEP 3: Finalize opening: Cash ₹20,000, Bank ₹1,00,000; no stock or opening dues.
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 3: Finalize opening balances ---');
  const draftRes = await api('POST', '/api/master/opening/draft', {
    cutoffDate: yesterday,
    openingCashPaise: 2000000,   // ₹20,000
    openingBankPaise: 10000000,  // ₹1,00,000
    draftReceivables: [],
    draftPayables: [],
    draftStockLots: [],
  }, cookie);
  assert.strictEqual(draftRes.status, 200, `Opening draft failed: ${JSON.stringify(draftRes.body)}`);
  const draftVer = draftRes.body.draftVersion;

  const finRes = await api('POST', '/api/master/opening/finalize', {
    expectedDraftVersion: draftVer,
  }, cookie);
  assert.strictEqual(finRes.status, 200, `Opening finalize failed: ${JSON.stringify(finRes.body)}`);

  // Reload check: Cash ₹20,000; Bank ₹1,00,000
  const accReload = await api('GET', `/api/money`, null, cookie);
  assert.strictEqual(accReload.status, 200);
  const cashBal = accReload.body.liveBalances?.cashPaise;
  const bankBal = accReload.body.liveBalances?.bankPaise;
  assert.strictEqual(cashBal, 2000000, `Cash must be ₹20,000 (got ${cashBal})`);
  assert.strictEqual(bankBal, 10000000, `Bank must be ₹1,00,000 (got ${bankBal})`);
  console.log('✓ Step 3 Passed: Opening finalized. Cash = ₹20,000, Bank = ₹1,00,000.');

  // ---------------------------------------------------------------------------
  // STEP 4: Purchase 3 laptops × ₹60,000, without payment.
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 4: Purchase 3 laptops without payment ---');
  const poRes = await api('POST', '/api/purchases', {
    supplierId,
    orderDate: today,
    inclusive: true,
    taxMode: 'Intra-state',
    supplierInvoiceNumber: 'SUP-INV-001',
    supplierInvoiceDate: today,
    postImmediately: true,
    lines: [
      {
        lineType: 'Product',
        productId,
        quantityOrdered: 3,
        unitCostPaise: 6000000,
        taxBasisPoints: 1800,
      },
    ],
  }, cookie);
  assert.strictEqual(poRes.status, 200, `Create purchase failed: ${JSON.stringify(poRes.body)}`);
  const purchaseId = poRes.body._id;
  const purchaseLineId = poRes.body.lines[0].lineId;
  tracked.purchases.push(purchaseId);

  // Reload check: Supplier due ₹1,80,000. Cash/Bank unchanged. Stock still zero before receipt.
  const poReload = await api('GET', `/api/purchases/${purchaseId}`, null, cookie);
  assert.strictEqual(poReload.status, 200);
  const due4 = poReload.body.purchase?.duePaise ?? poReload.body.duePaise;
  assert.strictEqual(due4, 18000000, `Supplier due must be ₹1,80,000 (got ${due4})`);

  const regReload4 = await api('GET', `/api/money`, null, cookie);
  assert.strictEqual(regReload4.body.liveBalances?.cashPaise, 2000000);
  assert.strictEqual(regReload4.body.liveBalances?.bankPaise, 10000000);

  const prodReload4 = await api('GET', `/api/master/products/${productId}`, null, cookie);
  assert.strictEqual(prodReload4.status, 200);
  assert.strictEqual(prodReload4.body.stock, 0, 'Stock must still be 0 before receipt');
  console.log('✓ Step 4 Passed: Purchase created. Supplier due = ₹1,80,000. Cash/Bank unchanged, stock = 0.');

  // ---------------------------------------------------------------------------
  // STEP 5: Receive all three with serials TEST-LAP-001, 002, 003.
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 5: Receive all 3 laptops with serials ---');
  const recRes = await api('POST', `/api/purchases/${purchaseId}/receive`, {
    receiptDate: today,
    idempotencyKey: `rec-${Date.now()}`,
    lines: [
      {
        lineId: purchaseLineId,
        quantityReceived: 3,
        serials: ['TEST-LAP-001', 'TEST-LAP-002', 'TEST-LAP-003'],
      },
    ],
  }, cookie);
  assert.strictEqual(recRes.status, 200, `Receive stock failed: ${JSON.stringify(recRes.body)}`);

  // Reload check: Available stock 3. Supplier due remains ₹1,80,000.
  const prodReload5 = await api('GET', `/api/master/products/${productId}`, null, cookie);
  assert.strictEqual(prodReload5.status, 200);
  assert.strictEqual(prodReload5.body.stock, 3, `Available stock must be 3 (got ${prodReload5.body.stock})`);

  const poReload5 = await api('GET', `/api/purchases/${purchaseId}`, null, cookie);
  const due5 = poReload5.body.purchase?.duePaise ?? poReload5.body.duePaise;
  assert.strictEqual(due5, 18000000, 'Supplier due remains ₹1,80,000');
  console.log('✓ Step 5 Passed: Received 3 serialized units. Available stock = 3. Supplier due = ₹1,80,000.');

  // ---------------------------------------------------------------------------
  // STEP 6: Invoice customer for serial 001 at ₹70,000. Receive ₹20,000 Cash + ₹30,000 Bank/UPI.
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 6: Invoice customer for serial 001 with split receipt ---');
  // Look up lot ID for received laptops
  const lot = await db.collection('stockLots').findOne({tenantId, productId});
  assert.ok(lot, 'Stock lot must exist');
  const lotId = lot._id;

  const invDraftRes = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-draft-${Date.now()}`,
    customerId,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    invoiceDate: today,
    dueDate: today,
    inclusive: true,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: defTplId,
    templateRevision: 1,
    lines: [
      {
        clientLineKey: 'line-1',
        lineType: 'Product',
        productId,
        description: 'Dell Latitude 7420 Laptop',
        hsn: '84713010',
        quantity: 1,
        unitRatePaise: 7000000, // ₹70,000
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [
          {
            lotId,
            quantity: 1,
            serials: ['TEST-LAP-001'],
          },
        ],
        warrantyMonths: 12,
      },
    ],
  }, cookie);
  assert.strictEqual(invDraftRes.status, 200, `Create invoice draft failed: ${JSON.stringify(invDraftRes.body)}`);
  const invoiceId = invDraftRes.body._id;
  tracked.invoices.push(invoiceId);

  const issueRes = await api('POST', `/api/sales/invoices/${invoiceId}/issue`, {
    draftId: invoiceId,
    expectedVersion: 1,
    idempotencyKey: `issue-${Date.now()}`,
    paymentComponents: [
      {method: 'Cash', account: 'Cash', amountPaise: 2000000},
      {method: 'UPI', account: 'Bank', amountPaise: 3000000},
    ],
  }, cookie);
  assert.strictEqual(issueRes.status, 200, `Issue invoice failed: ${JSON.stringify(issueRes.body)}`);

  // Reload check: Available stock 2; customer due ₹20,000; Cash ₹40,000; Bank ₹1,30,000.
  const prodReload6 = await api('GET', `/api/master/products/${productId}`, null, cookie);
  assert.strictEqual(prodReload6.status, 200);
  assert.strictEqual(prodReload6.body.stock, 2, `Available stock must be 2 (got ${prodReload6.body.stock})`);

  const invReload6 = await api('GET', `/api/sales/invoices/${invoiceId}`, null, cookie);
  assert.strictEqual(invReload6.status, 200);
  const issuedInv = invReload6.body.invoice;
  assert.strictEqual(issuedInv.duePaise, 2000000, `Customer due must be ₹20,000 (got ${issuedInv?.duePaise})`);

  const regReload6 = await api('GET', `/api/money`, null, cookie);
  const cash6 = regReload6.body.liveBalances?.cashPaise;
  const bank6 = regReload6.body.liveBalances?.bankPaise;
  assert.strictEqual(cash6, 4000000, `Cash must be ₹40,000 (got ${cash6})`);
  assert.strictEqual(bank6, 13000000, `Bank must be ₹1,30,000 (got ${bank6})`);
  console.log('✓ Step 6 Passed: Invoiced serial 001. Available = 2, Customer due = ₹20,000, Cash = ₹40,000, Bank = ₹1,30,000.');

  // ---------------------------------------------------------------------------
  // STEP 7: Return unsold serial 002 to supplier.
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 7: Return unsold serial 002 to supplier ---');
  // Re-use lotId from step 6

  const returnRes = await api('POST', '/api/purchases/returns', {
    purchaseId,
    purchaseLineId,
    lotId,
    quantity: 1,
    serials: ['TEST-LAP-002'],
    reason: 'Returning unsold demo unit',
    condition: 'Sellable',
    disposition: 'ReturnedToSupplier',
    idempotencyKey: `ret-supp-${Date.now()}`,
  }, cookie);
  assert.strictEqual(returnRes.status, 200, `Supplier return failed: ${JSON.stringify(returnRes.body)}`);
  const supplierReturnId = returnRes.body._id;
  tracked.supplierReturns.push(supplierReturnId);

  // Reload check: Available stock 1. Before credit acceptance, supplier due remains ₹1,80,000. No money moves.
  const prodReload7 = await api('GET', `/api/master/products/${productId}`, null, cookie);
  assert.strictEqual(prodReload7.status, 200);
  assert.strictEqual(prodReload7.body.stock, 1, `Available stock must be 1 (got ${prodReload7.body.stock})`);

  const poReload7 = await api('GET', `/api/purchases/${purchaseId}`, null, cookie);
  const due7 = poReload7.body.purchase?.duePaise ?? poReload7.body.duePaise;
  assert.strictEqual(due7, 18000000, 'Before credit acceptance, supplier due remains ₹1,80,000');

  const regReload7 = await api('GET', `/api/money`, null, cookie);
  assert.strictEqual(regReload7.body.liveBalances?.cashPaise, 4000000);
  assert.strictEqual(regReload7.body.liveBalances?.bankPaise, 13000000);
  console.log('✓ Step 7 Passed: Serial 002 returned. Available stock = 1, Supplier due = ₹1,80,000, No money moved.');

  // ---------------------------------------------------------------------------
  // STEP 8: Accept supplier credit of ₹60,000 against that returned line.
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 8: Accept supplier credit of ₹60,000 ---');
  const acceptCreditRes = await api('POST', `/api/purchases/returns/${supplierReturnId}/accept`, {
    supplierCreditNoteNumber: 'SCN-001',
    date: today,
    acceptedCreditPaise: 6000000, // ₹60,000
    allocateToBillDue: true,
    idempotencyKey: `acc-cred-${Date.now()}`,
  }, cookie);
  assert.strictEqual(acceptCreditRes.status, 200, `Accept credit failed: ${JSON.stringify(acceptCreditRes.body)}`);

  // Reload check: Supplier due ₹1,20,000. Cash/Bank unchanged. This is a bill reduction, not a payment.
  const poReload8 = await api('GET', `/api/purchases/${purchaseId}`, null, cookie);
  const due8 = poReload8.body.purchase?.duePaise ?? poReload8.body.duePaise;
  assert.strictEqual(due8, 12000000, `Supplier due must be ₹1,20,000 (got ${due8})`);

  const regReload8 = await api('GET', `/api/money`, null, cookie);
  assert.strictEqual(regReload8.body.liveBalances?.cashPaise, 4000000);
  assert.strictEqual(regReload8.body.liveBalances?.bankPaise, 13000000);
  console.log('✓ Step 8 Passed: Credit accepted. Supplier due = ₹1,20,000. Cash/Bank unchanged (bill reduction).');

  // ---------------------------------------------------------------------------
  // STEP 9: Pay supplier ₹50,000 from Bank.
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 9: Pay supplier ₹50,000 from Bank ---');
  const paySuppRes = await api('POST', '/api/purchases/payments', {
    supplierId,
    date: today,
    components: [
      {method: 'BankTransfer', account: 'Bank', amountPaise: 5000000},
    ],
    allocations: [
      {
        targetType: 'PurchaseLine',
        targetId: purchaseId,
        purchaseLineId,
        amountPaise: 5000000,
      },
    ],
    idempotencyKey: `pay-supp-${Date.now()}`,
  }, cookie);
  assert.strictEqual(paySuppRes.status, 200, `Pay supplier failed: ${JSON.stringify(paySuppRes.body)}`);

  // Reload check: Supplier due ₹70,000; Bank ₹80,000; Cash ₹40,000.
  const poReload9 = await api('GET', `/api/purchases/${purchaseId}`, null, cookie);
  const due9 = poReload9.body.purchase?.duePaise ?? poReload9.body.duePaise;
  assert.strictEqual(due9, 7000000, `Supplier due must be ₹70,000 (got ${due9})`);

  const regReload9 = await api('GET', `/api/money`, null, cookie);
  const cash9 = regReload9.body.liveBalances?.cashPaise;
  const bank9 = regReload9.body.liveBalances?.bankPaise;
  assert.strictEqual(cash9, 4000000, `Cash must be ₹40,000 (got ${cash9})`);
  assert.strictEqual(bank9, 8000000, `Bank must be ₹80,000 (got ${bank9})`);
  console.log('✓ Step 9 Passed: Paid supplier ₹50,000. Supplier due = ₹70,000, Bank = ₹80,000, Cash = ₹40,000.');

  // ---------------------------------------------------------------------------
  // STEP 10: Collect remaining customer ₹20,000 through UPI/Bank.
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 10: Collect remaining customer ₹20,000 ---');
  const custRcptRes = await api('POST', '/api/sales/receipts', {
    customerId,
    date: today,
    components: [
      {method: 'UPI', account: 'Bank', amountPaise: 2000000},
    ],
    allocations: [
      {targetType: 'Invoice', targetId: invoiceId, amountPaise: 2000000},
    ],
    idempotencyKey: `rcpt-cust-${Date.now()}`,
  }, cookie);
  assert.strictEqual(custRcptRes.status, 200, `Customer receipt failed: ${JSON.stringify(custRcptRes.body)}`);

  // Reload check: Customer due zero; Bank ₹1,00,000.
  const invReload10 = await api('GET', `/api/sales/invoices/${invoiceId}`, null, cookie);
  assert.strictEqual(invReload10.status, 200);
  const clearedInv = invReload10.body.invoice;
  assert.strictEqual(clearedInv.duePaise, 0, `Customer due must be 0 (got ${clearedInv?.duePaise})`);

  const regReload10 = await api('GET', `/api/money`, null, cookie);
  const bank10 = regReload10.body.liveBalances?.bankPaise;
  assert.strictEqual(bank10, 10000000, `Bank must be ₹1,00,000 (got ${bank10})`);
  console.log('✓ Step 10 Passed: Collected customer ₹20,000. Customer due = ₹0, Bank = ₹1,00,000.');

  // ---------------------------------------------------------------------------
  // STEP 11: Transfer ₹10,000 Cash → Bank.
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 11: Transfer ₹10,000 Cash -> Bank ---');
  const xferRes = await api('POST', '/api/money', {
    action: 'transfer',
    fromAccount: 'Cash',
    toAccount: 'Bank',
    amountPaise: 1000000, // ₹10,000
    date: today,
    reason: 'Cash to Bank deposit',
    idempotencyKey: `xfer-${Date.now()}`,
  }, cookie);
  assert.strictEqual(xferRes.status, 200, `Transfer failed: ${JSON.stringify(xferRes.body)}`);

  // Reload check: Cash ₹30,000; Bank ₹1,10,000. Combined funds unchanged.
  const regReload11 = await api('GET', `/api/money`, null, cookie);
  const cash11 = regReload11.body.liveBalances?.cashPaise;
  const bank11 = regReload11.body.liveBalances?.bankPaise;
  assert.strictEqual(cash11, 3000000, `Cash must be ₹30,000 (got ${cash11})`);
  assert.strictEqual(bank11, 11000000, `Bank must be ₹1,10,000 (got ${bank11})`);
  assert.strictEqual(cash11 + bank11, 14000000, 'Combined funds unchanged at ₹1,40,000');
  console.log('✓ Step 11 Passed: Transferred ₹10,000. Cash = ₹30,000, Bank = ₹1,10,000. Combined = ₹1,40,000.');

  // ---------------------------------------------------------------------------
  // STEP 12: Record shop expense ₹2,000 from Cash.
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 12: Record shop expense ₹2,000 from Cash ---');
  const expRes = await api('POST', '/api/money', {
    action: 'out',
    account: 'Cash',
    method: 'Cash',
    category: 'Expense',
    subCategory: 'ShopMaintenance',
    amountPaise: 200000, // ₹2,000
    date: today,
    reason: 'Shop cleaning supplies',
    idempotencyKey: `exp-${Date.now()}`,
  }, cookie);
  assert.strictEqual(expRes.status, 200, `Expense failed: ${JSON.stringify(expRes.body)}`);
  const expenseMovementId = expRes.body.movementId;

  // Reload check: Cash ₹28,000; Bank ₹1,10,000.
  const regReload12 = await api('GET', `/api/money`, null, cookie);
  const cash12 = regReload12.body.liveBalances?.cashPaise;
  const bank12 = regReload12.body.liveBalances?.bankPaise;
  assert.strictEqual(cash12, 2800000, `Cash must be ₹28,000 (got ${cash12})`);
  assert.strictEqual(bank12, 11000000, `Bank must be ₹1,10,000 (got ${bank12})`);
  console.log('✓ Step 12 Passed: Recorded expense ₹2,000. Cash = ₹28,000, Bank = ₹1,10,000.');

  // ---------------------------------------------------------------------------
  // STEP 13: Reverse that expense through its supported reversal action.
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 13: Reverse expense through supported reversal action ---');
  const revExpRes = await api('POST', `/api/money/${expenseMovementId}/reverse`, {
    reason: 'Erroneous duplicate expense entry',
    idempotencyKey: `rev-exp-${Date.now()}`,
  }, cookie);
  assert.strictEqual(revExpRes.status, 200, `Reverse expense failed: ${JSON.stringify(revExpRes.body)}`);

  // Reload check: Cash ₹30,000; Bank ₹1,10,000; net operating expense zero.
  const regReload13 = await api('GET', `/api/money`, null, cookie);
  const cash13 = regReload13.body.liveBalances?.cashPaise;
  const bank13 = regReload13.body.liveBalances?.bankPaise;
  assert.strictEqual(cash13, 3000000, `Cash must be ₹30,000 (got ${cash13})`);
  assert.strictEqual(bank13, 11000000, `Bank must be ₹1,10,000 (got ${bank13})`);

  // Check closing dashboard before profit: operatingExpensesPaise must be 0!
  const dashBeforeProfit = await api('GET', `/api/closings/${today}`, null, cookie);
  assert.strictEqual(dashBeforeProfit.status, 200);
  assert.strictEqual(dashBeforeProfit.body.summary.operatingExpensesPaise, 0, 'Net operating expense must be 0 after reversal');
  console.log('✓ Step 13 Passed: Expense reversed. Cash = ₹30,000, Bank = ₹1,10,000, Net operating expense = 0.');

  // ---------------------------------------------------------------------------
  // STEP 14: Enter manual invoice profit ₹10,000.
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 14: Enter manual invoice profit ₹10,000 ---');
  const profitRes = await api('POST', `/api/closings/${today}/profit`, {
    entries: [
      {
        id: invoiceId,
        type: 'Invoice',
        profitPaise: 1000000, // ₹10,000
      },
    ],
  }, cookie);
  assert.strictEqual(profitRes.status, 200, `Save profit failed: ${JSON.stringify(profitRes.body)}`);

  // Unlock profit view to inspect
  const unlockRes = await api('POST', '/api/auth/profit-unlock', {password: 'itech2026'}, cookie);
  assert.strictEqual(unlockRes.status, 200, `Profit unlock failed: ${JSON.stringify(unlockRes.body)}`);

  // Reload check: Trading profit ₹10,000; net shop profit ₹10,000 after expense reversal.
  const dashReload14 = await api('GET', `/api/closings/${today}`, null, cookie);
  assert.strictEqual(dashReload14.status, 200);
  assert.strictEqual(dashReload14.body.summary.tradingProfitPaise, 1000000, 'Trading profit must be ₹10,000');
  assert.strictEqual(dashReload14.body.summary.operatingExpensesPaise, 0, 'Operating expenses must be 0');
  assert.strictEqual(dashReload14.body.summary.netShopProfitPaise, 1000000, 'Net shop profit must be ₹10,000');
  console.log('✓ Step 14 Passed: Entered manual profit. Trading profit = ₹10,000, Net shop profit = ₹10,000.');

  // ---------------------------------------------------------------------------
  // FINAL POSITION VERIFICATION
  // ---------------------------------------------------------------------------
  console.log('\n--- Verifying Expected Final Position ---');
  // - Available stock: 1 laptop, serial 003
  const finalProd = await api('GET', `/api/master/products/${productId}`, null, cookie);
  assert.strictEqual(finalProd.status, 200);
  assert.strictEqual(finalProd.body.stock, 1, 'Final available stock must be 1');

  // Check serial units states
  const serialUnits = await db.collection('serialUnits').find({tenantId, productId}).toArray();
  const s001 = serialUnits.find(s => s.serialOriginal === 'TEST-LAP-001' || s.serialNormalized === 'testlap001');
  const s002 = serialUnits.find(s => s.serialOriginal === 'TEST-LAP-002' || s.serialNormalized === 'testlap002');
  const s003 = serialUnits.find(s => s.serialOriginal === 'TEST-LAP-003' || s.serialNormalized === 'testlap003');
  assert.ok(s001, 'Serial 001 must exist');
  assert.ok(s002, 'Serial 002 must exist');
  assert.ok(s003, 'Serial 003 must exist');
  assert.strictEqual(s001.status, 'Sold', 'Serial 001 must be Sold');
  assert.strictEqual(s002.status, 'Returned', 'Serial 002 must be Returned (to supplier)');
  assert.strictEqual(s003.status, 'InStock', 'Serial 003 must be InStock');

  // - Customer due: ₹0
  const finalCustInvs = await api('GET', `/api/sales/invoices/${invoiceId}`, null, cookie);
  assert.strictEqual(finalCustInvs.status, 200);
  assert.strictEqual(finalCustInvs.body.invoice.duePaise, 0, 'Customer due must be ₹0');

  // - Supplier due: ₹70,000
  const finalPo = await api('GET', `/api/purchases/${purchaseId}`, null, cookie);
  const finalDue = finalPo.body.purchase?.duePaise ?? finalPo.body.duePaise;
  assert.strictEqual(finalDue, 7000000, 'Supplier due must be ₹70,000');

  // - Cash: ₹30,000
  // - Bank: ₹1,10,000
  const finalAccounts = await api('GET', `/api/money`, null, cookie);
  const finalCash = finalAccounts.body.liveBalances?.cashPaise;
  const finalBank = finalAccounts.body.liveBalances?.bankPaise;
  assert.strictEqual(finalCash, 3000000, 'Final Cash must be ₹30,000');
  assert.strictEqual(finalBank, 11000000, 'Final Bank must be ₹1,10,000');
  console.log('✓ Final Position 100% Matched:');
  console.log('  • Available stock: 1 laptop (serial 003)');
  console.log('  • Sold: 1 laptop (serial 001)');
  console.log('  • Returned to supplier: 1 laptop (serial 002)');
  console.log('  • Customer due: ₹0');
  console.log('  • Supplier due: ₹70,000');
  console.log('  • Cash: ₹30,000');
  console.log('  • Bank: ₹1,10,000');

  // ---------------------------------------------------------------------------
  // DAILY CLOSING TESTS: Incorrect counts first, then successful close, then idempotent replay
  // ---------------------------------------------------------------------------
  console.log('\n--- Testing Daily Closing: Incorrect counts refusal ---');
  const reviewVer = dashReload14.body.gateVersion;

  // 1. Try closing with mismatched counts: Cash 25,000 (expected 30,000)
  const badCloseRes = await api('POST', `/api/closings/${today}`, {
    cashCountPaise: 2500000,
    bankCountPaise: 11000000,
    note: 'Intentional mismatched count',
    holiday: false,
    reviewVersion: reviewVer,
    idempotencyKey: `bad-close-${Date.now()}`,
  }, cookie);
  assert.strictEqual(badCloseRes.status, 400, 'Mismatched count must refuse closing');
  assert.ok(badCloseRes.body.error.includes('does not match expected ledger closing'), `Expected mismatch error, got: ${badCloseRes.body.error}`);
  console.log('✓ Incorrect count refusal verified: Mismatched counts rejected with difference details.');

  // Before closing, let's verify gate ID and version increment
  const gateBefore = await db.collection('businessDayGates').findOne({_id: `DAY-${tenantId}`});
  assert.ok(gateBefore, 'Gate ID must be DAY-{tenantId}');
  console.log(`Gate ID: ${gateBefore._id}, version: ${gateBefore.version}`);

  const closeIdemKey = `close-${today}-${Date.now()}`;

  // 2. Close day with verified physical counts
  console.log('\n--- Closing day with verified physical counts (Cash ₹30,000, Bank ₹1,10,000) ---');
  const closeRes = await api('POST', `/api/closings/${today}`, {
    cashCountPaise: 3000000,
    bankCountPaise: 11000000,
    note: 'September acceptance test clean count',
    holiday: false,
    reviewVersion: reviewVer,
    idempotencyKey: closeIdemKey,
  }, cookie);
  assert.strictEqual(closeRes.status, 200, `Closing failed: ${JSON.stringify(closeRes.body)}`);
  assert.strictEqual(closeRes.body.status, 'Closed');

  // Verify closing document via GET
  const closedDayReload = await api('GET', `/api/closings/${today}`, null, cookie);
  assert.strictEqual(closedDayReload.status, 200);
  assert.strictEqual(closedDayReload.body.isClosed, true);
  assert.strictEqual(closedDayReload.body.closing.snapshot.cashClosingPaise, 3000000);
  assert.strictEqual(closedDayReload.body.closing.snapshot.bankClosingPaise, 11000000);
  console.log('✓ Day closed successfully with exact tally.');

  // Idempotency replay test: retrying close with the same idempotency key must return 200 replay!
  console.log('\n--- Testing Idempotency Replay on Closing Retry ---');
  const replayCloseRes = await api('POST', `/api/closings/${today}`, {
    cashCountPaise: 3000000,
    bankCountPaise: 11000000,
    note: 'September acceptance test clean count',
    holiday: false,
    reviewVersion: reviewVer,
    idempotencyKey: closeIdemKey,
  }, cookie);
  assert.strictEqual(replayCloseRes.status, 200, `Idempotency replay failed: ${JSON.stringify(replayCloseRes.body)}`);
  assert.strictEqual(replayCloseRes.body.status, 'Closed');
  console.log('✓ Idempotency replay passed: Retrying close with same key returns cached 200 response.');

  // Post-closing lock check: attempting new transactions on closed day must be rejected by assertSalePostingDay / lockBusinessDay
  console.log('\n--- Testing Closed-Day Transaction Lock ---');
  const lateInvDraft = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `late-inv-${Date.now()}`,
    customerId,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    invoiceDate: today,
    dueDate: today,
    inclusive: true,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: defTplId,
    templateRevision: 1,
    lines: [
      {
        clientLineKey: 'line-late',
        lineType: 'Product',
        productId,
        description: 'Dell Latitude 7420 Laptop',
        hsn: '84713010',
        quantity: 1,
        unitRatePaise: 7000000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [
          {
            lotId,
            quantity: 1,
            serials: ['TEST-LAP-003'],
          },
        ],
        warrantyMonths: 12,
      },
    ],
  }, cookie);
  assert.strictEqual(lateInvDraft.status, 200);
  const lateIssue = await api('POST', `/api/sales/invoices/${lateInvDraft.body._id}/issue`, {
    draftId: lateInvDraft.body._id,
    expectedVersion: 1,
    idempotencyKey: `late-issue-${Date.now()}`,
  }, cookie);
  assert.ok(lateIssue.status === 409 || lateIssue.status === 400, `Posting on closed day must be rejected (got ${lateIssue.status})`);
  assert.ok(lateIssue.body.error.includes('closed') || lateIssue.body.error.includes('holiday'), `Expected closed error, got: ${lateIssue.body.error}`);
  console.log('✓ Closed-day transaction lock verified: subsequent postings rejected.');

  // ---------------------------------------------------------------------------
  // ADDITIONAL TEST: ConsumedPart Service Line Customer Return & Stock Restoration
  // ---------------------------------------------------------------------------
  console.log('\n--- Testing ConsumedPart Customer Return Lifecycle ---');
  // Create an isolated test tenant with an open business day for the service lifecycle test
  const partTenantId = `acc-part-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const partUserId = new ObjectId();
  const partEmail = `part-user-${Date.now()}@itech.local`;
  const partPassword = 'Password123!';
  const partHashedPassword = await hashPassword(partPassword);

  await db.collection('tenants').insertOne({
    _id: partTenantId,
    companyName: 'ConsumedPart Test Company',
    verified: true,
    disabled: false,
    createdAt: new Date(),
  });
  tracked.tenants.push(partTenantId);

  await db.collection('authUsers').insertOne({
    _id: partUserId,
    name: 'Part Manager',
    email: partEmail,
    emailVerified: true,
    tenantId: partTenantId,
    verified: true,
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  tracked.users.push(partUserId);

  await db.collection('authAccounts').insertOne({
    _id: new ObjectId(),
    userId: partUserId,
    accountId: partUserId.toString(),
    providerId: 'credential',
    password: partHashedPassword,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.collection('companySettings').insertOne({
    _id: `sett-${partTenantId}`,
    tenantId: partTenantId,
    name: 'ConsumedPart Test Company',
    phase3Migration: {status: 'Completed'},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Sign in as part manager
  const partLoginRes = await api('POST', '/api/auth/sign-in/email', {
    email: partEmail,
    password: partPassword,
  });
  assert.strictEqual(partLoginRes.status, 200);
  const partCookie = partLoginRes.headers.get('set-cookie');

  // Finalize opening balances via official API so account movements and balances reconcile
  const partDraftRes = await api('POST', '/api/master/opening/draft', {
    cutoffDate: yesterday,
    openingCashPaise: 5000000,
    openingBankPaise: 5000000,
    draftReceivables: [],
    draftPayables: [],
    draftStockLots: [],
  }, partCookie);
  assert.strictEqual(partDraftRes.status, 200, `Opening draft failed: ${JSON.stringify(partDraftRes.body)}`);

  const partFinRes = await api('POST', '/api/master/opening/finalize', {
    expectedDraftVersion: partDraftRes.body.draftVersion,
  }, partCookie);
  assert.strictEqual(partFinRes.status, 200, `Opening finalize failed: ${JSON.stringify(partFinRes.body)}`);

  // Seed default template
  const partTplId = `tpl-part-${Date.now()}`;
  const partTplRecord = {
    _id: partTplId,
    tenantId: partTenantId,
    name: 'Default Part Template',
    nameNormalized: 'default part template',
    title: 'TAX INVOICE',
    accent: '#2563eb',
    borders: true,
    striped: false,
    logoPosition: 'left',
    fields: {
      logo: true,
      shopName: true,
      shopAddress: true,
      shopGst: true,
      shopPhone: true,
      number: true,
      date: true,
      due: true,
      customerName: true,
      customerAddress: true,
      customerPhone: true,
      shipping: true,
      serials: true,
      warranty: true,
      subtotal: true,
      taxes: true,
      grandTotal: true,
      payments: true,
    },
    columns: [
      {id: 'index', label: '#', show: true, align: 'left'},
      {id: 'description', label: 'Item Description', show: true, align: 'left'},
      {id: 'hsn', label: 'HSN', show: true, align: 'left'},
      {id: 'qty', label: 'Qty', show: true, align: 'right'},
      {id: 'rate', label: 'Rate (₹)', show: true, align: 'right'},
      {id: 'tax', label: 'Tax', show: true, align: 'right'},
      {id: 'amount', label: 'Amount (₹)', show: true, align: 'right'},
    ],
    footer: 'Part computer generated invoice.',
    isDefault: true,
    currentRevision: 1,
    status: 'Active',
    createdAt: new Date(),
  };
  await db.collection('invoiceTemplates').insertOne(partTplRecord);
  tracked.invoiceTemplates.push(partTplId);

  await db.collection('templateRevisions').insertOne({
    _id: `${partTplId}_rev_1`,
    templateId: partTplId,
    tenantId: partTenantId,
    revision: 1,
    snapshot: partTplRecord,
    createdAt: new Date(),
    createdBy: partUserId.toString(),
  });
  tracked.templateRevisions.push(`${partTplId}_rev_1`);

  // Create customer
  const partCustRes = await api('POST', '/api/master/customers', {
    name: 'Service Customer Alice',
    phone: '9876543219',
    address: '42 Tech Park, Chennai',
  }, partCookie);
  assert.strictEqual(partCustRes.status, 200, `Create service customer failed: ${JSON.stringify(partCustRes.body)}`);
  const partCustomerId = partCustRes.body._id;
  tracked.customers.push(partCustomerId);

  // 1. Create a service part product
  const ramProdRes = await api('POST', '/api/master/products', {
    name: 'DDR4 8GB RAM',
    category: 'PC parts',
    brand: 'Crucial',
    model: 'DDR4-2666',
    hsn: '84733020',
    costPaise: 200000,
    sellingPricePaise: 300000,
    isSerialTracked: true,
    priceEntryMode: 'Inclusive',
    taxBasisPoints: 1800,
  }, partCookie);
  assert.strictEqual(ramProdRes.status, 200);
  const ramProdId = ramProdRes.body._id;
  tracked.products.push(ramProdId);

  // Directly seed stock for RAM on today
  const ramLotId = `lot-ram-${Date.now()}`;
  await db.collection('stockLots').insertOne({
    _id: ramLotId,
    tenantId: partTenantId,
    productId: ramProdId,
    lotNumber: 'LOT-RAM-01',
    quantityReceived: 1,
    quantitySellable: 1,
    quantitySold: 0,
    quantityReserved: 0,
    quantityDefective: 0,
    quantityConsumed: 0,
    costPaise: 200000,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  tracked.stockLots.push(ramLotId);

  await db.collection('serialUnits').insertOne({
    _id: new ObjectId(),
    tenantId: partTenantId,
    productId: ramProdId,
    lotId: ramLotId,
    serialNumber: 'RAM-SERIAL-999',
    serialOriginal: 'RAM-SERIAL-999',
    serialNormalized: 'ramserial999',
    status: 'InStock',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create a service job and consume the RAM
  const jobRes = await api('POST', '/api/services', {
    customerId: partCustomerId,
    device: {
      type: 'Laptop',
      brand: 'Dell',
      model: 'Inspiron 15',
      serialNumber: 'DELL-SERV-01',
      accessories: 'Charger',
      photos: [],
    },
    reportedProblem: 'Slow performance, needs RAM upgrade',
    initialEstimatePaise: 350000,
    idempotencyKey: `serv-job-${Date.now()}`,
  }, partCookie);
  assert.strictEqual(jobRes.status, 200, `Create service job failed: ${JSON.stringify(jobRes.body)}`);
  const serviceJobId = jobRes.body._id;
  tracked.serviceJobs.push(serviceJobId);

  // Consume part
  const consumeRes = await api('POST', `/api/services/${serviceJobId}/parts`, {
    productId: ramProdId,
    lotId: ramLotId,
    quantity: 1,
    billingRatePaise: 300000,
    taxBasisPoints: 1800,
    serials: ['RAM-SERIAL-999'],
    expectedVersion: 1,
    idempotencyKey: `consume-${Date.now()}`,
  }, partCookie);
  assert.strictEqual(consumeRes.status, 200, `Consume part failed: ${JSON.stringify(consumeRes.body)}`);
  const partId = consumeRes.body.partId;

  // Verify stockLot consumed count
  const ramLotCheck = await db.collection('stockLots').findOne({_id: ramLotId});
  assert.strictEqual(ramLotCheck.quantityConsumed, 1, 'RAM lot quantityConsumed must be 1');
  assert.strictEqual(ramLotCheck.quantitySellable, 0, 'RAM lot quantitySellable must be 0');

  // Bill via Service Invoice with lineType: 'ConsumedPart' on today
  const servInvRes = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `serv-inv-${Date.now()}`,
    customerId: partCustomerId,
    invoiceKind: 'Service',
    businessCategory: 'Service',
    serviceJobId,
    invoiceDate: today,
    dueDate: today,
    inclusive: true,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: partTplId,
    templateRevision: 1,
    lines: [
      {
        clientLineKey: 'part-line-1',
        lineType: 'ConsumedPart',
        productId: ramProdId,
        description: 'DDR4 8GB RAM Part',
        hsn: '847330',
        serviceJobId,
        partId,
        lotId: ramLotId,
        quantity: 1,
        unitRatePaise: 300000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        serials: ['RAM-SERIAL-999'],
        warrantyMonths: 6,
      },
    ],
  }, partCookie);
  assert.strictEqual(servInvRes.status, 200, `Service invoice draft failed: ${JSON.stringify(servInvRes.body)}`);
  const servInvId = servInvRes.body._id;
  const servLineId = servInvRes.body.lines[0].lineId;
  tracked.invoices.push(servInvId);

  const issueServRes = await api('POST', `/api/sales/invoices/${servInvId}/issue`, {
    draftId: servInvId,
    expectedVersion: 1,
    idempotencyKey: `issue-serv-${Date.now()}`,
    paymentComponents: [
      {method: 'Cash', account: 'Cash', amountPaise: 300000},
    ],
  }, partCookie);
  assert.strictEqual(issueServRes.status, 200);

  // Return the ConsumedPart line (restock sellable)
  const custReturnRes = await api('POST', '/api/sales/returns', {
    invoiceId: servInvId,
    invoiceLineId: servLineId,
    date: today,
    quantity: 1,
    serials: ['RAM-SERIAL-999'],
    reason: 'Defective memory module returned by customer',
    stockDisposition: 'RestockSellable',
    settlement: 'CustomerCredit',
    idempotencyKey: `ret-part-${Date.now()}`,
  }, partCookie);
  assert.strictEqual(custReturnRes.status, 200, `ConsumedPart customer return failed: ${JSON.stringify(custReturnRes.body)}`);

  // Verify stockLot updated: quantityConsumed decreased to 0, quantitySellable restored to 1
  const ramLotRestored = await db.collection('stockLots').findOne({_id: ramLotId});
  assert.strictEqual(ramLotRestored.quantityConsumed, 0, 'RAM quantityConsumed must be decremented to 0');
  assert.strictEqual(ramLotRestored.quantitySellable, 1, 'RAM quantitySellable must be restored to 1');

  // Verify serial unit transitioned back to InStock
  const ramSerialDoc = await db.collection('serialUnits').findOne({tenantId: partTenantId, $or: [{serialOriginal: 'RAM-SERIAL-999'}, {serialNormalized: 'ramserial999'}]});
  assert.ok(ramSerialDoc, 'RAM serial doc must exist');
  assert.strictEqual(ramSerialDoc.status, 'InStock', 'RAM serial unit must transition back to InStock');

  // Verify warranty marked Returned
  const ramWarranty = await db.collection('warranties').findOne({tenantId: partTenantId, invoiceId: servInvId});
  assert.strictEqual(ramWarranty.status, 'Returned', 'Warranty must be marked Returned');
  console.log('✓ ConsumedPart Return Lifecycle Passed: Consumed quantity decremented, sellable restored, serial restored to InStock, warranty marked Returned.');

  // ---------------------------------------------------------------------------
  // ADDITIONAL TEST: ZIP PDF Export with Template Application
  // ---------------------------------------------------------------------------
  console.log('\n--- Testing ZIP PDF Export with Template ---');
  const zipRes = await api('GET', '/api/sales/invoices/export-zip', null, cookie, {}, true);
  assert.strictEqual(zipRes.status, 200, 'ZIP export must return 200');
  assert.strictEqual(zipRes.headers.get('content-type'), 'application/zip');

  const zip = await JSZip.loadAsync(zipRes.buffer);
  const manifestFile = zip.file('manifest.json');
  assert.ok(manifestFile, 'ZIP must contain manifest.json');
  const manifestData = JSON.parse(await manifestFile.async('string'));
  assert.strictEqual(manifestData.tenantId, tenantId);
  assert.ok(manifestData.invoiceCount >= 1, 'Manifest must list invoices');
  console.log(`✓ ZIP PDF Export Passed: Generated bundle with ${manifestData.invoiceCount} invoices.`);

  // ---------------------------------------------------------------------------
  // ADDITIONAL TEST: File Cleanup Safety (Finding 2)
  // ---------------------------------------------------------------------------
  console.log('\n--- Testing File Cleanup Safety (Checking companySettings, service photos, templates) ---');
  // Seed files older than 24h cutoff to test orphan cleanup
  const oldFileDate = new Date(Date.now() - 48 * 3600 * 1000);
  const logoFileId = `file-logo-${Date.now()}`;
  const photoFileId = `file-photo-${Date.now()}`;
  const orphanFileId = `file-orphan-${Date.now()}`;

  await db.collection('files').insertMany([
    {_id: logoFileId, tenantId, name: 'logo.png', type: 'image/png', key: `${logoFileId}.png`, size: 1024, status: 'Active', createdBy: userId.toString(), createdAt: oldFileDate},
    {_id: photoFileId, tenantId, name: 'photo.jpg', type: 'image/jpeg', key: `${photoFileId}.jpg`, size: 2048, status: 'Active', createdBy: userId.toString(), createdAt: oldFileDate},
    {_id: orphanFileId, tenantId, name: 'orphan.png', type: 'image/png', key: `${orphanFileId}.png`, size: 512, status: 'Active', createdBy: userId.toString(), createdAt: oldFileDate},
  ]);
  tracked.files.push(logoFileId, photoFileId, orphanFileId);

  // Link logoFileId to companySettings
  await db.collection('companySettings').updateOne({tenantId}, {$set: {logoFileId}});

  // Seed a serviceJob with photoFileId in device.photos
  const cleanupJobId = `job-cleanup-${Date.now()}`;
  await db.collection('serviceJobs').insertOne({
    _id: cleanupJobId,
    tenantId,
    jobNumber: 'SRV-CLEANUP-01',
    device: { photos: [photoFileId] },
    createdAt: new Date(),
  });
  tracked.serviceJobs.push(cleanupJobId);

  // Run orphan cleanup API
  const cleanupRes = await api('POST', '/api/files/cleanup-orphans', {}, cookie);
  assert.strictEqual(cleanupRes.status, 200);
  assert.strictEqual(cleanupRes.body.markedOrphaned, 1, 'orphanFileId must be marked as Orphaned');
  assert.strictEqual(cleanupRes.body.deletedFromStorage, 1, 'orphanFileId must be deleted from storage');

  // Assert logoFileId and photoFileId are STILL Active and NOT deleted!
  const keptLogo = await db.collection('files').findOne({_id: logoFileId, tenantId});
  assert.ok(keptLogo, 'Company logo file must NOT be deleted by orphan cleanup');
  assert.strictEqual(keptLogo.status, 'Active');

  const keptPhoto = await db.collection('files').findOne({_id: photoFileId, tenantId});
  assert.ok(keptPhoto, 'Service photo file must NOT be deleted by orphan cleanup');
  assert.strictEqual(keptPhoto.status, 'Active');

  const orphanedDoc = await db.collection('files').findOne({_id: orphanFileId, tenantId});
  assert.strictEqual(orphanedDoc, null, 'Unreferenced orphan file must be deleted from database');
  console.log('✓ File Cleanup Safety Passed: logoFileId and service photo preserved, unreferenced file deleted.');

  // Storage Status endpoint test
  const storageStatusRes = await api('GET', '/api/files', null, cookie);
  assert.strictEqual(storageStatusRes.status, 200);
  assert.strictEqual(storageStatusRes.body.configured, true);
  assert.strictEqual(storageStatusRes.body.uploadsAvailable, true);
  console.log('✓ Storage status endpoint verified: read-only status active.');

  console.log('\n=============================================================');
  console.log('🎉 ALL 14 BUSINESS FLOW STEPS AND CORRECTNESS FIXES VERIFIED 100%!');
  console.log('=============================================================\n');

} finally {
  console.log('Cleaning up tracked test records...');
  await Promise.all([
    db.collection('tenants').deleteMany({_id: {$in: tracked.tenants}}),
    db.collection('authUsers').deleteMany({_id: {$in: tracked.users}}),
    db.collection('authAccounts').deleteMany({userId: {$in: tracked.users}}),
    db.collection('customers').deleteMany({_id: {$in: tracked.customers}}),
    db.collection('suppliers').deleteMany({_id: {$in: tracked.suppliers}}),
    db.collection('products').deleteMany({_id: {$in: tracked.products}}),
    db.collection('stockLots').deleteMany({_id: {$in: tracked.stockLots}}),
    db.collection('serialUnits').deleteMany({tenantId: {$in: tracked.tenants}}),
    db.collection('purchases').deleteMany({_id: {$in: tracked.purchases}}),
    db.collection('supplierReturns').deleteMany({_id: {$in: tracked.supplierReturns}}),
    db.collection('invoices').deleteMany({_id: {$in: tracked.invoices}}),
    db.collection('serviceJobs').deleteMany({_id: {$in: tracked.serviceJobs}}),
    db.collection('warranties').deleteMany({tenantId: {$in: tracked.tenants}}),
    db.collection('accountMovements').deleteMany({tenantId: {$in: tracked.tenants}}),
    db.collection('tenantAccountBalances').deleteMany({tenantId: {$in: tracked.tenants}}),
    db.collection('dailyClosings').deleteMany({tenantId: {$in: tracked.tenants}}),
    db.collection('businessDayGates').deleteMany({tenantId: {$in: tracked.tenants}}),
    db.collection('invoiceTemplates').deleteMany({_id: {$in: tracked.invoiceTemplates}}),
    db.collection('templateRevisions').deleteMany({_id: {$in: tracked.templateRevisions}}),
    db.collection('companySettings').deleteMany({tenantId: {$in: tracked.tenants}}),
    db.collection('openingSetups').deleteMany({tenantId: {$in: tracked.tenants}}),
    db.collection('files').deleteMany({_id: {$in: tracked.files}}),
  ]);
  await client.close();
  console.log('Cleanup complete.');
}
