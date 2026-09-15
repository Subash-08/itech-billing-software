// Phase 2 Comprehensive Multi-Tenant Isolation and Master Data Test
import {MongoClient, ObjectId} from 'mongodb';
import {hashPassword} from 'better-auth/crypto';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {unlink, rmdir} from 'node:fs/promises';

process.env.DISABLE_AUTH_RATE_LIMIT = 'true';
process.env.NODE_ENV = 'test';
process.loadEnvFile('.env.local');

if (process.env.MONGODB_DB !== 'itech_dev') {
  throw new Error('This test requires the isolated itech_dev development database.');
}

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db('itech_dev');
const base = 'http://127.0.0.1:3000';

// Clear leftover rate-limits to ensure repeatable test execution
await db.collection('authRateLimit').deleteMany({}).catch(() => {});

// Track created IDs for exact cleanup
const tracked = {
  users: [],
  tenants: [],
  files: [],
  customers: [],
  suppliers: [],
  products: [],
  services: [],
  templates: [],
  templateRevisions: [],
  lots: [],
  movements: [],
  serials: [],
  receivables: [],
  payables: [],
  accountMovements: [],
  openingSetups: [],
  auditIds: [],
};

async function api(method, path, body, cookie) {
  const headers = {
    origin: base,
    ...(cookie ? {cookie} : {}),
    ...(body ? {'content-type': 'application/json'} : {}),
  };
  const res = await fetch(base + path, {
    method,
    headers,
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
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
  console.log('--- Starting Phase 2 Multi-Tenant Verification ---');

  // 1. Create two test companies: Company A and Company B
  const companies = [];
  for (let i = 0; i < 2; i++) {
    const tenantId = randomUUID();
    const userId = new ObjectId();
    const email = `phase2-test-${i}-${randomUUID()}@example.invalid`;
    const password = randomUUID() + 'Aa1!';
    const companyName = `Test Company ${i === 0 ? 'Alpha' : 'Beta'} ${randomUUID().slice(0, 6)}`;

    tracked.tenants.push(tenantId);
    tracked.users.push(userId);

    await db.collection('tenants').insertOne({
      _id: tenantId,
      companyName,
      verified: true,
      disabled: false,
      createdAt: new Date(),
    });

    await db.collection('authUsers').insertOne({
      _id: userId,
      email,
      name: `User ${i === 0 ? 'A' : 'B'}`,
      emailVerified: false,
      tenantId,
      companyName,
      verified: true,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.collection('authAccounts').insertOne({
      userId,
      accountId: userId.toString(),
      providerId: 'credential',
      password: await hashPassword(password),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Login to obtain cookie
    const loginRes = await api('POST', '/api/auth/login', {email, password});
    assert.equal(loginRes.status, 200, `Login failed for company ${i}: ${JSON.stringify(loginRes.body)}`);
    const cookie = loginRes.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');

    companies.push({tenantId, userId, email, password, companyName, cookie});
  }

  const [compA, compB] = companies;
  console.log('✓ Created and authenticated Company A and Company B');

  const profileRes = await api('GET', '/api/auth/me', null, compA.cookie);
  assert.equal(profileRes.status, 200);
  assert.equal(profileRes.body.user.email, compA.email);
  assert.equal(profileRes.body.company.name, compA.companyName);
  assert.equal(profileRes.body.businessDataMode, 'live');

  const secondLogin = await api('POST', '/api/auth/login', {email: compA.email, password: compA.password});
  assert.equal(secondLogin.status, 200);
  const secondCookie = secondLogin.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
  const logoutRes = await api('POST', '/api/auth/logout', null, secondCookie);
  assert.equal(logoutRes.status, 200, `Empty-body sign out failed: ${JSON.stringify(logoutRes.body)}`);
  const signedOutProfile = await api('GET', '/api/auth/me', null, secondCookie);
  assert.equal(signedOutProfile.status, 401, 'Signed-out session must no longer access the company profile');
  console.log('✓ Live account profile hydration and empty-body sign-out verified');

  // 2. Company A uploads a private logo file
  const form = new FormData();
  form.set(
    'file',
    new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jm1sAAAAASUVORK5CYII=', 'base64')], {
      type: 'image/png',
    }),
    'logo.png'
  );
  const uploadRes = await fetch(base + '/api/files', {
    method: 'POST',
    headers: {origin: base, cookie: compA.cookie},
    body: form,
  });
  assert.equal(uploadRes.status, 200, 'Logo upload failed');
  const uploadData = await uploadRes.json();
  const compALogoFileId = uploadData.id;
  tracked.files.push(compALogoFileId);
  console.log('✓ Company A uploaded private logo file');

  // 3. Uniform 404: Company B attempts to use Company A's logoFileId in company settings (Must FAIL with 404)
  const crossLogoRes = await api('PUT', '/api/company/settings', {
    name: compB.companyName,
    phone: '9876543210',
    email: compB.email,
    address: 'Salem, TN',
    gst: '',
    bank: 'HDFC',
    account: '12345',
    ifsc: 'HDFC0001',
    declaration: 'Terms apply',
    logoFileId: compALogoFileId, // Injected cross-tenant file ID
  }, compB.cookie);
  assert.equal(crossLogoRes.status, 404, `Cross-tenant logo file injection must return 404: ${JSON.stringify(crossLogoRes.body)}`);
  console.log('✓ Cross-tenant logo file injection rejected with 404');

  // 4. Company A sets company settings
  const settingsRes = await api('PUT', '/api/company/settings', {
    name: 'Alpha Systems Salem',
    phone: '9876543210',
    email: 'alpha@example.invalid',
    address: '123 Main Road, Salem',
    gst: '33AAAAA0000A1Z5',
    bank: 'State Bank of India',
    account: '1234567890',
    ifsc: 'SBIN0001234',
    declaration: 'Goods once sold are covered by warranty.',
    logoFileId: compALogoFileId,
  }, compA.cookie);
  assert.equal(settingsRes.status, 200, `Company A settings failed: ${JSON.stringify(settingsRes.body)}`);
  console.log('✓ Company A configured company settings');

  // 5. Company A creates a Customer and a Supplier (with creditLimitPaise and paymentTermsDays)
  const customerRes = await api('POST', '/api/master/customers', {
    name: 'A-Customer Suresh',
    phone: '9842712345',
    email: 'suresh@example.invalid',
    address: 'Fairlands, Salem',
    gst: '33AABCS1429B1ZB',
    type: 'Business',
    creditLimitPaise: 5000000,
    paymentTermsDays: 30,
    notes: 'Regular corporate customer',
  }, compA.cookie);
  assert.equal(customerRes.status, 200, JSON.stringify(customerRes.body));
  const compACustomerId = customerRes.body._id;
  tracked.customers.push(compACustomerId);

  const supplierRes = await api('POST', '/api/master/suppliers', {
    name: 'A-Supplier Apex Distro',
    phone: '9443211223',
    email: 'apex@example.invalid',
    address: 'Chennai',
    gst: '33AABCA8888C1ZD',
    paymentTermsDays: 45,
  }, compA.cookie);
  assert.equal(supplierRes.status, 200, JSON.stringify(supplierRes.body));
  const compASupplierId = supplierRes.body._id;
  tracked.suppliers.push(compASupplierId);
  console.log('✓ Company A created customer and supplier');

  // 6. Duplicate Phone Number Warning:
  // Create another customer with same normalized phone in different format
  const dupPhoneCustomer = await api('POST', '/api/master/customers', {
    name: 'A-Customer Suresh Alternate',
    phone: '+91 98427 12345', // Same phone normalized
    email: 'alt@example.invalid',
  }, compA.cookie);
  assert.equal(dupPhoneCustomer.status, 200);
  assert.ok(dupPhoneCustomer.body.warning, 'Duplicate phone number must trigger warning message');
  tracked.customers.push(dupPhoneCustomer.body._id);
  console.log('✓ Duplicate phone number detected and returned as warning message');

  // 7. Uniform 404: Company B tries to create product with Company A's preferredSupplierId
  const crossSupplierProduct = await api('POST', '/api/master/products', {
    name: 'Injected Laptop',
    category: 'Laptops',
    brand: 'Dell',
    condition: 'New',
    model: 'Inspiron 15',
    hsn: '84713010',
    costPaise: 4000000,
    sellingPricePaise: 4800000,
    priceEntryMode: 'Inclusive',
    taxBasisPoints: 1800,
    low: 2,
    warranty: 12,
    preferredSupplierId: compASupplierId, // Cross-tenant ID
  }, compB.cookie);
  assert.equal(crossSupplierProduct.status, 404, 'Cross-tenant preferredSupplierId injection must return 404');
  console.log('✓ Cross-tenant preferredSupplierId injection rejected with 404');

  // 8. Zero-Value Preservation: Product with 0% GST, 0 reorder level, 0 warranty
  const zeroValProductRes = await api('POST', '/api/master/products', {
    name: 'Zero-Rated Diagnostic Cable',
    category: 'Accessories',
    brand: 'Generic',
    condition: 'New',
    model: 'DC-01',
    hsn: '84719000',
    costPaise: 10000,
    sellingPricePaise: 15000,
    priceEntryMode: 'Inclusive',
    taxBasisPoints: 0, // 0% GST
    low: 0,            // 0 reorder level
    warranty: 0,       // 0 warranty
    isSerialTracked: false,
  }, compA.cookie);
  assert.equal(zeroValProductRes.status, 200);
  assert.equal(zeroValProductRes.body.taxBasisPoints, 0, 'Zero GST must be preserved, not defaulted to 18%');
  assert.equal(zeroValProductRes.body.low, 0, 'Zero low stock level must be preserved');
  assert.equal(zeroValProductRes.body.warranty, 0, 'Zero warranty must be preserved');
  tracked.products.push(zeroValProductRes.body._id);
  console.log('✓ Zero-value preservation verified (tax: 0, low: 0, warranty: 0)');

  // 9. Company A creates standard products (one serialized, one quantity-tracked)
  const prod1Res = await api('POST', '/api/master/products', {
    name: 'Lenovo ThinkPad E14',
    category: 'Laptops',
    brand: 'Lenovo',
    condition: 'New',
    model: 'E14 Gen 4',
    hsn: '84713010',
    costPaise: 4500000,
    sellingPricePaise: 5500000,
    priceEntryMode: 'Inclusive',
    taxBasisPoints: 1800,
    low: 2,
    warranty: 12,
    preferredSupplierId: compASupplierId,
    isSerialTracked: true,
  }, compA.cookie);
  assert.equal(prod1Res.status, 200, JSON.stringify(prod1Res.body));
  const compAProd1Id = prod1Res.body._id;
  tracked.products.push(compAProd1Id);

  const prod2Res = await api('POST', '/api/master/products', {
    name: 'Logitech B100 USB Optical Mouse',
    category: 'Mouse',
    brand: 'Logitech',
    condition: 'New',
    model: 'B100',
    hsn: '84716060',
    costPaise: 25000,
    sellingPricePaise: 35000,
    priceEntryMode: 'Inclusive',
    taxBasisPoints: 1800,
    low: 5,
    warranty: 12,
    preferredSupplierId: compASupplierId,
    isSerialTracked: false,
  }, compA.cookie);
  assert.equal(prod2Res.status, 200, JSON.stringify(prod2Res.body));
  const compAProd2Id = prod2Res.body._id;
  tracked.products.push(compAProd2Id);
  console.log('✓ Company A created catalog products');

  // 10. Company A creates Service and Invoice Template
  const serviceRes = await api('POST', '/api/master/services', {
    name: 'Complete Thermal Paste Service',
    category: 'Maintenance',
    description: 'Internal heatsink cleaning & Noctua paste application',
    ratePaise: 150000,
    taxBasisPoints: 1800,
    sac: '998713',
    warranty: 1,
    active: true,
  }, compA.cookie);
  assert.equal(serviceRes.status, 200, JSON.stringify(serviceRes.body));
  const compAServiceId = serviceRes.body._id;
  tracked.services.push(compAServiceId);

  const templateRes = await api('POST', '/api/master/templates', {
    name: 'Alpha Standard Tax Invoice',
    title: 'Tax Invoice',
    paper: 'A4',
    orientation: 'portrait',
    fontSize: 11,
    accent: '#1a56db',
    borders: true,
    striped: false,
    logoPosition: 'left',
    fields: {logo: true, shopName: true, subtotal: true, grandTotal: true},
    columns: [
      {id: 'index', label: 'S.No', show: true, align: 'center'},
      {id: 'description', label: 'Item Description', show: true, align: 'left'},
      {id: 'qty', label: 'Qty', show: true, align: 'right'},
      {id: 'amount', label: 'Amount', show: true, align: 'right'},
    ],
    footer: 'Alpha Systems Salem - Authorized Distributor',
    isDefault: true,
  }, compA.cookie);
  assert.equal(templateRes.status, 200, JSON.stringify(templateRes.body));
  const compATemplateId = templateRes.body._id;
  tracked.templates.push(compATemplateId);
  console.log('✓ Company A created service catalogue and invoice template');

  // 11. Template revisions & single-default constraint
  const tplUpdateRes = await api('PUT', `/api/master/templates/${compATemplateId}`, {
    name: 'Alpha Standard Tax Invoice (Updated)',
    title: 'Tax Invoice & Receipt',
    paper: 'A4',
    orientation: 'portrait',
    fontSize: 12,
    accent: '#0d9488',
    borders: true,
    striped: true,
    logoPosition: 'center',
    fields: {logo: true, shopName: true, subtotal: true, grandTotal: true},
    columns: [
      {id: 'index', label: 'No.', show: true, align: 'center'},
      {id: 'description', label: 'Description', show: true, align: 'left'},
      {id: 'qty', label: 'Quantity', show: true, align: 'right'},
      {id: 'amount', label: 'Total', show: true, align: 'right'},
    ],
    footer: 'Thank you for choosing Alpha Systems',
    isDefault: true,
    expectedRevision: 1,
  }, compA.cookie);
  assert.equal(tplUpdateRes.status, 200);
  assert.equal(tplUpdateRes.body.currentRevision, 2);

  // Attempt to edit default template with isDefault: false (Must FAIL with 400)
  const unsetDefaultRes = await api('PUT', `/api/master/templates/${compATemplateId}`, {
    name: 'Alpha Standard Tax Invoice (Updated)',
    title: 'Tax Invoice & Receipt',
    paper: 'A4',
    orientation: 'portrait',
    fontSize: 12,
    accent: '#0d9488',
    borders: true,
    striped: true,
    logoPosition: 'center',
    fields: {logo: true, shopName: true, subtotal: true, grandTotal: true},
    columns: [
      {id: 'index', label: 'No.', show: true, align: 'center'},
      {id: 'description', label: 'Description', show: true, align: 'left'},
      {id: 'qty', label: 'Quantity', show: true, align: 'right'},
      {id: 'amount', label: 'Total', show: true, align: 'right'},
    ],
    footer: 'Footer',
    isDefault: false, // Trying to leave company with no default
    expectedRevision: 2,
  }, compA.cookie);
  assert.equal(unsetDefaultRes.status, 400, 'Company must maintain at least one default template');
  console.log('✓ Template revisions tracked immutably & single default guaranteed');

  // 12. Calendar Date Checks: Invalid dates must fail validation
  const invalidDateDraft = await api('PUT', '/api/master/opening/draft', {
    cutoffDate: '2026-99-99', // Invalid calendar date
    openingCashPaise: 100000,
    openingBankPaise: 100000,
    draftReceivables: [],
    draftPayables: [],
    draftStockLots: [],
  }, compA.cookie);
  assert.equal(invalidDateDraft.status, 400, 'Invalid calendar date 2026-99-99 must be rejected');

  const futureDateDraft = await api('PUT', '/api/master/opening/draft', {
    cutoffDate: '2026-09-01',
    openingCashPaise: 100000,
    openingBankPaise: 100000,
    draftReceivables: [
      {
        customerId: compACustomerId,
        reference: 'INV-FUT',
        date: '2026-09-15', // After cutoff date
        amountPaise: 50000,
      },
    ],
    draftPayables: [],
    draftStockLots: [],
  }, compA.cookie);
  assert.equal(futureDateDraft.status, 400, 'Document date after cutoff date must be rejected');
  console.log('✓ Calendar date rules and cutoff boundary validated');

  // 13. Opening setup: Draft saves must NOT post stock, serials or ledger entries
  const draftSetupData = {
    cutoffDate: '2026-09-01',
    openingCashPaise: 1500000,
    openingBankPaise: 10000000,
    draftReceivables: [
      {
        customerId: compACustomerId,
        reference: 'Old Inv #401',
        date: '2026-08-20',
        amountPaise: 850000,
        notes: 'Balance for office monitor',
      },
    ],
    draftPayables: [
      {
        supplierId: compASupplierId,
        reference: 'Apex Bill 9912',
        date: '2026-08-25',
        amountPaise: 2000000,
        notes: 'Credit purchase',
      },
    ],
    draftStockLots: [
      {
        productId: compAProd1Id,
        quantity: 2,
        unitCostPaise: 4500000,
        serials: ['LNV-9901', 'LNV-9902'],
      },
      {
        productId: compAProd2Id,
        quantity: 10,
        unitCostPaise: 25000,
        serials: [],
      },
    ],
  };

  const draftSaveRes = await api('PUT', '/api/master/opening/draft', draftSetupData, compA.cookie);
  assert.equal(draftSaveRes.status, 200, JSON.stringify(draftSaveRes.body));
  tracked.openingSetups.push(compA.tenantId);

  // Verify that draft save created ZERO stock movements, ZERO serial units, and ZERO opening receivables
  const draftMovCount = await db.collection('stockMovements').countDocuments({tenantId: compA.tenantId});
  const draftSerCount = await db.collection('serialUnits').countDocuments({tenantId: compA.tenantId});
  const draftRecCount = await db.collection('openingReceivables').countDocuments({tenantId: compA.tenantId});
  const draftAccCount = await db.collection('accountMovements').countDocuments({tenantId: compA.tenantId});
  assert.equal(draftMovCount, 0, 'Draft save must not create stock movements');
  assert.equal(draftSerCount, 0, 'Draft save must not create serial units');
  assert.equal(draftRecCount, 0, 'Draft save must not create receivables');
  assert.equal(draftAccCount, 0, 'Draft save must not create account ledger entries');
  console.log('✓ Draft opening setup saved without posting ledger or stock events');

  // 14. Finalize Opening Setup: Loads and finalizes the persisted draft; posts Cash & Bank account movements
  const finalizeRes = await api('POST', '/api/master/opening/finalize', {}, compA.cookie);
  assert.equal(finalizeRes.status, 200, JSON.stringify(finalizeRes.body));
  assert.equal(finalizeRes.body.status, 'Finalized');

  // Verify created opening records
  const postedReceivables = await db.collection('openingReceivables').find({tenantId: compA.tenantId}).toArray();
  const postedPayables = await db.collection('openingPayables').find({tenantId: compA.tenantId}).toArray();
  const postedLots = await db.collection('stockLots').find({tenantId: compA.tenantId}).toArray();
  const postedMovements = await db.collection('stockMovements').find({tenantId: compA.tenantId}).toArray();
  const postedSerials = await db.collection('serialUnits').find({tenantId: compA.tenantId}).toArray();
  const postedAccounts = await db.collection('accountMovements').find({tenantId: compA.tenantId}).toArray();

  assert.equal(postedReceivables.length, 1);
  assert.equal(postedPayables.length, 1);
  assert.equal(postedLots.length, 2);
  assert.equal(postedMovements.length, 2);
  assert.equal(postedSerials.length, 2);
  assert.equal(postedSerials[0].status, 'InStock');

  // Opening Cash & Bank ledger source records check
  assert.equal(postedAccounts.length, 2, 'Finalization must create Cash and Bank accountMovements');
  const cashMovement = postedAccounts.find((a) => a.account === 'Cash');
  const bankMovement = postedAccounts.find((a) => a.account === 'Bank');
  assert.ok(cashMovement && cashMovement.amountPaise === 1500000, 'Cash opening ledger entry created');
  assert.ok(bankMovement && bankMovement.amountPaise === 10000000, 'Bank opening ledger entry created');

  postedReceivables.forEach((r) => tracked.receivables.push(r._id));
  postedPayables.forEach((p) => tracked.payables.push(p._id));
  postedLots.forEach((l) => tracked.lots.push(l._id));
  postedMovements.forEach((m) => tracked.movements.push(m._id));
  postedSerials.forEach((s) => tracked.serials.push(s._id));
  postedAccounts.forEach((a) => tracked.accountMovements.push(a._id));

  // Verify repeated finalization is rejected
  const repeatFinalize = await api('POST', '/api/master/opening/finalize', {}, compA.cookie);
  assert.equal(repeatFinalize.status, 400, 'Repeated finalization must be rejected');

  // Verify modifying draft after finalization is rejected
  const postFinalizeDraft = await api('PUT', '/api/master/opening/draft', draftSetupData, compA.cookie);
  assert.equal(postFinalizeDraft.status, 400, 'Draft update after finalization must be rejected');
  console.log('✓ Opening setup finalized atomically with Cash/Bank ledger entries and permanently locked');

  // 15. Stock Adjustment Idempotency:
  // Submitting the same idempotencyKey must return existing record without duplicate stock or serials
  const adjKey = `IDEMP-${randomUUID()}`;
  const adj1 = await api('POST', `/api/master/products/${compAProd1Id}/adjust`, {
    delta: 1,
    serials: ['LNV-9903'],
    reason: 'Stock count addition',
    idempotencyKey: adjKey,
  }, compA.cookie);
  assert.equal(adj1.status, 200);
  tracked.movements.push(adj1.body.movementId);

  const adj2 = await api('POST', `/api/master/products/${compAProd1Id}/adjust`, {
    delta: 1,
    serials: ['LNV-9903'],
    reason: 'Stock count addition retry',
    idempotencyKey: adjKey,
  }, compA.cookie);
  assert.equal(adj2.status, 200);
  assert.equal(adj2.body.movementId, adj1.body.movementId, 'Idempotent retry must return existing movement');
  const lnv9903Count = await db.collection('serialUnits').countDocuments({tenantId: compA.tenantId, serialNormalized: 'lnv9903'});
  assert.equal(lnv9903Count, 1, 'Idempotent retry must not duplicate serial units');

  // Attempt to reuse same idempotencyKey with different delta must fail with 409 Conflict
  const adjConflict = await api('POST', `/api/master/products/${compAProd1Id}/adjust`, {
    delta: 2,
    serials: ['LNV-9903'],
    reason: 'Conflicting adjustment with same idempotency key',
    idempotencyKey: adjKey,
  }, compA.cookie);
  assert.equal(adjConflict.status, 409, 'Reusing idempotency key with different payload must return 409 Conflict');
  console.log('✓ Stock adjustment idempotency verified (retry returns existing; payload mismatch returns 409)');

  // 16. Serial Tracking Mode Lock:
  // Changing isSerialTracked when stock exists must be BLOCKED
  const changeTrackingRes = await api('PUT', `/api/master/products/${compAProd1Id}`, {
    name: 'Lenovo ThinkPad E14',
    category: 'Laptops',
    brand: 'Lenovo',
    condition: 'New',
    model: 'E14 Gen 4',
    hsn: '84713010',
    costPaise: 4500000,
    sellingPricePaise: 5500000,
    priceEntryMode: 'Inclusive',
    taxBasisPoints: 1800,
    low: 2,
    warranty: 12,
    isSerialTracked: false, // Attempting to turn OFF serial tracking while stock on hand
  }, compA.cookie);
  assert.equal(changeTrackingRes.status, 400, 'Cannot change serial tracking mode when product has stock on hand');
  console.log('✓ Serial tracking mode change locked when stock on hand exists');

  // 17. Serial Removal Lifecycle & Status:
  // Removing a serial with reason 'Defective' marks Defective; reason 'Sale' marks Removed
  const removeDefective = await api('POST', `/api/master/products/${compAProd1Id}/adjust`, {
    delta: -1,
    serials: ['LNV-9903'],
    reason: 'Defective screen',
  }, compA.cookie);
  assert.equal(removeDefective.status, 200);
  const defSerial = await db.collection('serialUnits').findOne({tenantId: compA.tenantId, serialNormalized: 'lnv9903'});
  assert.equal(defSerial.status, 'Defective');

  const removeSale = await api('POST', `/api/master/products/${compAProd1Id}/adjust`, {
    delta: -1,
    serials: ['LNV-9902'],
    reason: 'Customer sale',
  }, compA.cookie);
  assert.equal(removeSale.status, 200);
  const saleSerial = await db.collection('serialUnits').findOne({tenantId: compA.tenantId, serialNormalized: 'lnv9902'});
  assert.equal(saleSerial.status, 'Removed');

  // Re-entering removed serial restores InStock
  const restoreSerial = await api('POST', `/api/master/products/${compAProd1Id}/adjust`, {
    delta: 1,
    serials: ['LNV-9902'],
    reason: 'Restored from return',
  }, compA.cookie);
  assert.equal(restoreSerial.status, 200);
  const restored = await db.collection('serialUnits').findOne({tenantId: compA.tenantId, serialNormalized: 'lnv9902'});
  assert.equal(restored.status, 'InStock');
  console.log('✓ Serial removal lifecycle and reactivation verified');

  // 18. Partial Write Rollback Proof in Company B:
  // Set up product in Company B
  const compBProd = await api('POST', '/api/master/products', {
    name: 'Beta Workstation',
    category: 'Prebuilt PCs',
    brand: 'Custom',
    condition: 'New',
    model: 'WS-10',
    hsn: '84713010',
    costPaise: 5000000,
    sellingPricePaise: 6500000,
    priceEntryMode: 'Inclusive',
    taxBasisPoints: 1800,
    low: 1,
    warranty: 24,
    isSerialTracked: true,
  }, compB.cookie);
  assert.equal(compBProd.status, 200);
  tracked.products.push(compBProd.body._id);

  const compBCust = await api('POST', '/api/master/customers', {
    name: 'Beta Customer 1',
    phone: '9840011223',
  }, compB.cookie);
  assert.equal(compBCust.status, 200);
  tracked.customers.push(compBCust.body._id);

  // Save draft for Company B with a valid receivable + a stock lot with duplicate serials
  // In finalizeOpeningSetup, receivables & lot are written first, then duplicate serial insertion fails!
  await api('PUT', '/api/master/opening/draft', {
    cutoffDate: '2026-09-01',
    openingCashPaise: 500000,
    openingBankPaise: 1000000,
    draftReceivables: [
      {
        customerId: compBCust.body._id,
        reference: 'INV-B-1',
        date: '2026-08-15',
        amountPaise: 500000,
      },
    ],
    draftPayables: [],
    draftStockLots: [
      {
        productId: compBProd.body._id,
        quantity: 2,
        unitCostPaise: 5000000,
        serials: ['DUP-SER-01', 'DUP-SER-01'], // Duplicate serial triggers throw after partial write!
      },
    ],
  }, compB.cookie);
  tracked.openingSetups.push(compB.tenantId);

  const partialFailRes = await api('POST', '/api/master/opening/finalize', {}, compB.cookie);
  assert.equal(partialFailRes.status, 400, 'Duplicate serial in opening draft must fail finalization');

  // Verify rollback: Company B must have 0 opening receivables, payables, stock lots, or movements
  const compBLots = await db.collection('stockLots').countDocuments({tenantId: compB.tenantId});
  const compBMovs = await db.collection('stockMovements').countDocuments({tenantId: compB.tenantId});
  const compBRecs = await db.collection('openingReceivables').countDocuments({tenantId: compB.tenantId});
  const compBSerials = await db.collection('serialUnits').countDocuments({tenantId: compB.tenantId});
  const compBAccs = await db.collection('accountMovements').countDocuments({tenantId: compB.tenantId});

  assert.equal(compBLots, 0, 'Rollback must leave 0 opening lots after partial write failure');
  assert.equal(compBMovs, 0, 'Rollback must leave 0 opening movements after partial write failure');
  assert.equal(compBRecs, 0, 'Rollback must leave 0 opening receivables after partial write failure');
  assert.equal(compBSerials, 0, 'Rollback must leave 0 serial units after partial write failure');
  assert.equal(compBAccs, 0, 'Rollback must leave 0 account movements after partial write failure');
  console.log('✓ Transaction rollback after partial write verified (all writes reverted)');

  // 19. Cross-Company Reading & Probing: Company B attempts to read Company A records
  const probeCust = await api('GET', `/api/master/customers/${compACustomerId}`, null, compB.cookie);
  assert.equal(probeCust.status, 404, 'Company B should get 404 for Company A customer');

  const probeSupp = await api('GET', `/api/master/suppliers/${compASupplierId}`, null, compB.cookie);
  assert.equal(probeSupp.status, 404, 'Company B should get 404 for Company A supplier');

  const probeProd = await api('GET', `/api/master/products/${compAProd1Id}`, null, compB.cookie);
  assert.equal(probeProd.status, 404, 'Company B should get 404 for Company A product');

  const probeTpl = await api('GET', `/api/master/templates/${compATemplateId}`, null, compB.cookie);
  assert.equal(probeTpl.status, 404, 'Company B should get 404 for Company A template');

  const probeSrv = await api('GET', `/api/master/services/${compAServiceId}`, null, compB.cookie);
  assert.equal(probeSrv.status, 404, 'Company B should get 404 for Company A service');
  console.log('✓ Cross-company record access denied with 404 (zero existence leakage)');

  // 20. Pagination & Bounded Bootstrap Verification
  // Create additional customers in Company A to test pagination
  for (let c = 1; c <= 15; c++) {
    const res = await api('POST', '/api/master/customers', {
      name: `Pagination Customer ${c}`,
      phone: `99000${String(c).padStart(5, '0')}`,
    }, compA.cookie);
    if (res.status === 200) tracked.customers.push(res.body._id);
  }

  const page1Res = await api('GET', '/api/master/customers?page=1&limit=10', null, compA.cookie);
  assert.equal(page1Res.status, 200);
  assert.equal(page1Res.body.records.length, 10, 'Page 1 must return exactly 10 records');
  assert.ok(page1Res.body.total >= 17, 'Total records count must be accurate');
  assert.ok(page1Res.body.totalPages >= 2, 'Total pages must be at least 2');

  const page2Res = await api('GET', '/api/master/customers?page=2&limit=10', null, compA.cookie);
  assert.equal(page2Res.status, 200);
  assert.ok(page2Res.body.records.length > 0, 'Page 2 must return remaining records');

  // Verify bootstrap response is bounded
  const bootRes = await api('GET', '/api/master/bootstrap', null, compA.cookie);
  assert.equal(bootRes.status, 200);
  assert.ok(bootRes.body.firstCustomers.length <= 10, 'Bootstrap firstCustomers must be bounded to 10');
  assert.ok(bootRes.body.services.length <= 50, 'Bootstrap services must be bounded to 50');
  assert.ok(bootRes.body.templates.length <= 50, 'Bootstrap templates must be bounded to 50');
  console.log('✓ Server-side pagination and bounded bootstrap responses verified');

  // 21. Fresh-Company Demo Import Rule
  // Attempt demo import on Company A (already has master data) -> MUST FAIL with 400
  const importNonFresh = await api('POST', '/api/master/opening/import-demo', {}, compA.cookie);
  assert.equal(importNonFresh.status, 400, `Demo import on non-fresh company must be rejected: ${JSON.stringify(importNonFresh.body)}`);
  console.log('✓ Demo import freshness guard verified (rejected on non-fresh tenant)');

  // 22. Sanitized Versioned Export
  const aExport = await api('GET', '/api/master/export', null, compA.cookie);
  assert.equal(aExport.status, 200);
  assert.equal(aExport.body.version, 1);
  assert.equal(aExport.body.tenantId, undefined, 'Export root must not leak raw tenantId');
  assert.ok(aExport.body.customers.length > 0);
  for (const c of aExport.body.customers) {
    assert.equal(c.tenantId, undefined, 'Exported customer records must not leak internal tenantId');
  }
  console.log('✓ Master data export format is sanitized and versioned');

  // 23. Archival lifecycle: product with stock cannot be archived; 0-stock product archives cleanly
  const blockedArchive = await api('DELETE', `/api/master/products/${compAProd1Id}`, null, compA.cookie);
  assert.equal(blockedArchive.status, 400, 'Cannot archive product with stock on hand');

  const cleanArchive = await api('DELETE', `/api/master/products/${zeroValProductRes.body._id}`, null, compA.cookie);
  assert.equal(cleanArchive.status, 200, 'Zero-stock product can be archived');
  console.log('✓ Archival safety verified (stock-on-hand lock enforced)');

  // 24. Audit history integrity: Company A audit contains sanitized before/after entries and no secrets
  const auditRes = await api('GET', '/api/master/audit', null, compA.cookie);
  assert.equal(auditRes.status, 200);
  assert.ok(auditRes.body.records.length > 0, 'Company A must have audit records');
  for (const a of auditRes.body.records) {
    assert.equal(a.tenantId, compA.tenantId, 'Audit entries must belong to Company A');
    assert.ok(!JSON.stringify(a).includes('passwordHash'), 'Audit log must never leak password hashes');
    assert.ok(!JSON.stringify(a).includes('profitPassword'), 'Audit log must never leak profit passwords');
  }
  console.log('✓ Audit history verified: tenant-scoped and sanitized with no secrets');

  // 25. Opening Draft Reload & Bootstrap Hydration
  // GET /api/master/opening/draft and GET /api/master/opening both return opening status
  const draftGetRes = await api('GET', '/api/master/opening/draft', null, compA.cookie);
  assert.equal(draftGetRes.status, 200);
  assert.equal(draftGetRes.body.status, 'Finalized');
  assert.equal(draftGetRes.body.isFinalized, true);

  const openingGetRes = await api('GET', '/api/master/opening', null, compA.cookie);
  assert.equal(openingGetRes.status, 200);
  assert.equal(openingGetRes.body.status, 'Finalized');

  const bootCheckRes = await api('GET', '/api/master/bootstrap', null, compA.cookie);
  assert.equal(bootCheckRes.status, 200);
  assert.equal(bootCheckRes.body.openingStatus?.isFinalized, true, 'Bootstrap must hydrate openingStatus.isFinalized');
  console.log('✓ Opening draft reload endpoints and bootstrap hydration verified');

  // 26. Page-Two Record Detail Navigation
  // Fetch customer from page 2 and retrieve full details via GET-by-ID
  const page2CustRes = await api('GET', '/api/master/customers?page=2&limit=10', null, compA.cookie);
  assert.equal(page2CustRes.status, 200);
  assert.ok(page2CustRes.body.records.length > 0, 'Page 2 must contain records');
  const page2Cust = page2CustRes.body.records[0];
  const page2CustDetail = await api('GET', `/api/master/customers/${page2Cust._id}`, null, compA.cookie);
  assert.equal(page2CustDetail.status, 200);
  assert.equal(page2CustDetail.body.name, page2Cust.name);
  console.log('✓ Page-two navigation and GET-by-ID detail retrieval verified');

  // 27. Record Restore Workflow
  // Restore the previously archived zero-stock product
  const restoreRes = await api('POST', `/api/master/products/${zeroValProductRes.body._id}/restore`, {}, compA.cookie);
  assert.equal(restoreRes.status, 200);
  const restoredProd = await api('GET', `/api/master/products/${zeroValProductRes.body._id}`, null, compA.cookie);
  assert.equal(restoredProd.status, 200);
  assert.equal(restoredProd.body.status, 'Active', 'Restored product must be Active');
  // Re-archive it for clean state
  await api('DELETE', `/api/master/products/${zeroValProductRes.body._id}`, null, compA.cookie);
  console.log('✓ Master record restore workflow verified');

  console.log('\n======================================================');
  console.log('ALL PHASE 2 MULTI-TENANT ISOLATION CHECKS PASSED (27/27)');
  console.log('======================================================\n');
} finally {
  console.log('Cleaning up exact temporary test records...');
  // Collect all audit records created for the test tenants
  const auditA = await db.collection('auditHistory').find({tenantId: {$in: tracked.tenants}}).toArray();
  auditA.forEach((a) => tracked.auditIds.push(a._id));

  // Collect any remaining serials, lots, movements created for test tenants
  const ser = await db.collection('serialUnits').find({tenantId: {$in: tracked.tenants}}).toArray();
  ser.forEach((s) => tracked.serials.push(s._id));
  const lot = await db.collection('stockLots').find({tenantId: {$in: tracked.tenants}}).toArray();
  lot.forEach((l) => tracked.lots.push(l._id));
  const mov = await db.collection('stockMovements').find({tenantId: {$in: tracked.tenants}}).toArray();
  mov.forEach((m) => tracked.movements.push(m._id));
  const rev = await db.collection('templateRevisions').find({tenantId: {$in: tracked.tenants}}).toArray();
  rev.forEach((r) => tracked.templateRevisions.push(r._id));

  // Clean up private files on disk and db
  const root = path.resolve(process.env.PRIVATE_STORAGE_ROOT || 'D:/AI/itech-private-dev');
  for (const tenantId of tracked.tenants) {
    const dir = path.resolve(root, tenantId);
    if (dir.startsWith(root + path.sep)) {
      const recs = await db.collection('files').find({tenantId}).toArray();
      for (const r of recs) {
        const file = path.resolve(dir, r.key);
        if (file.startsWith(dir + path.sep)) {
          await unlink(file).catch(() => {});
        }
      }
      await rmdir(dir).catch(() => {});
    }
  }

  // Delete only exact tracked IDs
  await Promise.all([
    db.collection('authUsers').deleteMany({_id: {$in: tracked.users}}),
    db.collection('authAccounts').deleteMany({userId: {$in: tracked.users}}),
    db.collection('authSessions').deleteMany({userId: {$in: tracked.users}}),
    db.collection('tenants').deleteMany({_id: {$in: tracked.tenants}}),
    db.collection('companySettings').deleteMany({tenantId: {$in: tracked.tenants}}),
    db.collection('files').deleteMany({_id: {$in: tracked.files}}),
    db.collection('customers').deleteMany({_id: {$in: tracked.customers}}),
    db.collection('suppliers').deleteMany({_id: {$in: tracked.suppliers}}),
    db.collection('products').deleteMany({_id: {$in: tracked.products}}),
    db.collection('serviceCatalog').deleteMany({_id: {$in: tracked.services}}),
    db.collection('invoiceTemplates').deleteMany({_id: {$in: tracked.templates}}),
    db.collection('templateRevisions').deleteMany({_id: {$in: tracked.templateRevisions}}),
    db.collection('serialUnits').deleteMany({_id: {$in: tracked.serials}}),
    db.collection('stockLots').deleteMany({_id: {$in: tracked.lots}}),
    db.collection('stockMovements').deleteMany({_id: {$in: tracked.movements}}),
    db.collection('accountMovements').deleteMany({tenantId: {$in: tracked.tenants}}),
    db.collection('openingSetups').deleteMany({tenantId: {$in: tracked.openingSetups}}),
    db.collection('openingReceivables').deleteMany({_id: {$in: tracked.receivables}}),
    db.collection('openingPayables').deleteMany({_id: {$in: tracked.payables}}),
    db.collection('auditHistory').deleteMany({_id: {$in: tracked.auditIds}}),
  ]);

  await client.close();
  console.log('Cleanup completed successfully.');
}
