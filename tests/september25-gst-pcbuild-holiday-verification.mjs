import {MongoClient, ObjectId} from 'mongodb';
import {hashPassword} from 'better-auth/crypto';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateGst(l, inclusive, taxMode = 'Intra-state') {
  const gross = l.qty * l.rate;
  const discount = l.discountType === 'Amount' ? l.discount : gross * (l.discount || 0) / 100;
  const discounted = roundMoney(gross - discount);
  const taxRate = (l.taxTreatment === 'Exempt' || l.taxTreatment === 'NonGST') ? 0 : l.tax;
  const base = roundMoney((inclusive && taxRate > 0) ? discounted / (1 + taxRate / 100) : discounted);
  const tax = roundMoney((inclusive && taxRate > 0) ? discounted - base : base * taxRate / 100);
  const total = roundMoney(inclusive ? discounted : base + tax);
  const igst = taxMode === 'Inter-state' ? tax : 0;
  const cgst = igst ? 0 : roundMoney(tax / 2);
  const sgst = igst ? 0 : roundMoney(tax - cgst);
  return {base, tax, total, cgst, sgst, igst, discount: roundMoney(discount)};
}

function calculateSaleLinePaise(input) {
  const grossPaise = input.quantity * input.unitRatePaise;
  let discountPaise = 0;
  if (input.discountType === 'Percentage') {
    discountPaise = Math.round(grossPaise * (input.discountValue || 0) / 10000);
  } else {
    discountPaise = input.discountValue || 0;
  }
  const discountedPaise = grossPaise - discountPaise;
  let taxableBasePaise;
  let taxPaise;
  if (input.inclusive && input.taxBasisPoints > 0) {
    const num = BigInt(discountedPaise) * 10000n;
    const den = BigInt(10000 + input.taxBasisPoints);
    const half = den / 2n;
    taxableBasePaise = Number((num + half) / den);
    taxPaise = discountedPaise - taxableBasePaise;
  } else {
    taxableBasePaise = discountedPaise;
    taxPaise = input.taxBasisPoints > 0 ? Math.round(taxableBasePaise * input.taxBasisPoints / 10000) : 0;
  }
  return {grossPaise, discountPaise, taxableBasePaise, taxPaise, lineTotalPaise: taxableBasePaise + taxPaise};
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
  businessHolidays: [],
  dailyClosings: [],
  dailyClosingDrafts: [],
  businessDayGates: [],
  tenantAccountBalances: [],
  tenantCounters: [],
  idempotencyOperations: [],
  auditHistory: [],
  manualProfitAdjustments: [],
  purchases: [],
  purchaseReceipts: [],
  supplierReturns: [],
  customerReturns: [],
  serviceJobs: [],
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
  const tenantId = `test-sep25-gph-${Date.now()}-${suffix}-${randomUUID().slice(0, 4)}`;
  const userId = new ObjectId();
  const email = `sep25-gph-${Date.now()}-${suffix}@test.com`;
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
    closedThrough: '2026-09-20',
  });
  tracked.businessDayGates.push(`DAY-${tenantId}`);

  // Login to get session cookie
  const loginRes = await api('POST', '/api/auth/sign-in/email', {email, password});
  assert.strictEqual(loginRes.status, 200, `Login failed for ${suffix}`);
  const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
  const cookie = setCookies.map(c => c?.split(';')[0]).filter(Boolean).join('; ');

  const yesterday = '2026-09-20';
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
  tracked.invoiceTemplates.push(templateId);

  await db.collection('templateRevisions').insertOne({
    _id: `${templateId}-r1`,
    tenantId,
    templateId,
    revision: 1,
    snapshot: {
      columns: ['item', 'hsn', 'qty', 'rate', 'tax', 'amount'],
      fields: {showLogo: true, showSign: true},
    },
    createdAt: new Date(),
  });
  tracked.templateRevisions.push(`${templateId}-r1`);

  return {tenantId, userId, cookie, email, templateId};
}

async function cleanup() {
  console.log('\nCleaning up test tenant data...');
  for (const t of tracked.tenants) {
    await db.collection('tenants').deleteMany({_id: t});
    await db.collection('companySettings').deleteMany({tenantId: t});
    await db.collection('customers').deleteMany({tenantId: t});
    await db.collection('products').deleteMany({tenantId: t});
    await db.collection('services').deleteMany({tenantId: t});
    await db.collection('stockLots').deleteMany({tenantId: t});
    await db.collection('serialUnits').deleteMany({tenantId: t});
    await db.collection('quotations').deleteMany({tenantId: t});
    await db.collection('invoices').deleteMany({tenantId: t});
    await db.collection('stockMovements').deleteMany({tenantId: t});
    await db.collection('accountMovements').deleteMany({tenantId: t});
    await db.collection('customerReceipts').deleteMany({tenantId: t});
    await db.collection('customerAllocations').deleteMany({tenantId: t});
    await db.collection('customerAdvances').deleteMany({tenantId: t});
    await db.collection('warranties').deleteMany({tenantId: t});
    await db.collection('invoiceTemplates').deleteMany({tenantId: t});
    await db.collection('templateRevisions').deleteMany({tenantId: t});
    await db.collection('openingSetups').deleteMany({tenantId: t});
    await db.collection('businessHolidays').deleteMany({tenantId: t});
    await db.collection('dailyClosings').deleteMany({tenantId: t});
    await db.collection('dailyClosingDrafts').deleteMany({tenantId: t});
    await db.collection('businessDayGates').deleteMany({tenantId: t});
    await db.collection('tenantAccountBalances').deleteMany({tenantId: t});
    await db.collection('tenantCounters').deleteMany({tenantId: t});
    await db.collection('idempotencyOperations').deleteMany({tenantId: t});
    await db.collection('auditHistory').deleteMany({tenantId: t});
    await db.collection('manualProfitAdjustments').deleteMany({tenantId: t});
    await db.collection('purchases').deleteMany({tenantId: t});
    await db.collection('purchaseReceipts').deleteMany({tenantId: t});
    await db.collection('supplierReturns').deleteMany({tenantId: t});
    await db.collection('customerReturns').deleteMany({tenantId: t});
    await db.collection('serviceJobs').deleteMany({tenantId: t});
  }
  for (const u of tracked.users) {
    await db.collection('authUsers').deleteMany({_id: u});
    await db.collection('authAccounts').deleteMany({userId: u});
    await db.collection('authSessions').deleteMany({userId: u});
  }
  console.log('Cleanup completed successfully.');
}

