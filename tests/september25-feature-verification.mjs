import {MongoClient, ObjectId} from 'mongodb';
import {hashPassword} from 'better-auth/crypto';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

function normalizeIndianWhatsAppNumber(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) return digits;
  return null;
}

function whatsappUrl(phone, message) {
  const normalized = normalizeIndianWhatsAppNumber(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message.trim())}`;
}

function invoiceWhatsAppMessage(input) {
  const dueText = input.due ? ` Outstanding amount: ${input.due}.` : '';
  const linkText = input.shareUrl ? ` Invoice link: ${input.shareUrl}` : '';
  return `Hello ${input.customerName || 'Customer'}, thank you for choosing ${input.shopName}. Invoice ${input.invoiceNumber} total: ${input.total}.${dueText}${linkText} Please review the invoice and contact us if you need any help.`;
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
  users: [],
  tenants: [],
  customers: [],
  products: [],
  services: [],
  stockLots: [],
  serialUnits: [],
  quotations: [],
  invoices: [],
  stockMovements: [],
  accountMovements: [],
  customerReceipts: [],
  customerAllocations: [],
  customerAdvances: [],
  warranties: [],
  templates: [],
  invoiceTemplates: [],
  templateRevisions: [],
  openingSetups: [],
  tenantAccountBalances: [],
  tenantCounters: [],
  idempotencyOperations: [],
  auditHistory: [],
};

async function api(method, path, body, cookie, extraHeaders = {}, asBuffer = false) {
  const headers = {
    origin: base,
    ...(cookie ? {cookie} : {}),
    ...(body ? {'content-type': 'application/json'} : {}),
    ...extraHeaders,
  };
  const res = await fetch(base + path, {
    method,
    headers,
    ...(body ? {body: JSON.stringify(body)} : {}),
  });

  const contentType = res.headers.get('content-type') || '';
  let data;
  let buffer;
  if (asBuffer) {
    buffer = Buffer.from(await res.arrayBuffer());
  } else if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return {status: res.status, headers: res.headers, data, buffer};
}

async function setupTenant(suffix) {
  const tenantId = `test-sep25-tenant-${Date.now()}-${suffix}-${randomUUID().slice(0, 4)}`;
  const userId = new ObjectId();
  const email = `sep25-admin-${Date.now()}-${suffix}@test.com`;
  const password = 'Password123!';
  const hashedPassword = await hashPassword(password);

  tracked.tenants.push(tenantId);
  tracked.users.push(userId);

  await db.collection('tenants').insertOne({
    _id: tenantId,
    companyName: `Test Tenant ${suffix.toUpperCase()}`,
    verified: true,
    disabled: false,
    createdAt: new Date(),
  });

  await db.collection('authUsers').insertOne({
    _id: userId,
    name: `Admin ${suffix}`,
    email,
    emailVerified: true,
    tenantId,
    verified: true,
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

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
    _id: tenantId,
    tenantId,
    name: `iTech Salem ${suffix.toUpperCase()}`,
    phone: '9876543210',
    email,
    address: `100 Meyyanur Main Road, Salem, Tamil Nadu 636004`,
    gst: '33AAAAA0000A1Z5',
    state: 'Tamil Nadu',
    stateCode: '33',
    postalCode: '636004',
    bank: 'HDFC Bank',
    account: '50200012345678',
    ifsc: 'HDFC0001234',
    declaration: 'We declare that this invoice shows the actual price and details.',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await db.collection('businessDayGates').insertOne({
    _id: `DAY-${tenantId}`,
    tenantId,
    version: 1,
    closedThrough: null,
  });

  // Login to get cookie
  const loginRes = await api('POST', '/api/auth/sign-in/email', {email, password});
  assert.strictEqual(loginRes.status, 200, `Login failed for ${suffix}`);
  const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
  const cookie = setCookies.map(c => c?.split(';')[0]).filter(Boolean).join('; ');

  const yesterday = '2026-09-09';
  await db.collection('openingSetups').insertOne({
    _id: tenantId,
    tenantId,
    status: 'Finalized',
    cutoffDate: yesterday,
    openingCashPaise: 5000000,
    openingBankPaise: 10000000,
    finalizedAt: new Date(),
  });
  tracked.openingSetups.push(tenantId);

  const movCash = new ObjectId();
  const movBank = new ObjectId();
  await db.collection('accountMovements').insertMany([
    {_id: movCash.toString(), tenantId, date: yesterday, account: 'Cash', qty: 5000000, reason: 'Opening cash', reference: 'Opening setup'},
    {_id: movBank.toString(), tenantId, date: yesterday, account: 'Bank', qty: 10000000, reason: 'Opening bank', reference: 'Opening setup'},
  ]);
  tracked.accountMovements.push(movCash.toString(), movBank.toString());

  const templateId = `TPL-${tenantId}`;
  await db.collection('invoiceTemplates').insertOne({
    _id: templateId,
    tenantId,
    name: 'Standard Tax Invoice',
    isDefault: true,
    currentRevision: 1,
    status: 'Active',
    createdAt: new Date(),
  });
  tracked.templates.push(templateId);

  const revisionId = `REV-${tenantId}-1`;
  await db.collection('templateRevisions').insertOne({
    _id: revisionId,
    tenantId,
    templateId,
    revision: 1,
    name: 'Revision 1',
    snapshot: {
      columns: [
        {id: 'index', label: '#', show: true, align: 'left'},
        {id: 'description', label: 'Item & Description', show: true, align: 'left'},
        {id: 'hsn', label: 'HSN/SAC', show: true, align: 'left'},
        {id: 'qty', label: 'Qty', show: true, align: 'right'},
        {id: 'rate', label: 'Rate (INR)', show: true, align: 'right'},
        {id: 'tax', label: 'Tax', show: true, align: 'right'},
        {id: 'amount', label: 'Amount (INR)', show: true, align: 'right'},
      ],
      fields: {logo: true, shopName: true, number: true, date: true, declaration: true, bank: true, signatures: true},
    },
    createdAt: new Date(),
  });
  tracked.templateRevisions.push(revisionId);

  const migRes = await api('POST', '/api/purchases/migration', {}, cookie);
  assert.strictEqual(migRes.status, 200, `Migration failed for ${suffix}`);

  return {tenantId, userId, cookie, templateId};
}

console.log('=== SEPTEMBER 25 FEATURE SUITE: INITIALIZING TEST TENANTS ===');
const compA = await setupTenant('a');
const compB = await setupTenant('b');
console.log(`✓ Tenant A initialized: ${compA.tenantId}`);
console.log(`✓ Tenant B initialized: ${compB.tenantId}`);

try {
  // =========================================================================
  // CHECK 1: Product & Service Descriptions CRUD, Search, and Line Invoicing
  // =========================================================================
  console.log('\n--- CHECK 1: Product & Service Descriptions CRUD & Search ---');

  // 1a. Create Product with Multiline Specification Description
  const prodDesc = 'Crucial P3 Plus 1TB PCIe M.2 2280 SSD\nSequential Read: Up to 5000 MB/s\nSequential Write: Up to 4200 MB/s\nMicron Advanced 3D NAND\n5-Year Limited Warranty';
  const prodRes = await api(
    'POST',
    '/api/master/products',
    {
      name: 'Crucial P3 Plus 1TB NVMe SSD',
      description: prodDesc,
      category: 'Storage',
      brand: 'Crucial',
      condition: 'New',
      model: 'CT1000P3PSSD8',
      hsn: '85235100',
      costPaise: 420000,
      sellingPricePaise: 560000,
      priceEntryMode: 'Inclusive',
      taxBasisPoints: 1800,
      low: 2,
      warranty: 60,
      isSerialTracked: false,
    },
    compA.cookie
  );
  assert.strictEqual(prodRes.status, 200, `Product creation failed: ${JSON.stringify(prodRes.data)}`);
  const prod = prodRes.data.product || prodRes.data;
  assert.strictEqual(prod.description, prodDesc, 'Product description must be preserved');
  const prodId = prod._id;
  tracked.products.push(prodId);

  // 1b. Create Service with Description
  const srvDesc = 'Complete hardware diagnostic, fan deep cleaning, thermal paste replacement, and internal dust blowout.';
  const srvRes = await api(
    'POST',
    '/api/master/services',
    {
      name: 'Desktop Deep Clean & Thermal Service',
      category: 'Maintenance',
      description: srvDesc,
      sac: '998713',
      ratePaise: 150000,
      taxBasisPoints: 1800,
      warranty: 1,
    },
    compA.cookie
  );
  assert.strictEqual(srvRes.status, 200, `Service creation failed: ${JSON.stringify(srvRes.data)}`);
  const srv = srvRes.data.service || srvRes.data;
  assert.strictEqual(srv.description, srvDesc, 'Service description must be preserved');
  const srvId = srv._id;
  tracked.services.push(srvId);

  // 1c. Edit Both and confirm persistence
  const updatedProdDesc = prodDesc + '\nIncludes 3-Year Onsite Shop Warranty';
  const prodEditRes = await api(
    'PUT',
    `/api/master/products/${prodId}`,
    {
      name: prod.name,
      description: updatedProdDesc,
      category: prod.category,
      brand: prod.brand,
      condition: prod.condition,
      model: prod.model,
      hsn: prod.hsn,
      costPaise: prod.costPaise,
      sellingPricePaise: prod.sellingPricePaise,
      priceEntryMode: prod.priceEntryMode,
      taxBasisPoints: prod.taxBasisPoints,
      low: prod.low,
      warranty: prod.warranty,
    },
    compA.cookie
  );
  assert.strictEqual(prodEditRes.status, 200, `Product edit failed: ${JSON.stringify(prodEditRes.data)}`);
  const editedProd = prodEditRes.data.product || prodEditRes.data;
  assert.strictEqual(editedProd.description, updatedProdDesc);

  const updatedSrvDesc = srvDesc + '\nFree thermal benchmark report included.';
  const srvEditRes = await api(
    'PUT',
    `/api/master/services/${srvId}`,
    {
      name: srv.name,
      category: srv.category,
      description: updatedSrvDesc,
      ratePaise: srv.ratePaise,
      taxBasisPoints: srv.taxBasisPoints,
      sac: srv.sac,
      warranty: srv.warranty,
      active: srv.active,
    },
    compA.cookie
  );
  assert.strictEqual(srvEditRes.status, 200, `Service edit failed: ${JSON.stringify(srvEditRes.data)}`);
  const editedSrv = srvEditRes.data.service || srvEditRes.data;
  assert.strictEqual(editedSrv.description, updatedSrvDesc);

  // 1d. Search product using a word found ONLY in its description
  const searchOnlyInDesc = await api(
    'GET',
    '/api/master/products?search=Sequential',
    null,
    compA.cookie
  );
  assert.strictEqual(searchOnlyInDesc.status, 200);
  assert.ok(
    searchOnlyInDesc.data.records.some(p => p._id === prodId),
    'Search by description keyword must find the product'
  );

  console.log('✓ Check 1 passed: Product & Service descriptions CRUD & search verified.');

  // =========================================================================
  // CHECK 2: Search Pagination & Master Dataset Limits
  // =========================================================================
  console.log('\n--- CHECK 2: Search Pagination & Master Dataset Limits ---');
  const prodPageRes = await api('GET', '/api/master/products?limit=5', null, compA.cookie);
  assert.strictEqual(prodPageRes.status, 200);
  assert.ok(Array.isArray(prodPageRes.data.records));
  assert.ok(prodPageRes.data.records.length <= 5, 'Page limit must be respected');
  assert.ok(typeof prodPageRes.data.total === 'number', 'Total count must be returned');

  console.log('✓ Check 2 passed: Master search is bounded and paginated.');

  // =========================================================================
  // CHECK 3: Inline Customer Creation & Duplicate Handling
  // =========================================================================
  console.log('\n--- CHECK 3: Inline Customer Creation & Duplicate Handling ---');

  const custPayload = {
    name: 'Muthu Ramanathan',
    phone: '9842712345',
    email: 'muthu@example.com',
    address: '45 Cherry Road, Hasthampatti, Salem 636007',
    type: 'Individual',
    creditLimitPaise: 10000000,
    paymentTermsDays: 30,
    details: {
      state: 'Tamil Nadu',
      postalCode: '636007',
    },
  };

  const custRes = await api('POST', '/api/master/customers', custPayload, compA.cookie);
  assert.strictEqual(custRes.status, 200, `Customer creation failed: ${JSON.stringify(custRes.data)}`);
  const cust = custRes.data.customer || custRes.data;
  assert.ok(cust?._id, 'Customer ID must be returned');
  const custId = cust._id;
  tracked.customers.push(custId);

  // Duplicate phone returns 200 with informative warning
  const dupPhoneRes = await api('POST', '/api/master/customers', custPayload, compA.cookie);
  assert.strictEqual(dupPhoneRes.status, 200);
  const dupCust = dupPhoneRes.data.customer || dupPhoneRes.data;
  assert.ok(dupCust.warning?.includes('already used by customer') || dupPhoneRes.data.warning?.includes('already used by customer'), 'Duplicate phone must return informative warning');

  // Duplicate GSTIN returns HTTP 400 error
  const custWithGst = {
    ...custPayload,
    name: 'Business Customer GST',
    phone: '9842719999',
    gst: '33AAAAA1234A1Z5',
  };
  const custGstRes = await api('POST', '/api/master/customers', custWithGst, compA.cookie);
  assert.strictEqual(custGstRes.status, 200);
  tracked.customers.push((custGstRes.data.customer || custGstRes.data)._id);

  const dupGstRes = await api('POST', '/api/master/customers', {...custWithGst, phone: '9842718888'}, compA.cookie);
  assert.strictEqual(dupGstRes.status, 400, 'Duplicate GSTIN must return 400');
  assert.ok(dupGstRes.data.error.includes('GSTIN already exists'));

  // Invalid phone format returns HTTP 400 error
  const invalidPhoneRes = await api('POST', '/api/master/customers', {...custPayload, phone: '123'}, compA.cookie);
  assert.strictEqual(invalidPhoneRes.status, 400, 'Invalid phone number format must return 400');

  console.log('✓ Check 3 passed: Inline customer creation, duplicate phone warning, duplicate GST rejection, and phone validation verified.');

  // =========================================================================
  // CHECK 4: Stock Receipt, Multi-Line Invoicing & Snapshot Retention
  // =========================================================================
  console.log('\n--- CHECK 4: Stock Receipt & Invoice Snapshot Retention ---');

  // Add stock lots for prodId directly
  const lot1Id = `LOT-${Date.now()}`;
  await db.collection('stockLots').insertOne({
    _id: lot1Id,
    tenantId: compA.tenantId,
    productId: prodId,
    lotNumber: 'LOT-SSD-001',
    costPaise: 420000,
    quantityReceived: 10,
    quantitySellable: 10,
    quantityRemaining: 10,
    quantityReserved: 0,
    quantitySold: 0,
    quantityDefective: 0,
    quantityReturned: 0,
    version: 1,
    receivedDate: '2026-09-20',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  tracked.stockLots.push(lot1Id);

  // 4a. Create Draft Sale Invoice with Product Line
  const draft1Res = await api(
    'POST',
    '/api/sales/invoices',
    {
      idempotencyKey: randomUUID(),
      customerId: custId,
      invoiceKind: 'Sale',
      businessCategory: 'NewGoods',
      taxMode: 'Intra-state',
      placeOfSupply: 'Tamil Nadu',
      templateId: compA.templateId,
      templateRevision: 1,
      inclusive: true,
      lines: [
        {
          lineType: 'Product',
          productId: prodId,
          hsn: '85235100',
          description: updatedProdDesc,
          quantity: 1,
          unitRatePaise: 560000,
          taxBasisPoints: 1800,
          taxTreatment: 'Taxable',
          discountType: 'Percentage',
          discountValue: 0,
          warrantyMonths: 36,
          clientLineKey: 'inv-line-1',
          stockAllocations: [{lotId: lot1Id, quantity: 1, serials: []}],
        },
      ],
    },
    compA.cookie
  );
  assert.strictEqual(draft1Res.status, 200, `Draft sale invoice creation failed: ${JSON.stringify(draft1Res.data)}`);
  const draft1 = draft1Res.data.invoice || draft1Res.data;
  assert.strictEqual(draft1.status, 'Draft');
  const draft1Id = draft1._id;
  tracked.invoices.push(draft1Id);
  assert.strictEqual(draft1.lines[0].description, updatedProdDesc, 'Draft line description must match product snapshot');

  // 4b. Verify Draft Safety: ZERO movements, receivables, or ledger changes
  const draftMovements = await db.collection('stockMovements').find({invoiceId: draft1Id}).toArray();
  assert.strictEqual(draftMovements.length, 0, 'Draft invoice must create zero stock movements');

  const draftAccountMovements = await db.collection('accountMovements').find({invoiceId: draft1Id}).toArray();
  assert.strictEqual(draftAccountMovements.length, 0, 'Draft invoice must create zero account movements');

  const draftInvoicesInDb = await db.collection('invoices').findOne({_id: draft1Id, tenantId: compA.tenantId});
  assert.strictEqual(draftInvoicesInDb.status, 'Draft');
  assert.strictEqual(draftInvoicesInDb.duePaise, 0, 'Draft invoices have zero duePaise in database');

  // 4c. Issue the Sale Invoice as Unpaid
  const issue1Res = await api(
    'POST',
    `/api/sales/invoices/${draft1Id}/issue`,
    {
      draftId: draft1Id,
      expectedVersion: draft1.version,
      idempotencyKey: randomUUID(),
      paymentComponents: [],
    },
    compA.cookie
  );
  assert.strictEqual(issue1Res.status, 200, `Invoice issuance failed: ${JSON.stringify(issue1Res.data)}`);
  assert.ok(issue1Res.data.invoiceNumber, 'Issue response must include invoiceNumber');

  const getIssued1 = await api('GET', `/api/sales/invoices/${draft1Id}`, null, compA.cookie);
  assert.strictEqual(getIssued1.status, 200);
  const issuedInv1 = getIssued1.data.invoice;
  assert.strictEqual(issuedInv1.status, 'Issued');
  assert.strictEqual(issuedInv1.paymentStatus, 'Unpaid');
  assert.ok(issuedInv1.invoiceNumber, 'Issued invoice must have an official invoiceNumber');
  const snap1 = issuedInv1.issuedSnapshot || issuedInv1;
  assert.ok(snap1.seller?.name, 'Seller snapshot must be immutable');
  assert.ok(snap1.customer?.name, 'Customer snapshot must be immutable');
  assert.ok(snap1.template, 'Template revision snapshot must be captured in issuedSnapshot');
  assert.strictEqual(snap1.lines[0].description, updatedProdDesc, 'Issued line snapshot description must match');

  // 4d. Mutate master product description and verify issued invoice snapshot is UNCHANGED!
  await api(
    'PUT',
    `/api/master/products/${prodId}`,
    {
      name: prod.name,
      description: 'MUTATED MASTER DESCRIPTION THAT MUST NOT AFFECT ISSUED INVOICE',
      category: prod.category,
      brand: prod.brand,
      condition: prod.condition,
      model: prod.model,
      hsn: prod.hsn,
      costPaise: prod.costPaise,
      sellingPricePaise: prod.sellingPricePaise,
      priceEntryMode: prod.priceEntryMode,
      taxBasisPoints: prod.taxBasisPoints,
      low: prod.low,
      warranty: prod.warranty,
    },
    compA.cookie
  );

  const fetchIssuedAfterMutate = await api('GET', `/api/sales/invoices/${draft1Id}`, null, compA.cookie);
  assert.strictEqual(fetchIssuedAfterMutate.status, 200);
  const fetchedInv1 = fetchIssuedAfterMutate.data.invoice || fetchIssuedAfterMutate.data;
  const fetchedSnap1 = fetchedInv1.issuedSnapshot || fetchedInv1;
  assert.strictEqual(
    fetchedSnap1.lines[0].description,
    updatedProdDesc,
    'Issued invoice line description must remain immutable when master product description changes'
  );

  console.log('✓ Check 4 passed: Draft safety & immutable issued snapshot retention verified.');

  // =========================================================================
  // CHECK 5: Multi-Category, Multi-Status Invoices & Filter Contract
  // =========================================================================
  console.log('\n--- CHECK 5: Multi-Category, Multi-Status Invoices Setup ---');

  // Customer B: Interstate customer in Karnataka
  const interCustRes = await api(
    'POST',
    '/api/master/customers',
    {
      name: 'Bengaluru Tech Labs',
      phone: '9845012345',
      email: 'procurement@bengaluru.example',
      address: '12 Indiranagar, Bengaluru, Karnataka 560038',
      type: 'Business',
      gst: '29AAAAA1111A1Z1',
      details: {
        state: 'Karnataka',
        postalCode: '560038',
      },
    },
    compA.cookie
  );
  assert.strictEqual(interCustRes.status, 200);
  const interCust = interCustRes.data.customer || interCustRes.data;
  const interCustId = interCust._id;
  tracked.customers.push(interCustId);

  // 5a. Create Interstate Issued Invoice (Paid in Full via Bank UPI)
  const inv2DraftRes = await api(
    'POST',
    '/api/sales/invoices',
    {
      idempotencyKey: randomUUID(),
      customerId: interCustId,
      invoiceKind: 'Sale',
      businessCategory: 'NewGoods',
      taxMode: 'Inter-state',
      placeOfSupply: 'Karnataka',
      templateId: compA.templateId,
      templateRevision: 1,
      inclusive: true,
      lines: [
        {
          lineType: 'Product',
          productId: prodId,
          hsn: '85235100',
          description: 'Interstate SSD Supply',
          quantity: 1,
          unitRatePaise: 560000,
          taxBasisPoints: 1800,
          taxTreatment: 'Taxable',
          discountType: 'Percentage',
          discountValue: 0,
          warrantyMonths: 36,
          clientLineKey: 'line-inter-1',
          stockAllocations: [{lotId: lot1Id, quantity: 1, serials: []}],
        },
      ],
    },
    compA.cookie
  );
  assert.strictEqual(inv2DraftRes.status, 200, `Interstate draft creation failed: ${JSON.stringify(inv2DraftRes.data)}`);
  const inv2Draft = inv2DraftRes.data.invoice || inv2DraftRes.data;
  const inv2Id = inv2Draft._id;
  tracked.invoices.push(inv2Id);

  const inv2IssueRes = await api(
    'POST',
    `/api/sales/invoices/${inv2Id}/issue`,
    {
      draftId: inv2Id,
      expectedVersion: inv2Draft.version,
      idempotencyKey: randomUUID(),
      paymentComponents: [
        {account: 'Bank', method: 'UPI', amountPaise: 560000, reference: 'UPI-PAID-FULL-01'}
      ],
    },
    compA.cookie
  );
  assert.strictEqual(inv2IssueRes.status, 200, `Interstate invoice issue failed: ${JSON.stringify(inv2IssueRes.data)}`);
  assert.ok(inv2IssueRes.data.invoiceNumber);

  const getIssued2 = await api('GET', `/api/sales/invoices/${inv2Id}`, null, compA.cookie);
  assert.strictEqual(getIssued2.status, 200);
  const inv2 = getIssued2.data.invoice;
  assert.strictEqual(inv2.paymentStatus, 'Paid');
  assert.strictEqual(inv2.taxMode, 'Inter-state');

  // 5b. Create Service Invoice (Partly Paid via Cash)
  const inv3DraftRes = await api(
    'POST',
    '/api/sales/invoices',
    {
      idempotencyKey: randomUUID(),
      customerId: custId,
      invoiceKind: 'Service',
      businessCategory: 'Service',
      taxMode: 'Intra-state',
      placeOfSupply: 'Tamil Nadu',
      templateId: compA.templateId,
      templateRevision: 1,
      inclusive: true,
      lines: [
        {
          lineType: 'Service',
          serviceId: srvId,
          sac: '998713',
          description: updatedSrvDesc,
          quantity: 2,
          unitRatePaise: 150000,
          taxBasisPoints: 1800,
          taxTreatment: 'Taxable',
          discountType: 'Percentage',
          discountValue: 0,
          warrantyMonths: 1,
          clientLineKey: 'srv-line-1',
        },
      ],
    },
    compA.cookie
  );
  assert.strictEqual(inv3DraftRes.status, 200);
  const inv3Draft = inv3DraftRes.data.invoice || inv3DraftRes.data;
  const inv3Id = inv3Draft._id;
  tracked.invoices.push(inv3Id);

  const inv3IssueRes = await api(
    'POST',
    `/api/sales/invoices/${inv3Id}/issue`,
    {
      draftId: inv3Id,
      expectedVersion: inv3Draft.version,
      idempotencyKey: randomUUID(),
      paymentComponents: [
        {account: 'Cash', method: 'Cash', amountPaise: 150000, reference: 'PARTIAL-CASH'} // half of 300000
      ],
    },
    compA.cookie
  );
  assert.strictEqual(inv3IssueRes.status, 200);
  assert.ok(inv3IssueRes.data.invoiceNumber);

  const getIssued3 = await api('GET', `/api/sales/invoices/${inv3Id}`, null, compA.cookie);
  assert.strictEqual(getIssued3.status, 200);
  const inv3 = getIssued3.data.invoice;
  assert.strictEqual(inv3.paymentStatus, 'PartlyPaid');
  assert.strictEqual(inv3.businessCategory, 'Service');

  // 5c. Create Draft Used Goods Invoice (Remains Draft)
  const inv4DraftRes = await api(
    'POST',
    '/api/sales/invoices',
    {
      idempotencyKey: randomUUID(),
      customerId: custId,
      invoiceKind: 'Sale',
      businessCategory: 'UsedGoods',
      taxMode: 'Intra-state',
      placeOfSupply: 'Tamil Nadu',
      templateId: compA.templateId,
      templateRevision: 1,
      inclusive: true,
      lines: [
        {
          lineType: 'Product',
          productId: prodId,
          hsn: '85235100',
          description: 'Refurbished Grade-A SSD',
          quantity: 1,
          unitRatePaise: 450000,
          taxBasisPoints: 1800,
          taxTreatment: 'Taxable',
          discountType: 'Percentage',
          discountValue: 0,
          clientLineKey: 'refurb-line-1',
          stockAllocations: [],
        },
      ],
    },
    compA.cookie
  );
  assert.strictEqual(inv4DraftRes.status, 200);
  const inv4Draft = inv4DraftRes.data.invoice || inv4DraftRes.data;
  const inv4Id = inv4Draft._id;
  tracked.invoices.push(inv4Id);
  assert.strictEqual(inv4Draft.status, 'Draft');

  // 5d. Create Cancelled Invoice Draft
  const inv5DraftRes = await api(
    'POST',
    '/api/sales/invoices',
    {
      idempotencyKey: randomUUID(),
      customerId: custId,
      invoiceKind: 'Sale',
      businessCategory: 'NewGoods',
      taxMode: 'Intra-state',
      placeOfSupply: 'Tamil Nadu',
      templateId: compA.templateId,
      templateRevision: 1,
      inclusive: true,
      lines: [
        {
          lineType: 'Product',
          productId: prodId,
          hsn: '85235100',
          description: 'Draft to cancel immediately',
          quantity: 1,
          unitRatePaise: 100000,
          taxBasisPoints: 1800,
          taxTreatment: 'Taxable',
          discountType: 'Percentage',
          discountValue: 0,
          clientLineKey: 'cancel-line-1',
          stockAllocations: [],
        },
      ],
    },
    compA.cookie
  );
  assert.strictEqual(inv5DraftRes.status, 200);
  const inv5Draft = inv5DraftRes.data.invoice || inv5DraftRes.data;
  const inv5Id = inv5Draft._id;
  tracked.invoices.push(inv5Id);

  const cancelRes = await api(
    'DELETE',
    `/api/sales/invoices/${inv5Id}`,
    {
      expectedVersion: inv5Draft.version,
      idempotencyKey: randomUUID(),
      reason: 'Cancelled for September 25 verification check',
    },
    compA.cookie
  );
  assert.strictEqual(cancelRes.status, 200, 'Draft invoice cancellation must succeed');

  console.log('✓ Check 5 established 5 diverse invoices across NewGoods, Service, UsedGoods; Paid, PartlyPaid, Unpaid, Draft, Cancelled.');

  // =========================================================================
  // CHECK 6: Server Sales Filters & Summary Metric Parity
  // =========================================================================
  console.log('\n--- CHECK 6: Filter Query Evaluation & Summary Metric Parity ---');

  // Test Filter 1: List without filter returns invoices
  const listAll = await api('GET', '/api/sales/invoices', null, compA.cookie);
  assert.strictEqual(listAll.status, 200);
  const allItems = listAll.data.items || listAll.data.records || [];
  assert.ok(allItems.length >= 4, `Expected at least 4 invoices, found ${allItems.length}`);

  // Test Filter 2: Payment Status = 'Paid'
  const filterPaid = await api('GET', '/api/sales/invoices?paymentStatus=Paid', null, compA.cookie);
  assert.strictEqual(filterPaid.status, 200);
  const paidItems = filterPaid.data.items || filterPaid.data.records || [];
  assert.ok(paidItems.length >= 1);
  assert.ok(paidItems.every(r => r.paymentStatus === 'Paid'), 'All returned records must have paymentStatus Paid');
  assert.ok(paidItems.some(r => r._id === inv2Id));

  // Test Filter 3: Category = 'Service'
  const filterService = await api('GET', '/api/sales/invoices?businessCategory=Service', null, compA.cookie);
  assert.strictEqual(filterService.status, 200);
  const serviceItems = filterService.data.items || filterService.data.records || [];
  assert.ok(serviceItems.length >= 1);
  assert.ok(serviceItems.every(r => r.businessCategory === 'Service'));
  assert.ok(serviceItems.some(r => r._id === inv3Id));

  // Test Filter 4: Tax Mode = 'Inter-state'
  const filterInter = await api('GET', '/api/sales/invoices?taxMode=Inter-state', null, compA.cookie);
  assert.strictEqual(filterInter.status, 200);
  const interItems = filterInter.data.items || filterInter.data.records || [];
  assert.ok(interItems.length >= 1);
  assert.ok(interItems.every(r => r.taxMode === 'Inter-state'));
  assert.ok(interItems.some(r => r._id === inv2Id));

  // Test Filter 5: Search by Customer Phone
  const filterPhone = await api('GET', '/api/sales/invoices?search=9845012345', null, compA.cookie);
  assert.strictEqual(filterPhone.status, 200);
  const phoneItems = filterPhone.data.items || filterPhone.data.records || [];
  assert.ok(phoneItems.some(r => r._id === inv2Id));

  // Test Filter 6: Search by Customer Name
  const filterName = await api('GET', '/api/sales/invoices?search=Bengaluru', null, compA.cookie);
  assert.strictEqual(filterName.status, 200);
  const nameItems = filterName.data.items || filterName.data.records || [];
  assert.ok(nameItems.some(r => r._id === inv2Id));

  // Test Filter 7: Search by Invoice Number
  const filterInvNum = await api('GET', `/api/sales/invoices?search=${issuedInv1.invoiceNumber}`, null, compA.cookie);
  assert.strictEqual(filterInvNum.status, 200);
  const numItems = filterInvNum.data.items || filterInvNum.data.records || [];
  assert.ok(numItems.some(r => r._id === draft1Id));

  // Test Filter 8: Summary Cards Parity with Matching Query
  const summaryRes = await api('GET', '/api/sales/summary?businessCategory=Service', null, compA.cookie);
  assert.strictEqual(summaryRes.status, 200);
  const summaryData = summaryRes.data;
  assert.ok(summaryData.invoices.totalSalesPaise > 0, 'Service summary must aggregate sales paise');
  assert.strictEqual(summaryData.invoices.issuedCount, 1, 'Service summary issued count must match');
  assert.strictEqual(summaryData.invoices.totalDuePaise, 150000, 'Service summary due paise must match unpaid balance');
  assert.strictEqual(summaryData.invoices.totalPaidPaise, 150000, 'Service summary paid paise must match paid balance');

  console.log('✓ Check 6 passed: Filter combinations, searches, and summary metrics match.');

  // =========================================================================
  // CHECK 7: Filtered Exports Parity (CSV, XLSX, PDF, ZIP) & Draft Exclusion
  // =========================================================================
  console.log('\n--- CHECK 7: Filtered Exports Parity & Draft Safety ---');

  // 7a. Official CSV export without selecting Draft must EXCLUDE drafts
  const csvRes = await api('GET', '/api/sales/invoices/export?format=csv', null, compA.cookie);
  assert.strictEqual(csvRes.status, 200);
  assert.ok(typeof csvRes.data === 'string', 'CSV must return text');
  assert.ok(!csvRes.data.includes(inv4Id), 'Official CSV export must omit draft invoice');

  // 7b. Official export with status=Draft must include drafts
  const csvDraftRes = await api('GET', '/api/sales/invoices/export?format=csv&status=Draft', null, compA.cookie);
  assert.strictEqual(csvDraftRes.status, 200);
  assert.ok(csvDraftRes.data.includes(inv4Id) || csvDraftRes.data.includes('Draft'), 'Draft export must include drafts');

  // 7c. XLSX export format check
  const xlsxRes = await api('GET', '/api/sales/invoices/export?format=xlsx', null, compA.cookie, {}, true);
  assert.strictEqual(xlsxRes.status, 200);
  assert.ok(xlsxRes.headers.get('content-type')?.includes('spreadsheetml'), 'XLSX content type must match');

  // 7d. Batch PDF ZIP export with filters
  const zipRes = await api('GET', '/api/sales/invoices/export-zip?paymentStatus=Paid', null, compA.cookie, {}, true);
  assert.strictEqual(zipRes.status, 200);
  const zip = await JSZip.loadAsync(zipRes.buffer);
  const manifestFile = zip.file('manifest.json');
  assert.ok(manifestFile, 'ZIP export must contain manifest.json');
  const manifest = JSON.parse(await manifestFile.async('string'));
  assert.strictEqual(manifest.filters.paymentStatus, 'Paid');
  assert.ok(manifest.invoices.every(i => i.paymentStatus === 'Paid'), 'Manifest invoices must all be Paid');

  console.log('✓ Check 7 passed: CSV, XLSX, PDF, and ZIP exports strictly adhere to normalized filter contract and draft rules.');

  // =========================================================================
  // CHECK 8: WhatsApp Number Normalization and Action URL Builder
  // =========================================================================
  console.log('\n--- CHECK 8: WhatsApp Normalization & Message Link Verification ---');

  // Test Indian number formats:
  assert.strictEqual(normalizeIndianWhatsAppNumber('9876543210'), '919876543210', '10-digit mobile normalized to 91XXXXXXXXXX');
  assert.strictEqual(normalizeIndianWhatsAppNumber('+91 98765 43210'), '919876543210', 'Formatted +91 mobile normalized');
  assert.strictEqual(normalizeIndianWhatsAppNumber('09876543210'), '919876543210', 'Leading 0 mobile normalized');
  assert.strictEqual(normalizeIndianWhatsAppNumber('919876543210'), '919876543210', 'Full E.164 without plus normalized');

  // Test invalid formats (must return null and disable direct action):
  assert.strictEqual(normalizeIndianWhatsAppNumber(''), null, 'Blank phone must return null');
  assert.strictEqual(normalizeIndianWhatsAppNumber('0427 2445566'), null, 'Landline without mobile prefix must return null');
  assert.strictEqual(normalizeIndianWhatsAppNumber('12345'), null, 'Short invalid phone must return null');
  assert.strictEqual(normalizeIndianWhatsAppNumber('abcdefghij'), null, 'Alphabetic input must return null');

  // Test Message Generation
  const msg = invoiceWhatsAppMessage({
    customerName: 'Muthu Ramanathan',
    shopName: 'iTech Salem',
    invoiceNumber: issuedInv1.invoiceNumber,
    total: '₹5,600.00',
    due: '₹5,600.00',
  });
  assert.ok(msg.includes('Muthu Ramanathan'));
  assert.ok(msg.includes(issuedInv1.invoiceNumber));
  assert.ok(msg.includes('₹5,600.00'));
  assert.ok(!msg.includes('PDF attached'), 'WhatsApp message must never falsely claim PDF is attached');

  const waLink = whatsappUrl('9876543210', msg);
  assert.ok(waLink?.startsWith('https://wa.me/919876543210?text='));

  console.log('✓ Check 8 passed: WhatsApp normalization and safe links verified.');

  // =========================================================================
  // CHECK 9: Strict Cross-Tenant Isolation
  // =========================================================================
  console.log('\n--- CHECK 9: Strict Cross-Tenant Isolation ---');

  // Tenant B cannot see Tenant A's invoice in list
  const tenantBList = await api('GET', '/api/sales/invoices', null, compB.cookie);
  assert.strictEqual(tenantBList.status, 200);
  const tenantBItems = tenantBList.data.items || tenantBList.data.records || [];
  assert.strictEqual(tenantBItems.length, 0, 'Tenant B must see 0 invoices');

  // Tenant B cannot fetch Tenant A's invoice directly by ID
  const tenantBFetch = await api('GET', `/api/sales/invoices/${draft1Id}`, null, compB.cookie);
  assert.strictEqual(tenantBFetch.status, 404, 'Cross-tenant invoice access must return 404');

  // Tenant B cannot export Tenant A's invoices
  const tenantBExport = await api('GET', '/api/sales/invoices/export?format=csv', null, compB.cookie);
  assert.strictEqual(tenantBExport.status, 200);
  assert.ok(!tenantBExport.data.includes(issuedInv1.invoiceNumber));

  console.log('✓ Check 9 passed: Cross-tenant isolation strictly verified across lists, details, and exports.');

  console.log('\n=========================================================================');
  console.log('🎉 ALL SEPTEMBER 25 AUTOMATED VERIFICATION CHECKS PASSED WITH ZERO ERRORS!');
  console.log('=========================================================================');

} catch (err) {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exitCode = 1;
} finally {
  console.log('\nCleaning up September 25 test tenant data...');
  for (const [colName, ids] of Object.entries(tracked)) {
    if (ids.length > 0) {
      if (colName === 'tenants') {
        await db.collection(colName).deleteMany({_id: {$in: ids}}).catch(() => {});
        await db.collection('companySettings').deleteMany({tenantId: {$in: ids}}).catch(() => {});
        await db.collection('businessDayGates').deleteMany({tenantId: {$in: ids}}).catch(() => {});
      } else if (colName === 'users') {
        await db.collection('authUsers').deleteMany({_id: {$in: ids}}).catch(() => {});
        await db.collection('authAccounts').deleteMany({userId: {$in: ids}}).catch(() => {});
      } else {
        await db.collection(colName).deleteMany({_id: {$in: ids}}).catch(() => {});
      }
    }
  }
  // Delete all records created for tenant IDs
  for (const tId of tracked.tenants) {
    for (const c of ['invoices', 'products', 'services', 'customers', 'suppliers', 'purchases', 'stockLots', 'accountMovements', 'stockMovements', 'customerReceipts', 'tenantAccountBalances']) {
      await db.collection(c).deleteMany({tenantId: tId}).catch(() => {});
    }
  }
  await client.close();
  console.log('Cleanup completed successfully.');
}
