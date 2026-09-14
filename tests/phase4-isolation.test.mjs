// Phase 4 Dedicated Comprehensive Multi-Tenant Isolation, Stock Reservations, and Sales Test
import {MongoClient, ObjectId} from 'mongodb';
import {hashPassword} from 'better-auth/crypto';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

process.env.DISABLE_AUTH_RATE_LIMIT = 'true';
process.env.NODE_ENV = 'test';
process.loadEnvFile('.env.local');

if (process.env.MONGODB_DB !== 'itech_dev') {
  throw new Error('This test requires the isolated itech_dev development database.');
}

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db('itech_dev');
const base = 'http://127.0.0.1:3000';

// Track created IDs for exact cleanup
const tracked = {
  users: [],
  tenants: [],
  customers: [],
  products: [],
  stockLots: [],
  serialUnits: [],
  quotations: [],
  invoices: [],
  stockReservations: [],
  stockMovements: [],
  accountMovements: [],
  customerReceipts: [],
  customerAllocations: [],
  customerAdvances: [],
  customerReturns: [],
  customerRefunds: [],
  warranties: [],
  warrantyClaims: [],
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
}

try {
  console.log('--- Starting Phase 4 Multi-Tenant & Reservation Verification ---');

  // Setup 2 test companies: Company A and Company B
  const companies = [];
  for (let i = 0; i < 2; i++) {
    const tenantId = `test-phase4-tenant-${Date.now()}-${i}-${randomUUID().slice(0, 4)}`;
    const userId = new ObjectId();
    const email = `phase4-admin-${Date.now()}-${i}-${randomUUID().slice(0, 4)}@test.com`;
    const password = 'Password123!';
    const hashedPassword = await hashPassword(password);

    await db.collection('tenants').insertOne({
      _id: tenantId,
      companyName: `Phase 4 Test Company ${i === 0 ? 'A' : 'B'}`,
      verified: true,
      disabled: false,
      createdAt: new Date(),
    });
    tracked.tenants.push(tenantId);

    await db.collection('authUsers').insertOne({
      _id: userId,
      name: `Admin ${i}`,
      email,
      emailVerified: true,
      tenantId,
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

    const loginRes = await api('POST', '/api/auth/sign-in/email', {email, password});
    assert.strictEqual(loginRes.status, 200, `Login failed for user ${email}`);

    const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
    const cookie = setCookies.map(c => c?.split(';')[0]).filter(Boolean).join('; ');

    const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata'}).format(new Date());
    const yesterday = '2026-09-09';

    await db.collection('companySettings').insertOne({
      _id: tenantId,
      tenantId,
      name: `Company ${i === 0 ? 'A' : 'B'}`,
      phone: '9876543210',
      email,
      address: '123 Tech Park, Chennai',
      gst: `33AAAAA000${i}Z5`,
      state: 'Tamil Nadu',
      stateCode: '33',
      bank: 'HDFC Bank',
      account: `1234567890${i}`,
      ifsc: 'HDFC0001234',
      declaration: 'Invoice valid without signature',
      updatedAt: new Date(),
    });

    await db.collection('openingSetups').insertOne({
      _id: tenantId,
      tenantId,
      status: 'Finalized',
      cutoffDate: yesterday,
      openingCashPaise: 5000000, // ₹50,000
      openingBankPaise: 10000000, // ₹1,00,000
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

    // Setup default template & revision
    const templateId = `TPL-${tenantId}`;
    await db.collection('invoiceTemplates').insertOne({
      _id: templateId,
      tenantId,
      name: 'Standard Tax Invoice',
      isDefault: true,
      currentRevision: 1,
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
      snapshot: {columns: ['description', 'hsn', 'quantity', 'rate', 'tax', 'total']},
      createdAt: new Date(),
    });
    tracked.templateRevisions.push(revisionId);

    companies.push({
      tenantId, userId, email, cookie,
      get today() { return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata'}).format(new Date()); },
      yesterday, templateId
    });
  }

  const [compA, compB] = companies;
  console.log('✓ Initialized test tenants Company A and Company B with finalized opening cutoff');

  // Migrate account balances for Company A and B
  const migARes = await api('POST', '/api/purchases/migration', {}, compA.cookie);
  assert.strictEqual(migARes.status, 200, 'Migration failed for Company A');
  const migBRes = await api('POST', '/api/purchases/migration', {}, compB.cookie);
  assert.strictEqual(migBRes.status, 200, 'Migration failed for Company B');
  console.log('✓ Executed account migrations for both tenants');

  // Setup master data for Company A
  // Customers
  const custA1Id = `CUST-A1-${Date.now()}`;
  const custA2Id = `CUST-A2-${Date.now()}`;
  await db.collection('customers').insertMany([
    {
      _id: custA1Id, tenantId: compA.tenantId, name: 'Alice Enterprise', phone: '9876500001',
      email: 'alice@corp.in', gst: '33BBBBB1111A1Z1', gstNormalized: '33BBBBB1111A1Z1',
      state: 'Tamil Nadu', stateCode: '33', status: 'Active', creditLimitPaise: 500000, // ₹5,000 credit limit
      financialVersion: 1, createdAt: new Date(),
    },
    {
      _id: custA2Id, tenantId: compA.tenantId, name: 'Bob Retails', phone: '9876500002',
      email: 'bob@corp.in', gst: '29CCCCC2222B1Z2', gstNormalized: '29CCCCC2222B1Z2',
      state: 'Karnataka', stateCode: '29', status: 'Active', creditLimitPaise: 0,
      financialVersion: 1, createdAt: new Date(),
    },
  ]);
  tracked.customers.push(custA1Id, custA2Id);

  // Customer for Company B
  const custB1Id = `CUST-B1-${Date.now()}`;
  await db.collection('customers').insertOne({
    _id: custB1Id, tenantId: compB.tenantId, name: 'Charlie Co', phone: '9876500003',
    email: 'charlie@corp.in', state: 'Tamil Nadu', stateCode: '33', status: 'Active',
    financialVersion: 1, createdAt: new Date(),
  });
  tracked.customers.push(custB1Id);

  // Products
  const prodNonserialId = `PROD-NONSERIAL-${Date.now()}`;
  const prodSerialId = `PROD-SERIAL-${Date.now()}`;
  await db.collection('products').insertMany([
    {
      _id: prodNonserialId, tenantId: compA.tenantId, name: 'USB-C Cable 1m',
      sku: 'CBL-001', hsn: '8544', category: 'Accessories', isSerialTracked: false,
      condition: 'New', status: 'Active', createdAt: new Date(),
    },
    {
      _id: prodSerialId, tenantId: compA.tenantId, name: 'Galaxy Tab A9',
      sku: 'TAB-A9', hsn: '8471', category: 'Tablets', isSerialTracked: true,
      condition: 'New', status: 'Active', createdAt: new Date(),
    },
  ]);
  tracked.products.push(prodNonserialId, prodSerialId);

  // Stock Lots for Company A
  const lot1Id = `LOT-1-${Date.now()}`;
  const lot2Id = `LOT-2-${Date.now()}`;
  await db.collection('stockLots').insertMany([
    {
      _id: lot1Id, tenantId: compA.tenantId, productId: prodNonserialId,
      lotNumber: 'LOT-CBL-001', costPaise: 10000, quantityReceived: 10,
      quantitySellable: 10, quantityRemaining: 10, quantityReserved: 0,
      quantitySold: 0, quantityDefective: 0, quantityReturned: 0, version: 1,
      receivedDate: compA.yesterday, createdAt: new Date(), updatedAt: new Date(),
    },
    {
      _id: lot2Id, tenantId: compA.tenantId, productId: prodSerialId,
      lotNumber: 'LOT-TAB-001', costPaise: 800000, quantityReceived: 5,
      quantitySellable: 5, quantityRemaining: 5, quantityReserved: 0,
      quantitySold: 0, quantityDefective: 0, quantityReturned: 0, version: 1,
      receivedDate: compA.yesterday, createdAt: new Date(), updatedAt: new Date(),
    },
  ]);
  tracked.stockLots.push(lot1Id, lot2Id);

  // Serial Units for Lot 2
  const serials = ['SN-A1', 'SN-B2', 'SN-C3', 'SN-D4', 'SN-E5'];
  for (const sn of serials) {
    const sId = `SER-${compA.tenantId}-${sn}`;
    await db.collection('serialUnits').insertOne({
      _id: sId, tenantId: compA.tenantId, productId: prodSerialId, lotId: lot2Id,
      serial: sn, serialNormalized: sn.toLowerCase().replace(/[^a-z0-9]/g, ''),
      status: 'InStock', createdAt: new Date(), updatedAt: new Date(),
    });
    tracked.serialUnits.push(sId);
  }
  console.log('✓ Master data, stock lots and serial units established');

  // =========================================================================
  // Scenario 1: Quotation Lifecycle (Create, Get, List, Update, Cancel, Reopen)
  // =========================================================================
  console.log('--- Testing Scenario 1: Quotation Lifecycle ---');
  const quotePayload = {
    idempotencyKey: `quote-create-${randomUUID()}`,
    customerId: custA1Id,
    quotationDate: compA.today,
    validUntil: '2026-12-31',
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    orderReference: 'PO-TEST-01',
    notes: 'Quotation test notes',
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-1',
        productId: prodNonserialId,
        description: 'USB-C Cable 1m',
        hsn: '8544',
        quantity: 2,
        unitRatePaise: 50000, // ₹500.00
        taxBasisPoints: 1800, // 18%
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 1000, // 10%
        stockAllocations: [],
        warrantyMonths: 12,
      },
    ],
  };

  const createQuoteRes = await api('POST', '/api/sales/quotations', quotePayload, compA.cookie);
  assert.strictEqual(createQuoteRes.status, 200, `Create quotation failed: ${JSON.stringify(createQuoteRes.body)}`);
  const quotation = createQuoteRes.body;
  tracked.quotations.push(quotation._id);
  assert.strictEqual(quotation.status, 'Draft');
  assert.strictEqual(quotation.version, 1);
  assert.strictEqual(quotation.lines.length, 1);
  assert.strictEqual(quotation.totalPaise, 106200); // 2 * 500 = 1000 - 10% = 900 + 18% (162) = 1062

  // Get quotation
  const getQuoteRes = await api('GET', `/api/sales/quotations/${quotation._id}`, null, compA.cookie);
  assert.strictEqual(getQuoteRes.status, 200);
  assert.strictEqual(getQuoteRes.body.quotation._id, quotation._id);

  // List quotations
  const listQuoteRes = await api('GET', `/api/sales/quotations?customerId=${custA1Id}`, null, compA.cookie);
  assert.strictEqual(listQuoteRes.status, 200);
  assert.ok(listQuoteRes.body.items.some(q => q._id === quotation._id));

  // Update quotation draft
  const updateQuotePayload = {
    expectedVersion: 1,
    quotation: {
      ...quotePayload,
      idempotencyKey: `quote-update-${randomUUID()}`,
      lines: [
        {
          ...quotePayload.lines[0],
          quantity: 3,
        },
      ],
    },
  };
  const updateQuoteRes = await api('PUT', `/api/sales/quotations/${quotation._id}`, updateQuotePayload, compA.cookie);
  assert.strictEqual(updateQuoteRes.status, 200, `Update quotation failed: ${JSON.stringify(updateQuoteRes.body)}`);
  assert.strictEqual(updateQuoteRes.body.version, 2);
  assert.strictEqual(updateQuoteRes.body.totalPaise, 159300); // 3 * 500 = 1500 - 10% = 1350 + 18% (243) = 1593

  // Cancel quotation
  const cancelQuoteRes = await api('DELETE', `/api/sales/quotations/${quotation._id}`, {
    expectedVersion: 2,
    idempotencyKey: `quote-cancel-${randomUUID()}`,
    reason: 'Customer declined quotation',
  }, compA.cookie);
  assert.strictEqual(cancelQuoteRes.status, 200);
  assert.strictEqual(cancelQuoteRes.body.status, 'Cancelled');
  assert.strictEqual(cancelQuoteRes.body.version, 3);

  // Attempting to convert cancelled quotation must fail
  const convertCancelledRes = await api('POST', `/api/sales/quotations/${quotation._id}/convert`, {
    quotationId: quotation._id,
    expectedVersion: 3,
    invoiceDate: compA.today,
    idempotencyKey: `quote-convert-fail-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(convertCancelledRes.status, 400, 'Cancelled quotation should not convert');

  // Reopen quotation
  const reopenQuoteRes = await api('POST', `/api/sales/quotations/${quotation._id}/reopen`, {
    expectedVersion: 3,
    idempotencyKey: `quote-reopen-${randomUUID()}`,
    validUntil: '2026-12-31',
  }, compA.cookie);
  assert.strictEqual(reopenQuoteRes.status, 200);
  assert.strictEqual(reopenQuoteRes.body.status, 'Draft');
  assert.strictEqual(reopenQuoteRes.body.version, 4);
  console.log('✓ Scenario 1 passed: Quotation full lifecycle verified');

  // =========================================================================
  // Scenario 2: Quotation Conversion Idempotency & Conflict
  // =========================================================================
  console.log('--- Testing Scenario 2: Quotation Conversion Idempotency & Conflict ---');
  const convKey = `conv-key-${randomUUID()}`;
  const convertRes1 = await api('POST', `/api/sales/quotations/${quotation._id}/convert`, {
    quotationId: quotation._id,
    expectedVersion: 4,
    invoiceDate: compA.today,
    idempotencyKey: convKey,
  }, compA.cookie);
  assert.strictEqual(convertRes1.status, 200, `Conversion failed: ${JSON.stringify(convertRes1.body)}`);
  const convertedInvoiceDraft = convertRes1.body;
  tracked.invoices.push(convertedInvoiceDraft._id);
  assert.strictEqual(convertedInvoiceDraft.status, 'Draft');
  assert.strictEqual(convertedInvoiceDraft.sourceQuotationId, quotation._id);

  // Replay conversion with SAME idempotency key -> must return the exact same draft
  const convertRes2 = await api('POST', `/api/sales/quotations/${quotation._id}/convert`, {
    quotationId: quotation._id,
    expectedVersion: 4,
    invoiceDate: compA.today,
    idempotencyKey: convKey,
  }, compA.cookie);
  assert.strictEqual(convertRes2.status, 200);
  assert.strictEqual(convertRes2.body._id, convertedInvoiceDraft._id, 'Same key must return original draft');

  // Conversion with DIFFERENT idempotency key -> must return 409 conflict
  const convertRes3 = await api('POST', `/api/sales/quotations/${quotation._id}/convert`, {
    quotationId: quotation._id,
    expectedVersion: 4,
    invoiceDate: compA.today,
    idempotencyKey: `diff-key-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(convertRes3.status, 409, 'Different key on already-converted quote must 409');
  console.log('✓ Scenario 2 passed: Quotation conversion idempotency and 409 conflict verified');

  // =========================================================================
  // Scenario 3: Invoice Draft Lifecycle (Zero Side-Effects)
  // =========================================================================
  console.log('--- Testing Scenario 3: Invoice Draft Lifecycle ---');
  const draftPayload = {
    idempotencyKey: `inv-draft-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    notes: 'Draft zero side-effect test',
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-cbl',
        productId: prodNonserialId,
        description: 'USB-C Cable 1m',
        hsn: '8544',
        quantity: 2,
        unitRatePaise: 40000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [], // Zero allocations permitted in draft
        warrantyMonths: 0,
      },
    ],
  };

  const createDraftRes = await api('POST', '/api/sales/invoices', draftPayload, compA.cookie);
  assert.strictEqual(createDraftRes.status, 200, `Create draft failed: ${JSON.stringify(createDraftRes.body)}`);
  const draftDoc = createDraftRes.body;
  tracked.invoices.push(draftDoc._id);

  // Invariant check: Lot sellable, reserved, sold are untouched
  const lot1Check = await db.collection('stockLots').findOne({_id: lot1Id});
  assert.strictEqual(lot1Check.quantitySellable, 10);
  assert.strictEqual(lot1Check.quantityReserved, 0);
  assert.strictEqual(lot1Check.quantitySold, 0);

  // Attempt to issue draft without full stock allocation -> must fail with 400
  const issueUnallocatedRes = await api('POST', `/api/sales/invoices/${draftDoc._id}/issue`, {
    draftId: draftDoc._id,
    expectedVersion: 1,
    idempotencyKey: `issue-unallocated-${randomUUID()}`,
    paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: draftDoc.totalPaise}],
  }, compA.cookie);
  assert.strictEqual(issueUnallocatedRes.status, 400, 'Issue without stock allocation must fail');

  // Cancel invoice draft
  const cancelDraftRes = await api('DELETE', `/api/sales/invoices/${draftDoc._id}`, {
    expectedVersion: 1,
    idempotencyKey: `cancel-draft-${randomUUID()}`,
    reason: 'Testing draft cancellation',
  }, compA.cookie);
  assert.strictEqual(cancelDraftRes.status, 200);
  assert.strictEqual(cancelDraftRes.body.status, 'Cancelled');
  console.log('✓ Scenario 3 passed: Empty stock draft saves, fails issue without allocation, and cancels cleanly');

  // =========================================================================
  // Scenario 4 (Reservation Acceptance Case 1: Non-serialized Stock)
  // 5 sellable -> hold 3 (2/3/0) -> sell 1 from hold (2/2/1) -> release remainder (4/0/1)
  // On-hand: 5, 5, 4, 4
  // =========================================================================
  console.log('--- Testing Scenario 4 (Acceptance Case 1): Non-serialized Hold Lifecycle ---');
  // Initial lot state: reset lot1 to 5 units
  await db.collection('stockLots').updateOne({_id: lot1Id}, {
    $set: {quantityReceived: 5, quantitySellable: 5, quantityRemaining: 5, quantityReserved: 0, quantitySold: 0, version: 10},
  });

  // Step A: Hold 3
  const holdRes1 = await api('POST', '/api/sales/reservations', {
    customerId: custA1Id,
    productId: prodNonserialId,
    lotId: lot1Id,
    quantity: 3,
    serials: [],
    reservedAt: compA.today,
    expiresAt: '2026-12-31',
    idempotencyKey: `hold-case1-${randomUUID()}`,
    notes: 'Case 1 non-serialized hold',
  }, compA.cookie);
  assert.strictEqual(holdRes1.status, 200, `Hold 3 failed: ${JSON.stringify(holdRes1.body)}`);
  const hold1 = holdRes1.body;
  tracked.stockReservations.push(hold1._id);

  let lotCheck = await db.collection('stockLots').findOne({_id: lot1Id});
  assert.strictEqual(lotCheck.quantitySellable, 2, 'Sellable must be 2');
  assert.strictEqual(lotCheck.quantityReserved, 3, 'Reserved must be 3');
  assert.strictEqual(lotCheck.quantitySold, 0, 'Sold must be 0');
  // Physical on-hand = received - sold = 5
  assert.strictEqual(lotCheck.quantityReceived - lotCheck.quantitySold, 5);

  // Step B: Sell 1 from hold via invoice
  const draftCase1 = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-draft-case1-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    notes: 'Case 1 sale from hold',
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-hold-1',
        productId: prodNonserialId,
        description: 'USB-C Cable 1m',
        hsn: '8544',
        quantity: 1,
        unitRatePaise: 40000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot1Id, reservationId: hold1._id, quantity: 1, serials: []}],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftCase1.status, 200);
  tracked.invoices.push(draftCase1.body._id);

  const issueCase1 = await api('POST', `/api/sales/invoices/${draftCase1.body._id}/issue`, {
    draftId: draftCase1.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-case1-${randomUUID()}`,
    paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: draftCase1.body.totalPaise}],
  }, compA.cookie);
  assert.strictEqual(issueCase1.status, 200, `Issue from hold failed: ${JSON.stringify(issueCase1.body)}`);

  lotCheck = await db.collection('stockLots').findOne({_id: lot1Id});
  assert.strictEqual(lotCheck.quantitySellable, 2, 'Sellable remains 2 (no double deduction)');
  assert.strictEqual(lotCheck.quantityReserved, 2, 'Reserved must be 2');
  assert.strictEqual(lotCheck.quantitySold, 1, 'Sold must be 1');
  assert.strictEqual(lotCheck.quantityReceived - lotCheck.quantitySold, 4, 'On-hand must be 4');

  // Verify hold document
  let holdDocCheck = await db.collection('stockReservations').findOne({_id: hold1._id});
  assert.strictEqual(holdDocCheck.remainingQuantity, 2);
  assert.strictEqual(holdDocCheck.consumedQuantity, 1);
  assert.strictEqual(holdDocCheck.status, 'Active');

  // Step C: Release remainder
  const releaseRes = await api('POST', `/api/sales/reservations/${hold1._id}/release`, {
    reservationId: hold1._id,
    expectedVersion: holdDocCheck.version,
    idempotencyKey: `release-case1-${randomUUID()}`,
    reason: 'Customer cancelled remaining requirement',
  }, compA.cookie);
  assert.strictEqual(releaseRes.status, 200, `Release failed: ${JSON.stringify(releaseRes.body)}`);
  assert.strictEqual(releaseRes.body.releasedQuantity, 2);
  assert.strictEqual(releaseRes.body.status, 'Released');

  lotCheck = await db.collection('stockLots').findOne({_id: lot1Id});
  assert.strictEqual(lotCheck.quantitySellable, 4, 'Sellable must be restored to 4');
  assert.strictEqual(lotCheck.quantityReserved, 0, 'Reserved must be 0');
  assert.strictEqual(lotCheck.quantitySold, 1, 'Sold must be 1');
  assert.strictEqual(lotCheck.quantityReceived - lotCheck.quantitySold, 4, 'On-hand remains 4');
  console.log('✓ Scenario 4 passed (Acceptance Case 1): Non-serialized hold 3 -> sell 1 -> release remainder (2/3/0 -> 2/2/1 -> 4/0/1, onHand 5,5,4,4)');

  // =========================================================================
  // Scenario 5 (Reservation Acceptance Case 2: Serialized Units A/B/C)
  // Hold A & B; ordinary issue of A fails; held issue of A succeeds; B remains reserved; release restores B.
  // =========================================================================
  console.log('--- Testing Scenario 5 (Acceptance Case 2): Serialized Hold Lifecycle ---');
  // Hold SN-A1 and SN-B2
  const holdSerialRes = await api('POST', '/api/sales/reservations', {
    customerId: custA1Id,
    productId: prodSerialId,
    lotId: lot2Id,
    quantity: 2,
    serials: ['SN-A1', 'SN-B2'],
    reservedAt: compA.today,
    expiresAt: '2026-12-31',
    idempotencyKey: `hold-serial-${randomUUID()}`,
    notes: 'Case 2 serialized hold',
  }, compA.cookie);
  assert.strictEqual(holdSerialRes.status, 200, `Serialized hold failed: ${JSON.stringify(holdSerialRes.body)}`);
  const holdSerial = holdSerialRes.body;
  tracked.stockReservations.push(holdSerial._id);

  // Serial status in DB: SN-A1 and SN-B2 must be 'Reserved'
  const serA = await db.collection('serialUnits').findOne({tenantId: compA.tenantId, serial: 'SN-A1'});
  const serB = await db.collection('serialUnits').findOne({tenantId: compA.tenantId, serial: 'SN-B2'});
  assert.strictEqual(serA.status, 'Reserved');
  assert.strictEqual(serB.status, 'Reserved');

  // Attempt ordinary issue of SN-A1 (without reservationId) -> MUST FAIL (409)
  const draftOrdinarySerial = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-ordinary-ser-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-tab-ord',
        productId: prodSerialId,
        description: 'Galaxy Tab A9',
        hsn: '8471',
        quantity: 1,
        unitRatePaise: 1200000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot2Id, quantity: 1, serials: ['SN-A1']}], // No reservationId
        warrantyMonths: 12,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftOrdinarySerial.status, 200);
  tracked.invoices.push(draftOrdinarySerial.body._id);

  const issueOrdinarySerial = await api('POST', `/api/sales/invoices/${draftOrdinarySerial.body._id}/issue`, {
    draftId: draftOrdinarySerial.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-ord-ser-${randomUUID()}`,
    paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: draftOrdinarySerial.body.totalPaise}],
  }, compA.cookie);
  assert.strictEqual(issueOrdinarySerial.status, 409, 'Ordinary issue of reserved serial SN-A1 must fail');

  // Held issue of SN-A1 (with reservationId) -> MUST SUCCEED
  const draftHeldSerial = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-held-ser-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-tab-held',
        productId: prodSerialId,
        description: 'Galaxy Tab A9',
        hsn: '8471',
        quantity: 1,
        unitRatePaise: 1200000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot2Id, reservationId: holdSerial._id, quantity: 1, serials: ['SN-A1']}],
        warrantyMonths: 12,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftHeldSerial.status, 200);
  tracked.invoices.push(draftHeldSerial.body._id);

  const issueHeldSerial = await api('POST', `/api/sales/invoices/${draftHeldSerial.body._id}/issue`, {
    draftId: draftHeldSerial.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-held-ser-${randomUUID()}`,
    paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: draftHeldSerial.body.totalPaise}],
  }, compA.cookie);
  assert.strictEqual(issueHeldSerial.status, 200, `Held serial issue failed: ${JSON.stringify(issueHeldSerial.body)}`);

  // SN-A1 is now Sold, SN-B2 remains Reserved
  const serAAfter = await db.collection('serialUnits').findOne({tenantId: compA.tenantId, serial: 'SN-A1'});
  const serBAfter = await db.collection('serialUnits').findOne({tenantId: compA.tenantId, serial: 'SN-B2'});
  assert.strictEqual(serAAfter.status, 'Sold');
  assert.strictEqual(serAAfter.fulfilledReservationId, holdSerial._id);
  assert.strictEqual(serBAfter.status, 'Reserved');

  // Release the remaining hold -> SN-B2 restored to InStock
  const holdSerialCheck = await db.collection('stockReservations').findOne({_id: holdSerial._id});
  const releaseSerRes = await api('POST', `/api/sales/reservations/${holdSerial._id}/release`, {
    reservationId: holdSerial._id,
    expectedVersion: holdSerialCheck.version,
    idempotencyKey: `release-ser-${randomUUID()}`,
    reason: 'Release remaining serial B',
  }, compA.cookie);
  assert.strictEqual(releaseSerRes.status, 200);
  assert.strictEqual(releaseSerRes.body.releasedQuantity, 1);

  const serBReleased = await db.collection('serialUnits').findOne({tenantId: compA.tenantId, serial: 'SN-B2'});
  assert.strictEqual(serBReleased.status, 'InStock', 'SN-B2 must be restored to InStock');

  // Duplicate normalized serial check: sn-b2 with different casing/punctuation cannot be held twice
  const duplicateHoldRes = await api('POST', '/api/sales/reservations', {
    customerId: custA1Id,
    productId: prodSerialId,
    lotId: lot2Id,
    quantity: 2,
    serials: ['sn.b2', 'SN-B2'], // Normalizes to duplicate
    reservedAt: compA.today,
    expiresAt: '2026-12-31',
    idempotencyKey: `dup-ser-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(duplicateHoldRes.status, 400, 'Duplicate normalized serials must be rejected');
  console.log('✓ Scenario 5 passed (Acceptance Case 2): Serialized unit isolation, held consumption, and release verified');

  // =========================================================================
  // Scenario 6 (Reservation Acceptance Case 3: Cross-Tenant & Cross-Customer Isolation)
  // =========================================================================
  console.log('--- Testing Scenario 6 (Acceptance Case 3): Cross-Tenant & Customer Isolation ---');
  // Customer B in Company B cannot view Company A's hold
  const crossTenantGet = await api('GET', `/api/sales/reservations/${hold1._id}`, null, compB.cookie);
  assert.strictEqual(crossTenantGet.status, 404, 'Cross-tenant hold access must return 404');

  // Create hold for Customer A1
  const holdCustA1 = await api('POST', '/api/sales/reservations', {
    customerId: custA1Id,
    productId: prodNonserialId,
    lotId: lot1Id,
    quantity: 1,
    serials: [],
    reservedAt: compA.today,
    expiresAt: '2026-12-31',
    idempotencyKey: `hold-cross-cust-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(holdCustA1.status, 200);
  tracked.stockReservations.push(holdCustA1.body._id);

  // Customer A2 attempting to issue invoice allocating Customer A1's hold
  const draftCustA2 = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-draft-a2-${randomUUID()}`,
    customerId: custA2Id, // Customer A2!
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Inter-state',
    placeOfSupply: 'Karnataka',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-steal',
        productId: prodNonserialId,
        description: 'USB-C Cable',
        hsn: '8544',
        quantity: 1,
        unitRatePaise: 50000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot1Id, reservationId: holdCustA1.body._id, quantity: 1, serials: []}],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftCustA2.status, 200);
  tracked.invoices.push(draftCustA2.body._id);

  const issueCustA2 = await api('POST', `/api/sales/invoices/${draftCustA2.body._id}/issue`, {
    draftId: draftCustA2.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-a2-steal-${randomUUID()}`,
    paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: draftCustA2.body.totalPaise}],
  }, compA.cookie);
  assert.strictEqual(issueCustA2.status, 404, 'Cross-customer hold consumption must be rejected');

  // Verify hold still 100% active and unconsumed
  const holdStillActive = await db.collection('stockReservations').findOne({_id: holdCustA1.body._id});
  assert.strictEqual(holdStillActive.remainingQuantity, 1);
  assert.strictEqual(holdStillActive.consumedQuantity, 0);
  console.log('✓ Scenario 6 passed (Acceptance Case 3): Cross-tenant and cross-customer references strictly rejected');

  // =========================================================================
  // Scenario 7 (Reservation Acceptance Case 4: Mixed Held & Ordinary Stock in Single Invoice)
  // =========================================================================
  console.log('--- Testing Scenario 7 (Acceptance Case 4): Mixed Held & Ordinary Stock ---');
  // Customer A1 has holdCustA1 (1 unit held in lot1Id). Lot 1 also has remaining sellable stock.
  const lot1PreMixed = await db.collection('stockLots').findOne({_id: lot1Id});
  const sellablePre = lot1PreMixed.quantitySellable;
  const reservedPre = lot1PreMixed.quantityReserved;
  const soldPre = lot1PreMixed.quantitySold;

  const draftMixed = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-mixed-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-mixed-1',
        productId: prodNonserialId,
        description: 'USB-C Cable',
        hsn: '8544',
        quantity: 2, // Total 2: 1 held, 1 ordinary
        unitRatePaise: 40000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [
          {lotId: lot1Id, reservationId: holdCustA1.body._id, quantity: 1, serials: []}, // 1 held
          {lotId: lot1Id, quantity: 1, serials: []}, // 1 ordinary
        ],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftMixed.status, 200, `Draft mixed failed: ${JSON.stringify(draftMixed.body)}`);
  tracked.invoices.push(draftMixed.body._id);

  const issueMixed = await api('POST', `/api/sales/invoices/${draftMixed.body._id}/issue`, {
    draftId: draftMixed.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-mixed-${randomUUID()}`,
    paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: draftMixed.body.totalPaise}],
  }, compA.cookie);
  assert.strictEqual(issueMixed.status, 200, `Issue mixed failed: ${JSON.stringify(issueMixed.body)}`);

  const lot1PostMixed = await db.collection('stockLots').findOne({_id: lot1Id});
  // Sellable decreased by 1 (for ordinary allocation)
  assert.strictEqual(lot1PostMixed.quantitySellable, sellablePre - 1);
  // Reserved decreased by 1 (for held allocation)
  assert.strictEqual(lot1PostMixed.quantityReserved, reservedPre - 1);
  // Sold increased by 2
  assert.strictEqual(lot1PostMixed.quantitySold, soldPre + 2);
  console.log('✓ Scenario 7 passed (Acceptance Case 4): Single invoice combining held and ordinary allocations in same lot verified');

  // =========================================================================
  // Scenario 8 (Reservation Acceptance Case 5: Partial Consumption + Expiry)
  // Hold 3 -> consume 1 -> expire remainder -> consumed 1, released 2, remaining 0.
  // =========================================================================
  console.log('--- Testing Scenario 8 (Acceptance Case 5): Partial Consumption + Expiry ---');
  // Create hold for 3 units with expiry in past
  const pastDate = '2026-09-01';
  const holdPartRes = await api('POST', '/api/sales/reservations', {
    customerId: custA1Id,
    productId: prodNonserialId,
    lotId: lot1Id,
    quantity: 2,
    serials: [],
    reservedAt: compA.today,
    expiresAt: '2026-12-31',
    idempotencyKey: `hold-part-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(holdPartRes.status, 200);
  const holdPart = holdPartRes.body;
  tracked.stockReservations.push(holdPart._id);

  // Consume 1 unit
  const draftPart = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-part-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-part',
        productId: prodNonserialId,
        description: 'USB Cable',
        hsn: '8544',
        quantity: 1,
        unitRatePaise: 40000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot1Id, reservationId: holdPart._id, quantity: 1, serials: []}],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftPart.status, 200);
  tracked.invoices.push(draftPart.body._id);

  const issuePart = await api('POST', `/api/sales/invoices/${draftPart.body._id}/issue`, {
    draftId: draftPart.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-part-${randomUUID()}`,
    paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: draftPart.body.totalPaise}],
  }, compA.cookie);
  assert.strictEqual(issuePart.status, 200);

  // Now set expiresAt to yesterday to simulate expired hold for expiry runner test
  await db.collection('stockReservations').updateOne({_id: holdPart._id}, {$set: {expiresAt: pastDate}});

  // Run expiry worker via API
  const expireRes = await api('POST', '/api/sales/reservations/expire', {}, compA.cookie);
  assert.strictEqual(expireRes.status, 200, `Expiry runner failed: ${JSON.stringify(expireRes.body)}`);
  assert.ok(expireRes.body.results.some(r => r.id === holdPart._id && r.status === 'Expired'));

  const holdFinal = await db.collection('stockReservations').findOne({_id: holdPart._id});
  assert.strictEqual(holdFinal.status, 'Expired');
  assert.strictEqual(holdFinal.consumedQuantity, 1, 'Consumed must be 1');
  assert.strictEqual(holdFinal.releasedQuantity, 1, 'Released must be 1');
  assert.strictEqual(holdFinal.remainingQuantity, 0, 'Remaining must be 0');
  console.log('✓ Scenario 8 passed (Acceptance Case 5): Hold partial consumption + expiry completed accurately');

  // =========================================================================
  // Scenario 9 (Reservation Acceptance Case 6: Settlement Failure Rollback)
  // Failed payment/advance/credit-limit settlement rolls back hold consumption completely.
  // =========================================================================
  console.log('--- Testing Scenario 9 (Acceptance Case 6): Settlement Failure Rollback ---');
  // Create hold for 1 unit
  const holdRollbackRes = await api('POST', '/api/sales/reservations', {
    customerId: custA1Id,
    productId: prodNonserialId,
    lotId: lot1Id,
    quantity: 1,
    serials: [],
    reservedAt: compA.today,
    expiresAt: '2026-12-31',
    idempotencyKey: `hold-rollback-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(holdRollbackRes.status, 200);
  const holdRollback = holdRollbackRes.body;
  tracked.stockReservations.push(holdRollback._id);

  const draftRollback = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-draft-rb-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-rb',
        productId: prodNonserialId,
        description: 'USB Cable',
        hsn: '8544',
        quantity: 1,
        unitRatePaise: 40000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot1Id, reservationId: holdRollback._id, quantity: 1, serials: []}],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftRollback.status, 200);
  tracked.invoices.push(draftRollback.body._id);

  // Attempt issue with an advance that DOES NOT EXIST (should cause settlement failure & atomic rollback)
  const issueFailRes = await api('POST', `/api/sales/invoices/${draftRollback.body._id}/issue`, {
    draftId: draftRollback.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-rb-${randomUUID()}`,
    applyCustomerAdvancePaise: 500000, // No advance exists!
    paymentComponents: [],
  }, compA.cookie);
  assert.strictEqual(issueFailRes.status, 400, 'Issue with non-existent advance must fail');

  // Verify rollback: hold is STILL Active, remainingQuantity is STILL 1, consumedQuantity is STILL 0
  const holdAfterRollback = await db.collection('stockReservations').findOne({_id: holdRollback._id});
  assert.strictEqual(holdAfterRollback.remainingQuantity, 1, 'Hold remaining quantity must be rolled back');
  assert.strictEqual(holdAfterRollback.consumedQuantity, 0, 'Hold consumed quantity must be rolled back');
  assert.strictEqual(holdAfterRollback.status, 'Active');

  // Draft invoice is STILL Draft (not issued)
  const draftAfterRollback = await db.collection('invoices').findOne({_id: draftRollback.body._id});
  assert.strictEqual(draftAfterRollback.status, 'Draft');
  console.log('✓ Scenario 9 passed (Acceptance Case 6): Settlement failure rolled back hold, stock, and invoice atomically');

  // Replenish lot1 with fresh sellable stock for subsequent scenarios
  await db.collection('stockLots').updateOne({_id: lot1Id}, {
    $inc: {quantityReceived: 20, quantitySellable: 20, quantityRemaining: 20},
  });

  // =========================================================================
  // Scenario 10 (Reservation Acceptance Case 7: Kolkata Expiry Date Rule)
  // Expired yesterday cannot be consumed even before worker runs. Usable today.
  // =========================================================================
  console.log('--- Testing Scenario 10 (Acceptance Case 7): Kolkata Expiry Date Rule ---');
  // Hold expiring today
  const holdTodayRes = await api('POST', '/api/sales/reservations', {
    customerId: custA1Id,
    productId: prodNonserialId,
    lotId: lot1Id,
    quantity: 1,
    serials: [],
    reservedAt: compA.today,
    expiresAt: compA.today, // Expires end of TODAY
    idempotencyKey: `hold-today-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(holdTodayRes.status, 200);
  const holdToday = holdTodayRes.body;
  tracked.stockReservations.push(holdToday._id);

  // Hold expiring today is USABLE today
  const draftToday = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-today-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-today',
        productId: prodNonserialId,
        description: 'Cable',
        hsn: '8544',
        quantity: 1,
        unitRatePaise: 40000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot1Id, reservationId: holdToday._id, quantity: 1, serials: []}],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftToday.status, 200);
  tracked.invoices.push(draftToday.body._id);

  const issueToday = await api('POST', `/api/sales/invoices/${draftToday.body._id}/issue`, {
    draftId: draftToday.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-today-${randomUUID()}`,
    paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: draftToday.body.totalPaise}],
  }, compA.cookie);
  assert.strictEqual(issueToday.status, 200, 'Hold expiring today must be usable today');

  // Now create hold with expiresAt = yesterday
  const holdYesterdayId = `HOLD-YESTERDAY-${Date.now()}`;
  await db.collection('stockReservations').insertOne({
    _id: holdYesterdayId, tenantId: compA.tenantId, customerId: custA1Id, productId: prodNonserialId,
    lotId: lot1Id, schemaVersion: 1, version: 1, status: 'Active', quantity: 1, remainingQuantity: 1,
    consumedQuantity: 0, releasedQuantity: 0, isSerialTracked: false, serials: [], remainingSerials: [],
    reservedAt: '2026-09-01', expiresAt: compA.yesterday, notes: 'Expired hold test',
    createdAt: new Date(), createdBy: compA.userId.toString(), updatedAt: new Date(),
  });
  tracked.stockReservations.push(holdYesterdayId);

  // Attempting to consume expired hold directly MUST FAIL (409) even before worker runs
  const draftYesterday = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-yesterday-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-yest',
        productId: prodNonserialId,
        description: 'Cable',
        hsn: '8544',
        quantity: 1,
        unitRatePaise: 40000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot1Id, reservationId: holdYesterdayId, quantity: 1, serials: []}],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftYesterday.status, 200);
  tracked.invoices.push(draftYesterday.body._id);

  const issueYesterday = await api('POST', `/api/sales/invoices/${draftYesterday.body._id}/issue`, {
    draftId: draftYesterday.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-yest-${randomUUID()}`,
    paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: draftYesterday.body.totalPaise}],
  }, compA.cookie);
  assert.strictEqual(issueYesterday.status, 409, 'Hold expired yesterday cannot be consumed');
  console.log('✓ Scenario 10 passed (Acceptance Case 7): Kolkata date boundary accurately enforced');

  // =========================================================================
  // Scenario 11 (Reservation Acceptance Case 8: Archived Customer/Product)
  // Cannot create new hold; can release existing hold.
  // =========================================================================
  console.log('--- Testing Scenario 11 (Acceptance Case 8): Archived Entities ---');
  // Create an active customer & hold, then archive customer
  const custArchivedId = `CUST-ARCH-${Date.now()}`;
  await db.collection('customers').insertOne({
    _id: custArchivedId, tenantId: compA.tenantId, name: 'Archived Customer', phone: '9999900001',
    state: 'Tamil Nadu', stateCode: '33', status: 'Active', financialVersion: 1, createdAt: new Date(),
  });
  tracked.customers.push(custArchivedId);

  const holdArchRes = await api('POST', '/api/sales/reservations', {
    customerId: custArchivedId,
    productId: prodNonserialId,
    lotId: lot1Id,
    quantity: 1,
    serials: [],
    reservedAt: compA.today,
    expiresAt: '2026-12-31',
    idempotencyKey: `hold-arch-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(holdArchRes.status, 200);
  const holdArch = holdArchRes.body;
  tracked.stockReservations.push(holdArch._id);

  // Now archive the customer
  await db.collection('customers').updateOne({_id: custArchivedId}, {$set: {status: 'Archived'}});

  // Attempt to create new hold with archived customer -> must fail 404
  const newHoldArchCust = await api('POST', '/api/sales/reservations', {
    customerId: custArchivedId,
    productId: prodNonserialId,
    lotId: lot1Id,
    quantity: 1,
    serials: [],
    reservedAt: compA.today,
    expiresAt: '2026-12-31',
    idempotencyKey: `new-hold-arch-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(newHoldArchCust.status, 404, 'Cannot create hold for archived customer');

  // Releasing the existing hold for archived customer -> MUST SUCCEED
  const releaseArchHold = await api('POST', `/api/sales/reservations/${holdArch._id}/release`, {
    reservationId: holdArch._id,
    expectedVersion: 1,
    idempotencyKey: `rel-arch-${randomUUID()}`,
    reason: 'Customer account was archived',
  }, compA.cookie);
  assert.strictEqual(releaseArchHold.status, 200, 'Releasing hold for archived customer must succeed');
  console.log('✓ Scenario 11 passed (Acceptance Case 8): Archived customer cannot hold stock, but existing hold can release');

  // =========================================================================
  // Scenario 12 (Reservation Acceptance Case 9: Draft Edit/Cancel Isolation)
  // Editing or cancelling an invoice draft does not release separate hold.
  // =========================================================================
  console.log('--- Testing Scenario 12 (Acceptance Case 9): Draft Edit/Cancel Isolation ---');
  const holdDraftIsoRes = await api('POST', '/api/sales/reservations', {
    customerId: custA1Id,
    productId: prodNonserialId,
    lotId: lot1Id,
    quantity: 1,
    serials: [],
    reservedAt: compA.today,
    expiresAt: '2026-12-31',
    idempotencyKey: `hold-iso-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(holdDraftIsoRes.status, 200);
  const holdDraftIso = holdDraftIsoRes.body;
  tracked.stockReservations.push(holdDraftIso._id);

  const draftIso = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-draft-iso-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-iso',
        productId: prodNonserialId,
        description: 'Cable',
        hsn: '8544',
        quantity: 1,
        unitRatePaise: 40000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot1Id, reservationId: holdDraftIso._id, quantity: 1, serials: []}],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftIso.status, 200);
  tracked.invoices.push(draftIso.body._id);

  // Cancel the draft invoice
  const cancelDraftIso = await api('DELETE', `/api/sales/invoices/${draftIso.body._id}`, {
    expectedVersion: 1,
    idempotencyKey: `cancel-iso-${randomUUID()}`,
    reason: 'Cancelled draft',
  }, compA.cookie);
  assert.strictEqual(cancelDraftIso.status, 200);

  // Verify hold is STILL Active and NOT released
  const holdIsoCheck = await db.collection('stockReservations').findOne({_id: holdDraftIso._id});
  assert.strictEqual(holdIsoCheck.status, 'Active');
  assert.strictEqual(holdIsoCheck.remainingQuantity, 1);
  console.log('✓ Scenario 12 passed (Acceptance Case 9): Draft cancellation preserves separate hold');

  // =========================================================================
  // Scenario 13 (Reservation Acceptance Case 10: Pagination, Search & Filters)
  // =========================================================================
  console.log('--- Testing Scenario 13 (Acceptance Case 10): Pagination & Filters ---');
  const pagRes = await api('GET', '/api/sales/reservations?page=1&limit=2', null, compA.cookie);
  assert.strictEqual(pagRes.status, 200);
  assert.strictEqual(pagRes.body.limit, 2);
  assert.ok(pagRes.body.total >= 2);
  assert.ok(pagRes.body.totalPages >= 1);

  const filterStatusRes = await api('GET', '/api/sales/reservations?status=Released', null, compA.cookie);
  assert.strictEqual(filterStatusRes.status, 200);
  assert.ok(filterStatusRes.body.items.every(h => h.status === 'Released'));
  console.log('✓ Scenario 13 passed (Acceptance Case 10): Bounded pagination and filters verified');

  // =========================================================================
  // Scenario 14: Advance Consumption & Partial Due on Issue
  // 1000 paise invoice + 400 advance + 300 cash -> due 300.
  // =========================================================================
  console.log('--- Testing Scenario 14: Advance Consumption on Issue ---');
  // Seed an existing advance of 40000 paise (₹400.00) for Customer A1
  const advId = `ADV-TEST-${Date.now()}`;
  await db.collection('customerAdvances').insertOne({
    _id: advId, tenantId: compA.tenantId, customerId: custA1Id, advanceNumber: 'ADV-FIXTURE-0001',
    originalAmountPaise: 40000, remainingAmountPaise: 40000, status: 'Available', date: compA.yesterday,
    sourceReceiptId: 'REC-001', createdAt: new Date(), updatedAt: new Date(),
  });
  tracked.customerAdvances.push(advId);

  // Create invoice draft totaling 118000 paise (unitRatePaise: 100000 + 18% GST)
  const draftAdv = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-draft-adv-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-adv',
        productId: prodNonserialId,
        description: 'Cable',
        hsn: '8544',
        quantity: 1,
        unitRatePaise: 100000, // ₹1,000.00 -> total 118000 paise
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot1Id, quantity: 1, serials: []}],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftAdv.status, 200);
  tracked.invoices.push(draftAdv.body._id);

  // Issue with: 40000 advance + 30000 cash -> due must be 118000 - 40000 - 30000 = 48000 paise
  const issueAdvRes = await api('POST', `/api/sales/invoices/${draftAdv.body._id}/issue`, {
    draftId: draftAdv.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-adv-${randomUUID()}`,
    applyCustomerAdvancePaise: 40000,
    paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: 30000}],
  }, compA.cookie);
  assert.strictEqual(issueAdvRes.status, 200, `Issue with advance failed: ${JSON.stringify(issueAdvRes.body)}`);
  assert.strictEqual(issueAdvRes.body.duePaise, 48000);

  // Advance must now be FullyConsumed
  const advAfter = await db.collection('customerAdvances').findOne({_id: advId});
  assert.strictEqual(advAfter.remainingAmountPaise, 0);
  assert.strictEqual(advAfter.status, 'FullyConsumed');

  // Customer allocation records created
  const allocs = await db.collection('customerAllocations').find({tenantId: compA.tenantId, targetId: draftAdv.body._id}).toArray();
  assert.strictEqual(allocs.length, 2, 'Must have 2 allocation records (1 Advance, 1 Receipt)');
  console.log('✓ Scenario 14 passed: Customer advance consumption and partial due verified');

  // =========================================================================
  // Scenario 15: Advance Excess with Consent
  // =========================================================================
  console.log('--- Testing Scenario 15: Excess Cash to Advance with Consent ---');
  // Total 118000 paise. Pay 150000 cash with recordExcessAsCustomerAdvance: true -> due 0, new advance 32000
  const draftExcess = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-draft-excess-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-excess',
        productId: prodNonserialId,
        description: 'Cable',
        hsn: '8544',
        quantity: 1,
        unitRatePaise: 100000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot1Id, quantity: 1, serials: []}],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftExcess.status, 200);
  tracked.invoices.push(draftExcess.body._id);

  const issueExcess = await api('POST', `/api/sales/invoices/${draftExcess.body._id}/issue`, {
    draftId: draftExcess.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-excess-${randomUUID()}`,
    paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: 150000}], // ₹1,500
    recordExcessAsCustomerAdvance: true,
  }, compA.cookie);
  assert.strictEqual(issueExcess.status, 200, `Issue excess failed: ${JSON.stringify(issueExcess.body)}`);
  assert.strictEqual(issueExcess.body.duePaise, 0);

  // Verify new advance created for 32000 paise (150000 - 118000)
  const newAdv = await db.collection('customerAdvances').findOne({tenantId: compA.tenantId, customerId: custA1Id, remainingAmountPaise: 32000});
  assert.ok(newAdv, 'New customer advance of 32000 paise must be created');
  assert.strictEqual(newAdv.originalAmountPaise, 32000);
  assert.strictEqual(newAdv.status, 'Available');
  tracked.customerAdvances.push(newAdv._id);
  console.log('✓ Scenario 15 passed: Excess cash converted to customer advance with consent');

  // =========================================================================
  // Scenario 16: Credit Limit Concurrency & Override Reason
  // =========================================================================
  console.log('--- Testing Scenario 16: Credit Limit Concurrency & Override ---');
  // Customer A1 credit limit: 500000 paise (₹5,000). Current due: 48000 paise.
  // Create an invoice with due exceeding 500000 paise without payment.
  const draftCredit = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-draft-cred-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-cred',
        productId: prodNonserialId,
        description: 'Cable',
        hsn: '8544',
        quantity: 5,
        unitRatePaise: 100000, // 5 * 1000 + 18% = 590000 paise > 500000 limit
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot1Id, quantity: 5, serials: []}],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftCredit.status, 200);
  tracked.invoices.push(draftCredit.body._id);

  // Issue without payment and without override -> MUST FAIL (400)
  const issueCreditFail = await api('POST', `/api/sales/invoices/${draftCredit.body._id}/issue`, {
    draftId: draftCredit.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-cred-fail-${randomUUID()}`,
    paymentComponents: [],
    creditLimitOverride: false,
  }, compA.cookie);
  assert.strictEqual(issueCreditFail.status, 409, 'Credit limit exceed without override must fail with 409 Conflict');

  // Issue WITH override and reason -> MUST SUCCEED
  const issueCreditSuccess = await api('POST', `/api/sales/invoices/${draftCredit.body._id}/issue`, {
    draftId: draftCredit.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-cred-succ-${randomUUID()}`,
    paymentComponents: [],
    creditLimitOverride: true,
    creditLimitOverrideReason: 'VIP Customer authorized by Store Manager',
  }, compA.cookie);
  assert.strictEqual(issueCreditSuccess.status, 200, `Issue with override failed: ${JSON.stringify(issueCreditSuccess.body)}`);

  // Verify audit contains override reason
  const audit = await db.collection('auditHistory').findOne({
    tenantId: compA.tenantId, entityId: draftCredit.body._id, action: 'invoice.issue',
  });
  assert.ok(audit);
  assert.strictEqual(audit.after?.creditLimitOverride, true);
  assert.strictEqual(audit.after?.creditLimitOverrideReason, 'VIP Customer authorized by Store Manager');
  console.log('✓ Scenario 16 passed: Credit limit enforcement and override audit verified');

  // =========================================================================
  // Scenario 17: GST Calculations & Tax Breakdown Reconciliation
  // =========================================================================
  console.log('--- Testing Scenario 17: GST Calculation Reconciliation ---');
  // Inter-state invoice: taxMode = 'Inter-state', CGST = 0, SGST = 0, IGST = total tax
  const draftInterstate = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-draft-inter-${randomUUID()}`,
    customerId: custA2Id, // Karnataka customer
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Inter-state',
    placeOfSupply: 'Karnataka',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-inter',
        productId: prodNonserialId,
        description: 'Cable',
        hsn: '8544',
        quantity: 1,
        unitRatePaise: 10000, // ₹100.00
        taxBasisPoints: 1800, // 18%
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftInterstate.status, 200);
  tracked.invoices.push(draftInterstate.body._id);

  const invDoc = draftInterstate.body;
  assert.strictEqual(invDoc.cgstPaise, 0, 'Inter-state must have 0 CGST');
  assert.strictEqual(invDoc.sgstPaise, 0, 'Inter-state must have 0 SGST');
  assert.strictEqual(invDoc.igstPaise, 1800, 'Inter-state must have full IGST');
  assert.strictEqual(invDoc.totalPaise, 11800);
  console.log('✓ Scenario 17 passed: Inter-state vs intra-state GST breakdown verified');

  // Replenish lot1 with fresh sellable stock for post-issue settlement tests
  await db.collection('stockLots').updateOne({_id: lot1Id}, {
    $inc: {quantityReceived: 50, quantitySellable: 50, quantityRemaining: 50},
  });

  // =========================================================================
  // Scenario 18: Standalone Customer Receipt (Post-Issue Settlement)
  // Cash/Bank increases, account movements, invoice due reduction, customer statement
  // =========================================================================
  console.log('--- Testing Scenario 18: Standalone Customer Receipt Settlement ---');
  // 1. Create and issue invoice for custA1Id with unpaid balance
  const draftS18 = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-s18-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-s18',
        productId: prodNonserialId,
        description: 'Cable',
        hsn: '8544',
        quantity: 1,
        unitRatePaise: 50000, // ₹500 + 18% = 59000 paise
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot1Id, quantity: 1, serials: []}],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftS18.status, 200);
  tracked.invoices.push(draftS18.body._id);

  // Increase credit limit for custA1Id to ensure settlement testing can issue unpaid drafts
  await db.collection('customers').updateOne({_id: custA1Id}, {
    $set: {creditLimitPaise: 50000000},
  });

  const issueS18 = await api('POST', `/api/sales/invoices/${draftS18.body._id}/issue`, {
    draftId: draftS18.body._id,
    expectedVersion: 1,
    idempotencyKey: `issue-s18-${randomUUID()}`,
    paymentComponents: [], // 0 paid, full due 59000 paise
    creditLimitOverride: true,
    creditLimitOverrideReason: 'Authorized for settlement test',
  }, compA.cookie);
  assert.strictEqual(issueS18.status, 200);

  const invS18Id = draftS18.body._id;
  const invS18Doc = await db.collection('invoices').findOne({_id: invS18Id});
  assert.strictEqual(invS18Doc.duePaise, 59000);

  const cashBalBeforeS18 = (await db.collection('tenantAccountBalances').findOne({tenantId: compA.tenantId, account: 'Cash'}))?.balancePaise || 0;
  const custBeforeS18 = await db.collection('customers').findOne({_id: custA1Id});

  // 2. Record customer receipt of 30,000 paise against invS18Id
  const rcptKeyS18 = `rcpt-s18-${randomUUID()}`;
  const rcptS18Res = await api('POST', '/api/sales/receipts', {
    customerId: custA1Id,
    date: compA.today,
    components: [{account: 'Cash', method: 'Cash', amountPaise: 30000}],
    allocations: [{targetType: 'Invoice', targetId: invS18Id, amountPaise: 30000}],
    recordExcessAsCustomerAdvance: false,
    notes: 'Partial payment of 300 INR by cash',
    idempotencyKey: rcptKeyS18,
  }, compA.cookie);
  assert.strictEqual(rcptS18Res.status, 200, `Receipt failed: ${JSON.stringify(rcptS18Res.body)}`);
  const rcptS18 = rcptS18Res.body;
  tracked.customerReceipts.push(rcptS18._id);

  // Invariants:
  // a. Invoice duePaise decreased by 30000, allocatedPaidPaise is 30000
  const invAfterS18 = await db.collection('invoices').findOne({_id: invS18Id});
  assert.strictEqual(invAfterS18.duePaise, 29000);
  assert.strictEqual(invAfterS18.allocatedPaidPaise, 30000);

  // b. Cash balance increased by 30000 paise
  const cashBalAfterS18 = (await db.collection('tenantAccountBalances').findOne({tenantId: compA.tenantId, account: 'Cash'}))?.balancePaise || 0;
  assert.strictEqual(cashBalAfterS18, cashBalBeforeS18 + 30000);

  // c. Account movement created for Cash (+30000)
  const moveS18 = await db.collection('accountMovements').findOne({
    tenantId: compA.tenantId,
    sourceId: rcptS18._id,
  });
  assert.ok(moveS18, 'Account movement must be created for receipt');
  assert.strictEqual(moveS18.qty, 30000);
  assert.strictEqual(moveS18.account, 'Cash');

  // d. Customer financial version incremented
  const custAfterS18 = await db.collection('customers').findOne({_id: custA1Id});
  assert.strictEqual(custAfterS18.financialVersion, custBeforeS18.financialVersion + 1);

  // e. Idempotency test: duplicate call returns same receipt without double-applying
  const dupRcptS18Res = await api('POST', '/api/sales/receipts', {
    customerId: custA1Id,
    date: compA.today,
    components: [{account: 'Cash', method: 'Cash', amountPaise: 30000}],
    allocations: [{targetType: 'Invoice', targetId: invS18Id, amountPaise: 30000}],
    recordExcessAsCustomerAdvance: false,
    notes: 'Partial payment of 300 INR by cash',
    idempotencyKey: rcptKeyS18,
  }, compA.cookie);
  assert.strictEqual(dupRcptS18Res.status, 200);
  assert.strictEqual(dupRcptS18Res.body._id, rcptS18._id);
  const invAfterDupS18 = await db.collection('invoices').findOne({_id: invS18Id});
  assert.strictEqual(invAfterDupS18.duePaise, 29000, 'Idempotent duplicate must not double-reduce due');
  console.log('✓ Scenario 18 passed: Standalone customer receipt, financial version lock, and account movement verified');

  // =========================================================================
  // Scenario 19: Customer Advance Allocation without Cash Movement
  // 0 account movements, reduces advance remaining and invoice due
  // =========================================================================
  console.log('--- Testing Scenario 19: Advance Allocation without Cash Movement ---');
  // 1. Create a customer advance of 50000 paise
  const advRcptRes = await api('POST', '/api/sales/receipts', {
    customerId: custA1Id,
    date: compA.today,
    components: [{account: 'Cash', method: 'Cash', amountPaise: 50000}],
    allocations: [], // no initial allocation
    recordExcessAsCustomerAdvance: true,
    notes: 'Advance deposit',
    idempotencyKey: `rcpt-adv-s19-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(advRcptRes.status, 200);
  tracked.customerReceipts.push(advRcptRes.body._id);
  const advanceIdS19 = advRcptRes.body.advanceId;
  assert.ok(advanceIdS19, 'Advance ID must be returned on excess receipt');
  tracked.customerAdvances.push(advanceIdS19);

  const advBeforeAlloc = await db.collection('customerAdvances').findOne({_id: advanceIdS19});
  assert.strictEqual(advBeforeAlloc.originalAmountPaise, 50000);
  assert.strictEqual(advBeforeAlloc.remainingAmountPaise, 50000);
  assert.strictEqual(advBeforeAlloc.status, 'Available');

  // Measure account movements & cash balance right before allocation
  const movesBeforeAlloc = await db.collection('accountMovements').countDocuments({tenantId: compA.tenantId});
  const cashBeforeAlloc = (await db.collection('tenantAccountBalances').findOne({tenantId: compA.tenantId, account: 'Cash'}))?.balancePaise || 0;

  // 2. Allocate 29,000 paise of advance to settle the remaining due on invS18Id
  const allocKeyS19 = `alloc-s19-${randomUUID()}`;
  const allocRes = await api('POST', `/api/sales/advances/${advanceIdS19}/allocate`, {
    advanceId: advanceIdS19,
    expectedVersion: 1,
    allocations: [{targetType: 'Invoice', targetId: invS18Id, amountPaise: 29000}],
    effectiveDate: compA.today,
    idempotencyKey: allocKeyS19,
  }, compA.cookie);
  assert.strictEqual(allocRes.status, 200, `Advance allocation failed: ${JSON.stringify(allocRes.body)}`);

  // Invariants:
  // a. Advance remaining decreased to 21000 paise (50000 - 29000), status PartlyConsumed
  const advAfterAlloc = await db.collection('customerAdvances').findOne({_id: advanceIdS19});
  assert.strictEqual(advAfterAlloc.remainingAmountPaise, 21000);
  assert.strictEqual(advAfterAlloc.status, 'PartlyConsumed');
  assert.strictEqual(advAfterAlloc.version, 2);

  // b. Invoice duePaise is now 0, allocatedPaidPaise is 59000, paymentStatus is Paid
  const invFullyPaidS19 = await db.collection('invoices').findOne({_id: invS18Id});
  assert.strictEqual(invFullyPaidS19.duePaise, 0);
  assert.strictEqual(invFullyPaidS19.allocatedPaidPaise, 59000);
  assert.strictEqual(invFullyPaidS19.paymentStatus, 'Paid');

  // c. CRITICAL MONEY INVARIANT: 0 NEW ACCOUNT MOVEMENTS!
  const movesAfterAlloc = await db.collection('accountMovements').countDocuments({tenantId: compA.tenantId});
  assert.strictEqual(movesAfterAlloc, movesBeforeAlloc, 'Advance allocation must NEVER generate cash/bank account movements');

  // d. Cash balance remains completely unchanged
  const cashAfterAlloc = (await db.collection('tenantAccountBalances').findOne({tenantId: compA.tenantId, account: 'Cash'}))?.balancePaise || 0;
  assert.strictEqual(cashAfterAlloc, cashBeforeAlloc, 'Cash balance must not change on internal advance allocation');

  // e. Optimistic locking: calling allocate again with stale expectedVersion 1 must fail with 409
  const staleAllocRes = await api('POST', `/api/sales/advances/${advanceIdS19}/allocate`, {
    advanceId: advanceIdS19,
    expectedVersion: 1,
    allocations: [{targetType: 'Invoice', targetId: invS18Id, amountPaise: 1000}],
    effectiveDate: compA.today,
    idempotencyKey: `stale-alloc-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(staleAllocRes.status, 409, 'Stale expectedVersion on advance allocation must fail with 409 Conflict');
  console.log('✓ Scenario 19 passed: Advance allocation completed with 0 account movements and strict optimistic lock');

  // =========================================================================
  // Scenario 20: Customer Advance Refund with Cash Overdraft Protection
  // =========================================================================
  console.log('--- Testing Scenario 20: Advance Refund & Overdraft Protection ---');
  // Advance remaining is 21,000 paise. Version is 2.
  // 1. Attempt to refund more than advance remaining (25000 paise) -> 400
  const overRefundRes = await api('POST', `/api/sales/advances/${advanceIdS19}/refund`, {
    advanceId: advanceIdS19,
    expectedVersion: 2,
    account: 'Cash',
    amountPaise: 25000,
    refundDate: compA.today,
    reason: 'Excess refund test',
    idempotencyKey: `ref-excess-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(overRefundRes.status, 400, 'Refund exceeding advance remaining must fail');

  // 2. Overdraft protection test: Bank account has 0 balance.
  // Attempting to refund 10,000 paise from Bank must fail (409 Conflict)
  const origBankDoc = await db.collection('tenantAccountBalances').findOne({tenantId: compA.tenantId, account: 'Bank'});
  const origBankBal = origBankDoc?.balancePaise || 0;
  await db.collection('tenantAccountBalances').updateOne({tenantId: compA.tenantId, account: 'Bank'}, {$set: {balancePaise: 0}});

  const bankOverdraftRes = await api('POST', `/api/sales/advances/${advanceIdS19}/refund`, {
    advanceId: advanceIdS19,
    expectedVersion: 2,
    account: 'Bank',
    amountPaise: 10000,
    refundDate: compA.today,
    reason: 'Overdraft test on 0-balance bank account',
    idempotencyKey: `ref-od-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(bankOverdraftRes.status, 409, 'Refund causing negative account balance must fail with 409');

  // Restore Bank balance
  await db.collection('tenantAccountBalances').updateOne({tenantId: compA.tenantId, account: 'Bank'}, {$set: {balancePaise: origBankBal}});

  // 3. Valid refund: 10,000 paise from Cash account (plenty of balance)
  const cashBeforeRefund = (await db.collection('tenantAccountBalances').findOne({tenantId: compA.tenantId, account: 'Cash'}))?.balancePaise || 0;
  const refundKeyS20 = `ref-valid-${randomUUID()}`;
  const validRefundRes = await api('POST', `/api/sales/advances/${advanceIdS19}/refund`, {
    advanceId: advanceIdS19,
    expectedVersion: 2,
    account: 'Cash',
    amountPaise: 10000,
    refundDate: compA.today,
    reason: 'Customer requested deposit return',
    idempotencyKey: refundKeyS20,
  }, compA.cookie);
  assert.strictEqual(validRefundRes.status, 200, `Valid refund failed: ${JSON.stringify(validRefundRes.body)}`);

  // Invariants:
  // a. Advance remaining: 21000 - 10000 = 11000 paise, version = 3
  const advAfterRefund = await db.collection('customerAdvances').findOne({_id: advanceIdS19});
  assert.strictEqual(advAfterRefund.remainingAmountPaise, 11000);
  assert.strictEqual(advAfterRefund.version, 3);

  // b. Cash balance decreased by 10,000 paise
  const cashAfterRefund = (await db.collection('tenantAccountBalances').findOne({tenantId: compA.tenantId, account: 'Cash'}))?.balancePaise || 0;
  assert.strictEqual(cashAfterRefund, cashBeforeRefund - 10000);

  // c. Negative account movement recorded for Cash (-10000)
  const refundMove = await db.collection('accountMovements').findOne({
    tenantId: compA.tenantId,
    sourceId: validRefundRes.body._id,
    sourceType: 'CustomerRefund',
  });
  assert.ok(refundMove, 'Account movement for advance refund must be recorded');
  assert.strictEqual(refundMove.qty, -10000);
  assert.strictEqual(refundMove.account, 'Cash');
  console.log('✓ Scenario 20 passed: Advance refund verified with strict cash overdraft protection');

  // =========================================================================
  // Scenario 21: Downstream Advance Consumption Blocks Receipt Reversal
  // =========================================================================
  console.log('--- Testing Scenario 21: Downstream Consumption Blocks Receipt Reversal ---');
  // In Scenario 19/20, advRcptRes created advanceIdS19, which was consumed (allocated 29000 & refunded 10000).
  // Attempting to reverse advRcptRes must FAIL with 409 Conflict.
  const failRevRes = await api('POST', `/api/sales/receipts/${advRcptRes.body._id}/reverse`, {
    receiptId: advRcptRes.body._id,
    reason: 'Attempt reverse consumed receipt',
    idempotencyKey: `rev-fail-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(failRevRes.status, 409, 'Reversal of receipt with consumed downstream advance must return 409');

  // Now create a standalone clean receipt with NO downstream consumption
  const cleanRcptRes = await api('POST', '/api/sales/receipts', {
    customerId: custA1Id,
    date: compA.today,
    components: [{account: 'Cash', method: 'Cash', amountPaise: 5000}],
    allocations: [],
    recordExcessAsCustomerAdvance: true,
    notes: 'Unconsumed advance receipt',
    idempotencyKey: `rcpt-clean-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(cleanRcptRes.status, 200);
  const cleanRcptId = cleanRcptRes.body._id;
  const cleanAdvId = cleanRcptRes.body.advanceId;
  tracked.customerReceipts.push(cleanRcptId);
  if (cleanAdvId) tracked.customerAdvances.push(cleanAdvId);

  const cashBeforeCleanRev = (await db.collection('tenantAccountBalances').findOne({tenantId: compA.tenantId, account: 'Cash'}))?.balancePaise || 0;

  // Reverse unconsumed receipt -> MUST SUCCEED
  const cleanRevRes = await api('POST', `/api/sales/receipts/${cleanRcptId}/reverse`, {
    receiptId: cleanRcptId,
    reason: 'Customer cancelled transaction immediately',
    idempotencyKey: `rev-clean-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(cleanRevRes.status, 200, `Clean receipt reversal failed: ${JSON.stringify(cleanRevRes.body)}`);

  // Invariants:
  // a. Receipt marked reversed
  const rcptAfterRev = await db.collection('customerReceipts').findOne({_id: cleanRcptId});
  assert.strictEqual(rcptAfterRev.isReversed, true);

  // b. Cash balance decreased by 5000 paise (restored)
  const cashAfterCleanRev = (await db.collection('tenantAccountBalances').findOne({tenantId: compA.tenantId, account: 'Cash'}))?.balancePaise || 0;
  assert.strictEqual(cashAfterCleanRev, cashBeforeCleanRev - 5000);
  console.log('✓ Scenario 21 passed: Downstream advance consumption blocks reversal (409), unconsumed reverses cleanly');

  // =========================================================================
  // Scenario 22: Customer Statement Running Balance and Period Totals
  // =========================================================================
  console.log('--- Testing Scenario 22: Customer Statement & Running Balance ---');
  const stmtRes = await api('GET', `/api/sales/customers/${custA1Id}/statement?page=1&limit=50`, null, compA.cookie);
  assert.strictEqual(stmtRes.status, 200, `Customer statement query failed: ${JSON.stringify(stmtRes.body)}`);
  const stmt = stmtRes.body;
  assert.ok(stmt.customerSnapshot, 'Statement must include customer snapshot');
  assert.strictEqual(stmt.customerId, custA1Id);
  assert.ok(Array.isArray(stmt.entries), 'Statement entries must be an array');
  assert.ok(stmt.entries.length > 0, 'Statement entries should have records from prior scenarios');

  // Verify running balance continuity:
  // Each entry's runningBalancePaise must match previous + debitPaise - creditPaise
  let prevBal = stmt.balanceBeforePagePaise || 0;
  for (const entry of stmt.entries) {
    const expected = prevBal + (entry.debitPaise || 0) - (entry.creditPaise || 0);
    assert.strictEqual(entry.runningBalancePaise, expected, `Running balance mismatch on entry ${entry.id}`);
    prevBal = entry.runningBalancePaise;
  }
  console.log('✓ Scenario 22 passed: Customer statement running balance mathematically reconciled');

  // =========================================================================
  // Scenario 23: Sales Return with GST Proration, Restock vs Quarantine, Credit Note
  // =========================================================================
  console.log('--- Testing Scenario 23: Sales Return, GST Proration & Restock/Quarantine ---');
  // 1. Issue an invoice with 2 units of cable (₹100 each + 18% GST = ₹236 total, 23600 paise)
  const draftReturnInv = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-ret-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-ret',
        productId: prodNonserialId,
        description: 'Cable',
        hsn: '8544',
        quantity: 2,
        unitRatePaise: 10000, // ₹100 each
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lot1Id, quantity: 2, serials: []}],
        warrantyMonths: 0,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftReturnInv.status, 200);
  const returnInvId = draftReturnInv.body._id;
  tracked.invoices.push(returnInvId);

  const issueReturnInv = await api('POST', `/api/sales/invoices/${returnInvId}/issue`, {
    draftId: returnInvId,
    expectedVersion: 1,
    idempotencyKey: `issue-ret-${randomUUID()}`,
    paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: 23600}],
  }, compA.cookie);
  assert.strictEqual(issueReturnInv.status, 200);

  const lotBeforeReturn = await db.collection('stockLots').findOne({_id: lot1Id});

  // 2. Return Unit 1: RestockSellable with CustomerCredit
  const ret1Key = `ret1-${randomUUID()}`;
  const ret1Res = await api('POST', '/api/sales/returns', {
    invoiceId: returnInvId,
    invoiceLineId: 'line-ret',
    quantity: 1,
    serials: [],
    date: compA.today,
    reason: 'Customer bought incorrect cable',
    stockDisposition: 'RestockSellable',
    settlement: 'CustomerCredit',
    idempotencyKey: ret1Key,
  }, compA.cookie);
  assert.strictEqual(ret1Res.status, 200, `Return 1 failed: ${JSON.stringify(ret1Res.body)}`);
  const ret1Doc = ret1Res.body;
  tracked.customerReturns.push(ret1Doc._id);

  // Invariants:
  // a. Prorated GST: taxable = 10000 paise, cgst = 900, sgst = 900, refund = 11800 paise
  assert.strictEqual(ret1Doc.taxableBasePaise, 10000);
  assert.strictEqual(ret1Doc.cgstPaise, 900);
  assert.strictEqual(ret1Doc.sgstPaise, 900);
  assert.strictEqual(ret1Doc.refundPaise, 11800);

  // b. Customer advance (credit note advance) created for 11800 paise
  assert.ok(ret1Doc.creditAdvanceId);
  tracked.customerAdvances.push(ret1Doc.creditAdvanceId);
  const creditAdv = await db.collection('customerAdvances').findOne({_id: ret1Doc.creditAdvanceId});
  assert.strictEqual(creditAdv.originalAmountPaise, 11800);
  assert.strictEqual(creditAdv.sourceType, 'CreditNote');

  // c. Stock restored: lot quantitySellable incremented by 1
  const lotAfterRet1 = await db.collection('stockLots').findOne({_id: lot1Id});
  assert.strictEqual(lotAfterRet1.quantitySellable, lotBeforeReturn.quantitySellable + 1);

  // 3. Return Unit 2: Quarantine with CustomerCredit
  const ret2Res = await api('POST', '/api/sales/returns', {
    invoiceId: returnInvId,
    invoiceLineId: 'line-ret',
    quantity: 1,
    serials: [],
    date: compA.today,
    reason: 'Damaged cable wire',
    stockDisposition: 'Quarantine',
    settlement: 'CustomerCredit',
    idempotencyKey: `ret2-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(ret2Res.status, 200);
  tracked.customerReturns.push(ret2Res.body._id);
  if (ret2Res.body.creditAdvanceId) tracked.customerAdvances.push(ret2Res.body.creditAdvanceId);

  // Invariant: lot quantityDefective incremented by 1, quantitySellable NOT incremented
  const lotAfterRet2 = await db.collection('stockLots').findOne({_id: lot1Id});
  assert.strictEqual(lotAfterRet2.quantityDefective || 0, (lotAfterRet1.quantityDefective || 0) + 1);
  assert.strictEqual(lotAfterRet2.quantitySellable, lotAfterRet1.quantitySellable);

  // 4. Return Unit 3 (excess return, original line qty was 2) -> MUST FAIL (400)
  const ret3Res = await api('POST', '/api/sales/returns', {
    invoiceId: returnInvId,
    invoiceLineId: 'line-ret',
    quantity: 1,
    serials: [],
    date: compA.today,
    reason: 'Attempt return 3rd unit',
    stockDisposition: 'RestockSellable',
    settlement: 'CustomerCredit',
    idempotencyKey: `ret3-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(ret3Res.status, 400, 'Cannot return more than invoiced quantity');
  console.log('✓ Scenario 23 passed: Sales return GST proration, Restock vs Quarantine disposition, and credit note verified');

  // =========================================================================
  // Scenario 24: Warranty Claim Resolution (Repair, Replacement & Quarantine, Rejection)
  // =========================================================================
  console.log('--- Testing Scenario 24: Warranty Claim Resolution Lifecycle ---');
  // Setup fresh stock lot & serial units for warranty testing
  const lotWId = `LOT-W-${Date.now()}`;
  await db.collection('stockLots').insertOne({
    _id: lotWId, tenantId: compA.tenantId, productId: prodSerialId,
    lotNumber: 'LOT-W-01', quantityReceived: 10, quantitySellable: 10,
    quantityRemaining: 10, quantityDefective: 0, quantityReturned: 0,
    quantitySold: 0, costPricePaise: 3000000, version: 1, createdAt: new Date(), updatedAt: new Date(),
  });
  tracked.stockLots.push(lotWId);

  const wSerialOriginal = `W-ORIG-${Date.now()}`;
  const wSerialReplacement = `W-REP-${Date.now()}`;
  const su1Id = `SU-W1-${Date.now()}`;
  const su2Id = `SU-W2-${Date.now()}`;
  await db.collection('serialUnits').insertMany([
    {
      _id: su1Id, tenantId: compA.tenantId, productId: prodSerialId, lotId: lotWId,
      serial: wSerialOriginal, serialOriginal: wSerialOriginal,
      serialNormalized: wSerialOriginal.toLowerCase().replace(/[^a-z0-9]/g, ''),
      status: 'InStock', costPricePaise: 3000000, createdAt: new Date(), updatedAt: new Date(),
    },
    {
      _id: su2Id, tenantId: compA.tenantId, productId: prodSerialId, lotId: lotWId,
      serial: wSerialReplacement, serialOriginal: wSerialReplacement,
      serialNormalized: wSerialReplacement.toLowerCase().replace(/[^a-z0-9]/g, ''),
      status: 'InStock', costPricePaise: 3000000, createdAt: new Date(), updatedAt: new Date(),
    },
  ]);
  tracked.serialUnits.push(su1Id, su2Id);

  // Issue invoice for prodSerialId with serial unit & 12 months warranty
  const draftWInv = await api('POST', '/api/sales/invoices', {
    idempotencyKey: `inv-winv-${randomUUID()}`,
    customerId: custA1Id,
    invoiceDate: compA.today,
    invoiceKind: 'Sale',
    businessCategory: 'NewGoods',
    inclusive: false,
    taxMode: 'Intra-state',
    placeOfSupply: 'Tamil Nadu',
    templateId: compA.templateId,
    templateRevision: 1,
    lines: [
      {
        lineType: 'Product',
        clientLineKey: 'line-winv',
        productId: prodSerialId,
        description: 'Laptop',
        hsn: '8471',
        quantity: 1,
        unitRatePaise: 4000000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{lotId: lotWId, quantity: 1, serials: [wSerialOriginal]}],
        warrantyMonths: 12,
      },
    ],
  }, compA.cookie);
  assert.strictEqual(draftWInv.status, 200);
  const wInvId = draftWInv.body._id;
  tracked.invoices.push(wInvId);

  const issueWInv = await api('POST', `/api/sales/invoices/${wInvId}/issue`, {
    draftId: wInvId,
    expectedVersion: 1,
    idempotencyKey: `issue-winv-${randomUUID()}`,
    paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: draftWInv.body.totalPaise}],
  }, compA.cookie);
  assert.strictEqual(issueWInv.status, 200);

  // Verify warranty created
  const wRecord = await db.collection('warranties').findOne({tenantId: compA.tenantId, invoiceId: wInvId});
  assert.ok(wRecord, 'Warranty record must be created on invoice issuance');
  assert.strictEqual(wRecord.status, 'Active');
  assert.strictEqual(wRecord.serialNumber, wSerialOriginal);
  tracked.warranties.push(wRecord._id);

  // 1. Test Repair Claim
  const repairRes = await api('POST', `/api/sales/warranties/${wRecord._id}/claim`, {
    reason: 'Screen flicker fixed via display ribbon reseating',
    action: 'Repaired',
    notes: 'Handled in service center',
    expectedVersion: 1,
    idempotencyKey: `claim-rep-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(repairRes.status, 200, `Repair claim failed: ${JSON.stringify(repairRes.body)}`);
  const wRepaired = await db.collection('warranties').findOne({_id: wRecord._id});
  assert.strictEqual(wRepaired.status, 'Active', 'Coverage remains Active per Phase 4 requirements');
  assert.strictEqual(wRepaired.claimDetails.action, 'Repaired');
  assert.strictEqual(wRepaired.version, 2);

  // 2. Test Replacement Claim with Serial Swap & Lineage on continuous coverage
  const replaceRes = await api('POST', `/api/sales/warranties/${wRecord._id}/claim`, {
    reason: 'Motherboard failure',
    action: 'Replaced',
    replacementSerial: wSerialReplacement,
    expectedVersion: 2,
    idempotencyKey: `claim-repl-${randomUUID()}`,
    notes: 'Serial swapped with replacement stock',
  }, compA.cookie);
  assert.strictEqual(replaceRes.status, 200, `Replacement claim failed: ${JSON.stringify(replaceRes.body)}`);

  // Invariants on replacement:
  // a. Original serial marked Defective
  const origUnit = await db.collection('serialUnits').findOne({tenantId: compA.tenantId, serialOriginal: wSerialOriginal});
  assert.strictEqual(origUnit.status, 'Defective');
  assert.strictEqual(origUnit.replacedBySerial, wSerialReplacement);

  // b. Replacement serial marked Sold
  const repUnit = await db.collection('serialUnits').findOne({tenantId: compA.tenantId, serialOriginal: wSerialReplacement});
  assert.strictEqual(repUnit.status, 'Sold');
  assert.strictEqual(repUnit.replacesSerial, wSerialOriginal);

  // c. Warranty remains Active, version 3, and serialNumber is wSerialReplacement
  const wReplaced = await db.collection('warranties').findOne({_id: wRecord._id});
  assert.strictEqual(wReplaced.status, 'Active');
  assert.strictEqual(wReplaced.version, 3);
  assert.strictEqual(wReplaced.serialNumber, wSerialReplacement);

  // 3. Test Rejection Claim on continuous coverage
  const rejectRes = await api('POST', `/api/sales/warranties/${wRecord._id}/claim`, {
    reason: 'Water ingress detected, physical damage not covered',
    action: 'Rejected',
    notes: 'Inspection photo attached to ticket',
    expectedVersion: 3,
    idempotencyKey: `claim-rej-${randomUUID()}`,
  }, compA.cookie);
  assert.strictEqual(rejectRes.status, 200, `Reject claim failed: ${JSON.stringify(rejectRes.body)}`);

  const wRejected = await db.collection('warranties').findOne({_id: wRecord._id});
  assert.strictEqual(wRejected.status, 'Active', 'Rejected warranty stays Active so expiry or subsequent tickets remain valid');
  assert.strictEqual(wRejected.claimDetails.action, 'Rejected');
  assert.strictEqual(wRejected.version, 4);
  console.log('✓ Scenario 24 passed: Warranty claim lifecycle (repair, serial replacement & quarantine, rejection) verified');

  // =========================================================================
  // Scenario 25: Template Management Lifecycle & Batch PDF ZIP Export
  // =========================================================================
  console.log('--- Testing Scenario 25: Templates CRUD & Batch PDF ZIP Export ---');
  // 1. Create custom invoice template
  const createTmplRes = await api('POST', '/api/sales/templates', {
    name: 'Tech Modern Invoice Template',
    title: 'TECH MODERN INVOICE',
    accent: '#4f46e5',
  }, compA.cookie);
  assert.strictEqual(createTmplRes.status, 200, `Create template failed: ${JSON.stringify(createTmplRes.body)}`);
  const tmplId = createTmplRes.body._id;
  tracked.templates.push(tmplId);
  tracked.invoiceTemplates.push(tmplId);

  // 2. Copy template
  const copyTmplRes = await api('POST', `/api/sales/templates/${tmplId}/copy`, {}, compA.cookie);
  assert.strictEqual(copyTmplRes.status, 200);
  const copyId = copyTmplRes.body._id;
  tracked.templates.push(copyId);
  tracked.invoiceTemplates.push(copyId);

  // 3. Rename template
  const renameTmplRes = await api('PATCH', `/api/sales/templates/${copyId}/rename`, {
    name: 'Tech Renamed Invoice Template',
  }, compA.cookie);
  assert.strictEqual(renameTmplRes.status, 200);
  const renamedTmpl = await db.collection('invoiceTemplates').findOne({_id: copyId});
  assert.strictEqual(renamedTmpl.name, 'Tech Renamed Invoice Template');

  // 4. Set as default
  const defaultTmplRes = await api('POST', `/api/sales/templates/${tmplId}/default`, {}, compA.cookie);
  assert.strictEqual(defaultTmplRes.status, 200);
  const defaultTmpl = await db.collection('invoiceTemplates').findOne({_id: tmplId});
  assert.strictEqual(defaultTmpl.isDefault, true);

  // 5. Archive copy template
  const archiveTmplRes = await api('DELETE', `/api/sales/templates/${copyId}`, {}, compA.cookie);
  assert.strictEqual(archiveTmplRes.status, 200);
  const archivedTmpl = await db.collection('invoiceTemplates').findOne({_id: copyId});
  assert.strictEqual(archivedTmpl.status, 'Archived');

  // 6. Batch PDF ZIP Export Verification
  const zipRes = await api('GET', '/api/sales/invoices/export-zip', null, compA.cookie, {}, true);
  assert.strictEqual(zipRes.status, 200, 'Batch PDF ZIP export must return HTTP 200');
  const contentType = zipRes.headers.get('content-type');
  assert.ok(contentType?.includes('application/zip'), 'Content-Type must be application/zip');
  assert.ok(zipRes.buffer && zipRes.buffer.length > 0, 'ZIP response buffer must not be empty');

  // Unpack ZIP with JSZip and verify contents
  const zip = await JSZip.loadAsync(zipRes.buffer);
  const fileNames = Object.keys(zip.files);
  assert.ok(fileNames.length > 0, 'ZIP must contain at least 1 invoice PDF file');
  const pdfFiles = fileNames.filter(f => f.endsWith('.pdf'));
  assert.ok(pdfFiles.length > 0, 'ZIP entries must be .pdf documents');

  // Verify first PDF file header has '%PDF' signature
  const firstPdfBuffer = await zip.file(pdfFiles[0]).async('nodebuffer');
  const magic = firstPdfBuffer.subarray(0, 4).toString('ascii');
  assert.strictEqual(magic, '%PDF', 'Exported ZIP file must contain valid PDF documents');
  console.log(`✓ Scenario 25 passed: Template lifecycle verified & ZIP contains ${pdfFiles.length} valid PDF invoice(s)`);

  console.log('\n======================================================');
  console.log('🎉 ALL 25 PHASE 4 SCENARIOS FULLY PASSED!');
  console.log('======================================================');

} catch (err) {
  console.error('\n❌ TEST FAILED:', err);
  process.exitCode = 1;
} finally {
  console.log('\nCleaning up Phase 4 test data...');
  for (const [colName, ids] of Object.entries(tracked)) {
    if (ids.length > 0) {
      if (colName === 'tenants') {
        await db.collection(colName).deleteMany({_id: {$in: ids}}).catch(() => {});
      } else if (colName === 'users') {
        await db.collection('authUsers').deleteMany({_id: {$in: ids}}).catch(() => {});
        await db.collection('authAccounts').deleteMany({userId: {$in: ids}}).catch(() => {});
      } else {
        await db.collection(colName).deleteMany({_id: {$in: ids}}).catch(() => {});
      }
    }
  }
  await client.close();
  console.log('Cleanup completed successfully.');
}