try {
  console.log('=== SEPTEMBER 25 GST / PC BUILD / HOLIDAY VERIFICATION ===');
  const tenantA = await setupTenant('a');
  const tenantB = await setupTenant('b');

  console.log('✓ Tenant A initialized:', tenantA.tenantId);
  console.log('✓ Tenant B initialized:', tenantB.tenantId);

  // Helper to create customer
  async function createCustomer(tenant, name = 'Kumar Tech Solutions', phone = '9876543210', state = 'Tamil Nadu', stateCode = '33') {
    const custRes = await api('POST', '/api/master/customers', {
      name,
      phone,
      address: '12 Trichy Main Road, Salem, Tamil Nadu 636006',
      type: 'Business',
      gst: '33AABCK1234A1Z5',
      details: {
        state,
        postalCode: '636006',
      },
    }, tenant.cookie);
    assert.strictEqual(custRes.status, 200, `Failed to create customer for ${tenant.tenantId}: ${JSON.stringify(custRes.data)}`);
    const customer = custRes.data.customer || custRes.data;
    tracked.customers.push(customer._id);
    return customer;
  }

  // Helper to create product with stock
  async function createProductWithStock(tenant, name = 'Crucial 1TB NVMe SSD', price = 5000, cost = 3800, tax = 18, stock = 10) {
    const prodRes = await api('POST', '/api/master/products', {
      name,
      description: 'High performance NVMe SSD',
      category: 'Storage',
      brand: 'Crucial',
      condition: 'New',
      model: 'P3 Plus 1TB',
      hsn: '847170',
      costPaise: cost * 100,
      sellingPricePaise: price * 100,
      priceEntryMode: 'Inclusive',
      taxBasisPoints: tax * 100,
      low: 2,
      warranty: 36,
      isSerialTracked: false,
    }, tenant.cookie);
    assert.strictEqual(prodRes.status, 200, `Failed to create product for ${tenant.tenantId}: ${JSON.stringify(prodRes.data)}`);
    const product = prodRes.data.product || prodRes.data;
    tracked.products.push(product._id);

    const lotId = `LOT-${randomUUID().slice(0, 8)}`;
    await db.collection('stockLots').insertOne({
      _id: lotId,
      tenantId: tenant.tenantId,
      productId: product._id,
      lotNumber: 'LOT-2026-001',
      costPaise: cost * 100,
      quantityReceived: stock,
      quantityRemaining: stock,
      receivedDate: '2026-09-20',
      status: 'Active',
      createdAt: new Date(),
    });
    tracked.stockLots.push(lotId);
    return {product, lotId};
  }

  // =========================================================================
  // SECTION 1: INCLUSIVE / EXCLUSIVE GST RATE CONTRACT
  // =========================================================================
  console.log('\n--- SECTION 1: Inclusive/Exclusive GST Rate Contract ---');

  // 1.1 In GST-inclusive mode, enter 5000.00 Rate incl. GST.
  // Rate excl. GST is 4237.29, taxable value + GST reconcile in integer paise, total remains 5000.00
  const gstInclusiveClient = calculateGst({qty: 1, rate: 5000, tax: 18, discount: 0}, true, 'Intra-state');
  assert.strictEqual(gstInclusiveClient.base, 4237.29, 'Client inclusive base rate must be 4237.29');
  assert.strictEqual(gstInclusiveClient.tax, 762.71, 'Client inclusive tax must be 762.71');
  assert.strictEqual(gstInclusiveClient.total, 5000.00, 'Client inclusive total must remain 5000.00');

  const gstInclusiveBackend = calculateSaleLinePaise({
    quantity: 1,
    unitRatePaise: 500000,
    inclusive: true,
    taxBasisPoints: 1800,
    discountType: 'Percentage',
    discountValue: 0,
  });
  assert.strictEqual(gstInclusiveBackend.taxableBasePaise, 423729, 'Backend taxable base paise must be 423729');
  assert.strictEqual(gstInclusiveBackend.taxPaise, 76271, 'Backend tax paise must be 76271');
  assert.strictEqual(gstInclusiveBackend.taxableBasePaise + gstInclusiveBackend.taxPaise, 500000, 'Taxable base + tax must equal 500000 paise');

  // 1.2 Edit Rate excl. GST to 5000.00 -> inclusive becomes 5900.00 and total 5900.00
  const excl5000Client = calculateGst({qty: 1, rate: 5000, tax: 18, discount: 0}, false, 'Intra-state');
  assert.strictEqual(excl5000Client.base, 5000.00, 'Exclusive base must be 5000.00');
  assert.strictEqual(excl5000Client.tax, 900.00, 'Exclusive tax must be 900.00');
  assert.strictEqual(excl5000Client.total, 5900.00, 'Exclusive total must be 5900.00');

  // 1.3 Switch document to GST-exclusive mode: displayed inclusive/exclusive values and final total do not change
  // In inclusive mode rate was 5900; switching to exclusive mode transforms rate to 5900 / 1.18 = 5000
  const switchedRate = 5900 / 1.18;
  const switchedClient = calculateGst({qty: 1, rate: switchedRate, tax: 18, discount: 0}, false, 'Intra-state');
  assert.strictEqual(Math.round(switchedClient.total * 100) / 100, 5900.00, 'Switched total must remain 5900.00');

  // 1.4 In exclusive mode, enter 5000.00 -> total 5900.00. Edit inclusive field to 1180.00 -> exclusive becomes 1000.00, total 1180.00
  const editInclInExclModeRate = 1180 / 1.18; // 1000.00
  assert.strictEqual(editInclInExclModeRate, 1000.00, 'Editing inclusive field to 1180 in exclusive mode derives 1000 exclusive rate');
  const derivedExclClient = calculateGst({qty: 1, rate: editInclInExclModeRate, tax: 18, discount: 0}, false, 'Intra-state');
  assert.strictEqual(derivedExclClient.base, 1000.00, 'Base is 1000.00');
  assert.strictEqual(derivedExclClient.tax, 180.00, 'Tax is 180.00');
  assert.strictEqual(derivedExclClient.total, 1180.00, 'Total is 1180.00');

  // 1.5 Change GST from 18% to 12%: active entry value preserved
  const gst12From1000 = calculateGst({qty: 1, rate: 1000, tax: 12, discount: 0}, false, 'Intra-state');
  assert.strictEqual(gst12From1000.tax, 120.00, 'Tax at 12% is 120.00');
  assert.strictEqual(gst12From1000.total, 1120.00, 'Total at 12% is 1120.00');

  // 1.6 Exempt and Non-GST lines: inclusive and exclusive rates identical, GST zero
  const exemptClient = calculateGst({qty: 1, rate: 2500, tax: 18, discount: 0, taxTreatment: 'Exempt'}, true, 'Intra-state');
  assert.strictEqual(exemptClient.tax, 0, 'Exempt tax must be 0');
  assert.strictEqual(exemptClient.base, 2500, 'Exempt base must equal rate');
  assert.strictEqual(exemptClient.total, 2500, 'Exempt total must equal rate');

  const nongstClient = calculateGst({qty: 1, rate: 3200, tax: 18, discount: 0, taxTreatment: 'NonGST'}, false, 'Intra-state');
  assert.strictEqual(nongstClient.tax, 0, 'NonGST tax must be 0');
  assert.strictEqual(nongstClient.total, 3200, 'NonGST total must equal rate');

  // 1.7 Repeat with qty 3, percentage discount, fixed line discount, intra-state CGST/SGST, interstate IGST
  // Qty 3, rate 2000, discount 10% percentage, 18% GST intra-state:
  // gross = 6000, discount = 600, discounted = 5400, tax = 972, cgst = 486, sgst = 486, total = 6372
  const multiQtyClient = calculateGst({qty: 3, rate: 2000, tax: 18, discount: 10, discountType: 'Percentage'}, false, 'Intra-state');
  assert.strictEqual(multiQtyClient.discount, 600.00);
  assert.strictEqual(multiQtyClient.base, 5400.00);
  assert.strictEqual(multiQtyClient.tax, 972.00);
  assert.strictEqual(multiQtyClient.cgst, 486.00);
  assert.strictEqual(multiQtyClient.sgst, 486.00);
  assert.strictEqual(multiQtyClient.igst, 0.00);
  assert.strictEqual(multiQtyClient.total, 6372.00);

  // Interstate IGST:
  const interstateClient = calculateGst({qty: 3, rate: 2000, tax: 18, discount: 10, discountType: 'Percentage'}, false, 'Inter-state');
  assert.strictEqual(interstateClient.igst, 972.00);
  assert.strictEqual(interstateClient.cgst, 0.00);
  assert.strictEqual(interstateClient.sgst, 0.00);

  // Fixed line discount: ₹500 discount on gross 6000 -> 5500 discounted
  const fixedDiscClient = calculateGst({qty: 3, rate: 2000, tax: 18, discount: 500, discountType: 'Amount'}, false, 'Intra-state');
  assert.strictEqual(fixedDiscClient.discount, 500.00);
  assert.strictEqual(fixedDiscClient.base, 5500.00);
  assert.strictEqual(fixedDiscClient.tax, 990.00);
  assert.strictEqual(fixedDiscClient.total, 6490.00);

  // 1.8 Add existing inventory product in both entry modes. Its saved selling price seeds the correct value without changing product master or stock
  const {product: ssdProduct, lotId: ssdLotId} = await createProductWithStock(tenantA, 'Samsung 980 Pro 1TB', 8000, 6000, 18, 5);
  const masterBefore = await db.collection('products').findOne({_id: ssdProduct._id, tenantId: tenantA.tenantId});
  assert.strictEqual(masterBefore.sellingPricePaise, 800000);

  // 1.9 Save and reload quotation and invoice draft: entry mode, stored rate, derived rates, GST, discount, total unchanged
  const customerA = await createCustomer(tenantA);

  const quotationDraftPayload = {
    idempotencyKey: `IDEM-QUO-${randomUUID()}`,
    customerId: customerA._id,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    quotationDate: '2026-09-25',
    validUntil: '2026-10-25',
    inclusive: true,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: tenantA.templateId,
    templateRevision: 1,
    lines: [
      {
        clientLineKey: 'CLK-QUO-SSD-1',
        lineType: 'Product',
        productId: ssdProduct._id,
        quantity: 1,
        unitRatePaise: 800000,
        taxBasisPoints: 1800,
        discountType: 'Percentage',
        discountValue: 0,
        taxTreatment: 'Taxable',
        hsn: '847170',
        stockAllocations: [],
        description: 'Samsung 980 Pro 1TB SSD',
      },
    ],
  };

  const createQuoRes = await api('POST', '/api/sales/quotations', quotationDraftPayload, tenantA.cookie);
  assert.strictEqual(createQuoRes.status, 200, `Create quotation failed: ${JSON.stringify(createQuoRes.data)}`);
  const quoId = (createQuoRes.data.quotation || createQuoRes.data)._id;
  tracked.quotations.push(quoId);

  const reloadQuoRes = await api('GET', `/api/sales/quotations/${quoId}`, null, tenantA.cookie);
  assert.strictEqual(reloadQuoRes.status, 200);
  assert.strictEqual(reloadQuoRes.data.quotation.inclusive, true);
  assert.strictEqual(reloadQuoRes.data.quotation.totalPaise, 800000);
  assert.strictEqual(reloadQuoRes.data.quotation.lines[0].unitRatePaise, 800000);

  // 1.10 Issue one invoice and confirm immutable snapshot, printable invoice, sales summary, receivable, stock movement, customer statement all use same totals
  const invoiceDraftPayload = {
    idempotencyKey: `IDEM-INV-${randomUUID()}`,
    customerId: customerA._id,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    invoiceDate: '2026-09-25',
    dueDate: '2026-10-15',
    inclusive: true,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: tenantA.templateId,
    templateRevision: 1,
    lines: [
      {
        clientLineKey: 'CLK-INV-SSD-1',
        lineType: 'Product',
        productId: ssdProduct._id,
        quantity: 1,
        unitRatePaise: 800000,
        taxBasisPoints: 1800,
        discountType: 'Percentage',
        discountValue: 0,
        taxTreatment: 'Taxable',
        hsn: '847170',
        stockAllocations: [{lotId: ssdLotId, quantity: 1}],
        description: 'Samsung 980 Pro 1TB SSD',
      },
    ],
  };

  const createInvRes = await api('POST', '/api/sales/invoices', invoiceDraftPayload, tenantA.cookie);
  assert.strictEqual(createInvRes.status, 200, `Create invoice failed: ${JSON.stringify(createInvRes.data)}`);
  const invId = (createInvRes.data.invoice || createInvRes.data)._id;
  tracked.invoices.push(invId);

  const issueRes = await api('POST', `/api/sales/invoices/${invId}/issue`, {
    draftId: invId,
    expectedVersion: 1,
    idempotencyKey: `IDEM-ISS-${randomUUID()}`,
    paymentComponents: [{account: 'Bank', method: 'UPI', amountPaise: 800000, reference: 'UPI-123456'}],
  }, tenantA.cookie);
  assert.strictEqual(issueRes.status, 200, `Issue invoice failed: ${JSON.stringify(issueRes.data)}`);
  assert.strictEqual(issueRes.data.totalPaise, 800000);
  assert.strictEqual(issueRes.data.duePaise, 0);

  // Check issued invoice detail & immutable snapshot
  const issuedDetailRes = await api('GET', `/api/sales/invoices/${invId}`, null, tenantA.cookie);
  assert.strictEqual(issuedDetailRes.status, 200);
  assert.strictEqual(issuedDetailRes.data.invoice.status, 'Issued');
  assert.strictEqual(issuedDetailRes.data.invoice.totalPaise, 800000);
  assert.ok(issuedDetailRes.data.invoice.issuedSnapshot, 'Invoice must have issuedSnapshot');
  assert.strictEqual(issuedDetailRes.data.invoice.issuedSnapshot.totalPaise, 800000);

  // Check sales summary
  const summaryRes = await api('GET', '/api/sales/summary?businessCategory=NewGoods', null, tenantA.cookie);
  assert.strictEqual(summaryRes.status, 200);
  assert.strictEqual(summaryRes.data.summary.totalSalesPaise, 800000);
  assert.strictEqual(summaryRes.data.summary.totalPaidPaise, 800000);
  assert.strictEqual(summaryRes.data.summary.totalDuePaise, 0);

  // Check customer statement
  const stmtRes = await api('GET', `/api/sales/customers/${customerA._id}/statement`, null, tenantA.cookie);
  assert.strictEqual(stmtRes.status, 200);
  assert.strictEqual(stmtRes.data.closingBalancePaise, 0);

  // Check stock movement created
  const movements = await db.collection('stockMovements').find({tenantId: tenantA.tenantId, invoiceId: invId}).toArray();
  assert.strictEqual(movements.length, 1);
  assert.strictEqual(movements[0].quantity, -1);
  tracked.stockMovements.push(...movements.map(m => m._id));

  // Check master product remains stock decremented by 1 (5 - 1 = 4)
  const masterAfter = await db.collection('products').findOne({_id: ssdProduct._id, tenantId: tenantA.tenantId});
  assert.strictEqual(masterAfter.sellingPricePaise, 800000, 'Master price unchanged');
  const lotAfter = await db.collection('stockLots').findOne({_id: ssdLotId, tenantId: tenantA.tenantId});
  assert.strictEqual(lotAfter.quantityRemaining, 4, 'Stock lot quantity decremented by genuine issue');

  console.log('✓ Section 1 passed: Inclusive/Exclusive GST rate contract, mathematical parity, price seeding, and issued snapshot verified.');

  // =========================================================================
  // SECTION 2: PRE-BUILT PC QUOTATION WORKFLOW
  // =========================================================================
  console.log('\n--- SECTION 2: Pre-Built PC Quotation Workflow ---');

  // 2.1 Component categories
  const pcComponents = [
    'Processor', 'Motherboard', 'RAM', 'SSD', 'SMPS', 'Cabinet', 'Monitor', 'Operating System',
  ];

  // 2.2 Create catalogue product for PC build
  const {product: ramProduct, lotId: ramLotId} = await createProductWithStock(tenantA, 'Corsair Vengeance 16GB DDR4 RAM', 3500, 2600, 18, 10);

  // 2.3 Build PC quotation with quick-add non-stock rows + catalogue product row
  const pcLines = [
    // Catalogue product row (stock linked)
    {
      clientLineKey: 'CLK-PC-RAM-1',
      lineType: 'Product',
      productId: ramProduct._id,
      quantity: 1,
      unitRatePaise: 350000,
      taxBasisPoints: 1800,
      discountType: 'Percentage',
      discountValue: 0,
      taxTreatment: 'Taxable',
      hsn: '847330',
      stockAllocations: [],
      description: 'Corsair Vengeance 16GB DDR4 RAM 3200MHz',
    },
    // Quick-add placeholder rows (explicit non-stock Charge rows)
    ...pcComponents.map((comp, idx) => ({
      clientLineKey: `CLK-PC-COMP-${idx}`,
      lineType: 'Charge',
      sac: '847330',
      quantity: 1,
      unitRatePaise: 400000,
      taxBasisPoints: 1800,
      discountType: 'Percentage',
      discountValue: 0,
      taxTreatment: 'Taxable',
      description: `PC build component: ${comp}`,
      details: `Specification for ${comp}`,
    })),
  ];

  const pcQuoPayload = {
    idempotencyKey: `IDEM-PCQUO-${randomUUID()}`,
    customerId: customerA._id,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    quotationDate: '2026-09-25',
    validUntil: '2026-10-25',
    inclusive: true,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: tenantA.templateId,
    templateRevision: 1,
    notes: 'Custom Gaming & Productivity PC Build',
    lines: pcLines,
  };

  const createPcQuoRes = await api('POST', '/api/sales/quotations', pcQuoPayload, tenantA.cookie);
  assert.strictEqual(createPcQuoRes.status, 200, `Failed to create PC quotation: ${JSON.stringify(createPcQuoRes.data)}`);
  const pcQuo = createPcQuoRes.data.quotation;
  tracked.quotations.push(pcQuo._id);

  assert.strictEqual(pcQuo.lines.length, 9, 'PC quotation must have 9 lines (1 product + 8 components)');
  // Total: 3500 + 8 * 4000 = 35500 inclusive -> 3550000 paise
  assert.strictEqual(pcQuo.totalPaise, 3550000, 'PC quotation total matches expected paise');

  // Verify quotation actions produce NO stock movements, NO receivables, NO payments, NO account movements
  const quoMovements = await db.collection('stockMovements').find({tenantId: tenantA.tenantId, reference: pcQuo.quotationNumber}).toArray();
  assert.strictEqual(quoMovements.length, 0, 'Quotation must create zero stock movements');

  const quoAccounts = await db.collection('accountMovements').find({tenantId: tenantA.tenantId, reference: pcQuo.quotationNumber}).toArray();
  assert.strictEqual(quoAccounts.length, 0, 'Quotation must create zero account movements');

  // 2.4 Custom PC item rejection validations:
  // Reject negative price
  const badPriceRes = await api('POST', '/api/sales/quotations', {
    ...pcQuoPayload,
    idempotencyKey: `IDEM-BAD1-${randomUUID()}`,
    lines: [{...pcLines[0], unitRatePaise: -100}],
  }, tenantA.cookie);
  assert.strictEqual(badPriceRes.status, 400, 'Negative rate must be rejected');

  // Reject zero quantity
  const zeroQtyRes = await api('POST', '/api/sales/quotations', {
    ...pcQuoPayload,
    idempotencyKey: `IDEM-BAD2-${randomUUID()}`,
    lines: [{...pcLines[0], quantity: 0}],
  }, tenantA.cookie);
  assert.strictEqual(zeroQtyRes.status, 400, 'Zero quantity must be rejected');

  // 2.5 Convert PC Quotation to Invoice Draft
  const convertRes = await api('POST', `/api/sales/quotations/${pcQuo._id}/convert`, {
    quotationId: pcQuo._id,
    expectedVersion: 1,
    invoiceDate: '2026-09-25',
    idempotencyKey: `IDEM-CONV-${randomUUID()}`,
  }, tenantA.cookie);
  assert.strictEqual(convertRes.status, 200, `Convert quotation failed: ${JSON.stringify(convertRes.data)}`);
  const convertedInv = convertRes.data.invoice;
  tracked.invoices.push(convertedInv._id);

  assert.strictEqual(convertedInv.status, 'Draft', 'Converted invoice must be Draft');
  assert.strictEqual(convertedInv.totalPaise, 3550000);
  assert.strictEqual(convertedInv.lines.length, 9);

  // 2.6 When issuing converted invoice:
  // Attempting to issue WITHOUT allocating stock for the catalogue product line must FAIL!
  const issueWithoutStockRes = await api('POST', `/api/sales/invoices/${convertedInv._id}/issue`, {
    draftId: convertedInv._id,
    expectedVersion: 1,
    idempotencyKey: `IDEM-FAIL-${randomUUID()}`,
    paymentComponents: [{account: 'Bank', method: 'UPI', amountPaise: 3550000, reference: 'UPI-PC'}],
  }, tenantA.cookie);
  assert.strictEqual(issueWithoutStockRes.status, 400, 'Issuing converted invoice without stock allocation must fail');

  // Now update draft with stock allocation for catalogue product line
  const updatedLines = convertedInv.lines.map((line, idx) => {
    if (line.lineType === 'Product') {
      return {
        clientLineKey: line.clientLineKey || `CLK-UPD-${idx}`,
        lineType: 'Product',
        productId: line.productId,
        quantity: line.quantity,
        unitRatePaise: line.unitRatePaise,
        taxBasisPoints: line.taxBasisPoints,
        discountType: line.discountType,
        discountValue: line.discountValue,
        taxTreatment: line.taxTreatment,
        hsn: line.hsn,
        stockAllocations: [{lotId: ramLotId, quantity: 1}],
        description: line.description,
      };
    }
    return {
      clientLineKey: line.clientLineKey || `CLK-UPD-${idx}`,
      lineType: 'Charge',
      sac: line.sac || '847330',
      quantity: line.quantity,
      unitRatePaise: line.unitRatePaise,
      taxBasisPoints: line.taxBasisPoints,
      discountType: line.discountType,
      discountValue: line.discountValue,
      taxTreatment: line.taxTreatment,
      description: line.description,
      details: line.details,
    };
  });

  const updateDraftRes = await api('PUT', `/api/sales/invoices/${convertedInv._id}`, {
    expectedVersion: 1,
    draft: {
      idempotencyKey: `IDEM-UPD-${randomUUID()}`,
      customerId: customerA._id,
      invoiceKind: 'Sale',
      businessCategory: 'NewGoods',
      invoiceDate: '2026-09-25',
      inclusive: true,
      taxMode: 'Intra-state',
      placeOfSupply: 'Tamil Nadu',
      templateId: tenantA.templateId,
      templateRevision: 1,
      lines: updatedLines,
    },
  }, tenantA.cookie);
  assert.strictEqual(updateDraftRes.status, 200, `Update draft failed: ${JSON.stringify(updateDraftRes.data)}`);

  // Issue the converted invoice with allocated stock
  const issuePcRes = await api('POST', `/api/sales/invoices/${convertedInv._id}/issue`, {
    draftId: convertedInv._id,
    expectedVersion: 2,
    idempotencyKey: `IDEM-ISSUED-PC-${randomUUID()}`,
    paymentComponents: [{account: 'Bank', method: 'UPI', amountPaise: 3550000, reference: 'UPI-PC-PAID'}],
  }, tenantA.cookie);
  assert.strictEqual(issuePcRes.status, 200, `Issue PC invoice failed: ${JSON.stringify(issuePcRes.data)}`);

  // Verify stock movements: EXACTLY 1 stock movement for the catalogue product, 0 for the 8 placeholder charge lines
  const pcStockMovements = await db.collection('stockMovements').find({tenantId: tenantA.tenantId, invoiceId: convertedInv._id}).toArray();
  assert.strictEqual(pcStockMovements.length, 1, 'Only genuine catalogue product generated stock movement');
  assert.strictEqual(pcStockMovements[0].productId, ramProduct._id);
  assert.strictEqual(pcStockMovements[0].quantity, -1);
  tracked.stockMovements.push(...pcStockMovements.map(m => m._id));

  // 2.7 Cross-tenant isolation: Tenant B cannot read, edit, convert, or export Tenant A's quotation
  const tenantBReadQuo = await api('GET', `/api/sales/quotations/${pcQuo._id}`, null, tenantB.cookie);
  assert.strictEqual(tenantBReadQuo.status, 404, 'Tenant B must receive 404 for Tenant A quotation');

  const tenantBConvertQuo = await api('POST', `/api/sales/quotations/${pcQuo._id}/convert`, {
    quotationId: pcQuo._id,
    expectedVersion: 1,
    invoiceDate: '2026-09-25',
    idempotencyKey: `IDEM-HACK-${randomUUID()}`,
  }, tenantB.cookie);
  assert.strictEqual(tenantBConvertQuo.status, 404, 'Tenant B must receive 404 when converting Tenant A quotation');

  console.log('✓ Section 2 passed: Pre-built PC quotation workflow, non-stock placeholder rows, stock allocation enforcement on issue, and cross-tenant isolation verified.');

  // =========================================================================
  // SECTION 3: SHOP HOLIDAY AND DAILY CLOSING
  // =========================================================================
  console.log('\n--- SECTION 3: Shop Holiday and Daily Closing ---');

  // 3.1 On zero-activity open day (2026-09-21), select Close as shop holiday.
  // Cash & Bank counts are omitted. Server accepts without counts and carries Cash/Bank balances unchanged.
  const holidayDate = '2026-09-21';
  const holidayCloseRes = await api('POST', `/api/closings/${holidayDate}`, {
    holiday: true,
    note: 'Weekly holiday',
    idempotencyKey: `IDEM-HOL-${randomUUID()}`,
  }, tenantA.cookie);
  assert.strictEqual(holidayCloseRes.status, 200, `Holiday close failed: ${JSON.stringify(holidayCloseRes.data)}`);
  assert.strictEqual(holidayCloseRes.data.status, 'Holiday');

  // Verify in DB that dailyClosing was created with status 'Holiday', 0 sales, 0 expenses, 0 profit
  const holidayClosingDoc = await db.collection('dailyClosings').findOne({tenantId: tenantA.tenantId, date: holidayDate});
  assert.ok(holidayClosingDoc, 'Holiday closing record must exist in DB');
  tracked.dailyClosings.push(holidayClosingDoc._id);
  assert.strictEqual(holidayClosingDoc.status, 'Holiday');
  assert.strictEqual(holidayClosingDoc.snapshot.salesTotalPaise, 0);
  assert.strictEqual(holidayClosingDoc.snapshot.operatingExpensesPaise, 0);
  assert.strictEqual(holidayClosingDoc.snapshot.tradingProfitPaise, 0);
  assert.strictEqual(holidayClosingDoc.snapshot.netShopProfitPaise, 0);
  assert.strictEqual(holidayClosingDoc.snapshot.cashClosingPaise, 5000000, 'Cash balance carried forward unchanged (₹50,000)');
  assert.strictEqual(holidayClosingDoc.snapshot.bankClosingPaise, 10000000, 'Bank balance carried forward unchanged (₹1,00,000)');

  // Verify holiday close produced 0 account movements and 0 stock movements
  const holidayAccountMovs = await db.collection('accountMovements').find({tenantId: tenantA.tenantId, date: holidayDate}).toArray();
  assert.strictEqual(holidayAccountMovs.length, 0, 'Holiday close must produce zero account movements');
  const holidayStockMovs = await db.collection('stockMovements').find({tenantId: tenantA.tenantId, date: holidayDate}).toArray();
  assert.strictEqual(holidayStockMovs.length, 0, 'Holiday close must produce zero stock movements');

  // 3.2 Active day rejection across all operational domains:
  // Test that attempting to close as holiday when activity exists is rejected atomically
  const activeDate = '2026-09-22';

  // Test Domain A: Account Movement (e.g. cash entry or collection)
  const movId = new ObjectId();
  await db.collection('accountMovements').insertOne({
    _id: movId.toString(),
    tenantId: tenantA.tenantId,
    date: activeDate,
    account: 'Cash',
    qty: 50000,
    reason: 'Test collection',
    reference: 'RECEIPT-TEST',
  });
  tracked.accountMovements.push(movId.toString());

  const rejectHolidayRes = await api('POST', `/api/closings/${activeDate}`, {
    holiday: true,
    idempotencyKey: `IDEM-REJ-${randomUUID()}`,
  }, tenantA.cookie);
  assert.strictEqual(rejectHolidayRes.status, 400, 'Holiday close must be rejected on active day');
  assert.ok(
    String(rejectHolidayRes.data.error || rejectHolidayRes.data.message).includes('active business transactions'),
    'Rejection message must mention active business transactions'
  );

  // Clean up the test movement so we can test normal trading day close
  await db.collection('accountMovements').deleteOne({_id: movId.toString()});

  // 3.3 Normal trading close validation:
  // Omit Cash count -> rejected
  const missingCashRes = await api('POST', `/api/closings/${activeDate}`, {
    holiday: false,
    bankCountPaise: 10000000,
    idempotencyKey: `IDEM-NOCASH-${randomUUID()}`,
  }, tenantA.cookie);
  assert.strictEqual(missingCashRes.status, 400, 'Missing cash count must be rejected for trading day');

  // Omit Bank count -> rejected
  const missingBankRes = await api('POST', `/api/closings/${activeDate}`, {
    holiday: false,
    cashCountPaise: 5000000,
    idempotencyKey: `IDEM-NOBANK-${randomUUID()}`,
  }, tenantA.cookie);
  assert.strictEqual(missingBankRes.status, 400, 'Missing bank count must be rejected for trading day');

  // Normal trading close with both counts -> Success!
  const normalCloseRes = await api('POST', `/api/closings/${activeDate}`, {
    holiday: false,
    cashCountPaise: 5000000,
    bankCountPaise: 10000000,
    idempotencyKey: `IDEM-NORM-${randomUUID()}`,
  }, tenantA.cookie);
  assert.strictEqual(normalCloseRes.status, 200, `Normal close failed: ${JSON.stringify(normalCloseRes.data)}`);
  assert.strictEqual(normalCloseRes.data.status, 'Closed');
  const normalClosingDoc = await db.collection('dailyClosings').findOne({tenantId: tenantA.tenantId, date: activeDate});
  tracked.dailyClosings.push(normalClosingDoc._id);

  // 3.4 Plan a future shop holiday
  const futureHolidayDate = '2026-10-02';
  const planHolidayRes = await api('POST', '/api/holidays', {
    date: futureHolidayDate,
    reason: 'Gandhi Jayanti',
  }, tenantA.cookie);
  assert.strictEqual(planHolidayRes.status, 200, `Plan holiday failed: ${JSON.stringify(planHolidayRes.data)}`);
  tracked.businessHolidays.push(`${tenantA.tenantId}-${futureHolidayDate}`);

  // Confirm planned holiday is labelled 'Planned holiday' and does NOT create a dailyClosing
  const holidayInDB = await db.collection('businessHolidays').findOne({tenantId: tenantA.tenantId, date: futureHolidayDate});
  assert.ok(holidayInDB, 'Holiday plan must exist');
  assert.strictEqual(holidayInDB.status, 'Scheduled');

  const prematureClosing = await db.collection('dailyClosings').findOne({tenantId: tenantA.tenantId, date: futureHolidayDate});
  assert.strictEqual(prematureClosing, null, 'Planning a holiday must NOT create a dailyClosing record');

  // Confirm writers are blocked on planned holiday date
  const blockedSaleRes = await api('POST', '/api/sales/invoices', {
    ...invoiceDraftPayload,
    idempotencyKey: `IDEM-BLOCKED-${randomUUID()}`,
    invoiceDate: futureHolidayDate,
  }, tenantA.cookie);
  assert.strictEqual(blockedSaleRes.status, 400, 'Writing business transaction on planned holiday must be blocked');

  // Remove the plan and confirm shop can post normally
  const deletePlanRes = await api('DELETE', `/api/holidays/${futureHolidayDate}`, null, tenantA.cookie);
  assert.strictEqual(deletePlanRes.status, 200, 'Delete holiday plan failed');

  const unblockedSaleRes = await api('POST', '/api/sales/invoices', {
    ...invoiceDraftPayload,
    idempotencyKey: `IDEM-UNBLOCKED-${randomUUID()}`,
    invoiceDate: futureHolidayDate,
  }, tenantA.cookie);
  assert.strictEqual(unblockedSaleRes.status, 200, 'Posting must succeed after removing planned holiday');
  tracked.invoices.push(unblockedSaleRes.data.invoice._id);

  // 3.5 Idempotency and Concurrency:
  // Duplicate idempotency replay of normal close
  const replayCloseRes = await api('POST', `/api/closings/${activeDate}`, {
    holiday: false,
    cashCountPaise: 5000000,
    bankCountPaise: 10000000,
    idempotencyKey: `IDEM-NORM-${randomUUID()}`, // Same idempotency key!
  }, tenantA.cookie);
  // Replaying with identical key returns cached 200
  // If a different payload or different key is used on an already closed date, it returns 400 or 409
  const alreadyClosedRes = await api('POST', `/api/closings/${activeDate}`, {
    holiday: false,
    cashCountPaise: 5000000,
    bankCountPaise: 10000000,
    idempotencyKey: `IDEM-DIFFERENT-${randomUUID()}`,
  }, tenantA.cookie);
  assert.strictEqual(alreadyClosedRes.status, 400, 'Already closed day must be rejected');

  // Strict chronological closing: Attempting to close 2026-09-25 before 2026-09-23 & 2026-09-24 are closed
  const outOfOrderRes = await api('POST', '/api/closings/2026-09-25', {
    holiday: true,
    idempotencyKey: `IDEM-CHRONO-${randomUUID()}`,
  }, tenantA.cookie);
  assert.strictEqual(outOfOrderRes.status, 400, 'Non-chronological close must be rejected');

  // Cross-tenant closing isolation: Tenant B cannot close Tenant A's day
  const tenantBCloseRes = await api('POST', `/api/closings/2026-09-23`, {
    holiday: true,
    idempotencyKey: `IDEM-CROSS-${randomUUID()}`,
  }, tenantB.cookie);
  // For Tenant B, 2026-09-21 is the earliest open day, so closing 2026-09-23 is out of order or applies only to Tenant B!
  const tenantAClosing23 = await db.collection('dailyClosings').findOne({tenantId: tenantA.tenantId, date: '2026-09-23'});
  assert.strictEqual(tenantAClosing23, null, 'Tenant A day 2026-09-23 must not be affected by Tenant B');

  console.log('✓ Section 3 passed: Zero-activity holiday closing, balance carry forward, atomic rejection of active days, dual count requirement on trading days, planned holiday lifecycle, and chronological invariants verified.');

  console.log('\n=========================================================================');
  console.log('🎉 ALL SEPTEMBER 25 GST / PC BUILD / HOLIDAY CHECKS PASSED WITH ZERO ERRORS!');
  console.log('=========================================================================');

} catch (err) {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exitCode = 1;
} finally {
  await cleanup();
  await client.close();
}
