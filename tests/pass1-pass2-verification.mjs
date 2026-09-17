// Real Service & API End-to-End Verification Suite for Pass 1 and Pass 2
import {MongoClient, ObjectId} from 'mongodb';
import {hashPassword} from 'better-auth/crypto';
import assert from 'node:assert/strict';
import dns from 'node:dns';

process.env.DISABLE_AUTH_RATE_LIMIT = 'true';
process.env.NODE_ENV = 'test';
process.loadEnvFile('.env.local');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI not found in .env.local');

if (process.env.ENABLE_PUBLIC_DNS_OVERRIDE === 'true') {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

let client;
try {
  client = await new MongoClient(uri, {serverSelectionTimeoutMS: 15000}).connect();
} catch (err) {
  if (process.env.MONGODB_FALLBACK_URI) {
    console.log('Connecting via MONGODB_FALLBACK_URI...');
    client = await new MongoClient(process.env.MONGODB_FALLBACK_URI, {serverSelectionTimeoutMS: 15000}).connect();
  } else {
    throw err;
  }
}
const db = client.db(process.env.MONGODB_DB || 'itech_dev');
const base = 'http://127.0.0.1:3000';

const tracked = {
  tenants: [],
  users: [],
  accounts: [],
  settings: [],
  openingSetups: [],
  tenantAccountBalances: [],
  businessDayGates: [],
  idempotencyOperations: [],
  customers: [],
  suppliers: [],
  customerReceipts: [],
  customerAllocations: [],
  supplierPayments: [],
  supplierAllocations: [],
  accountMovements: [],
  auditHistory: [],
};

async function api(method, path, body, cookie) {
  const headers = {
    origin: base,
    'content-type': 'application/json',
  };
  if (cookie) headers.cookie = cookie;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return {
    status: res.status,
    headers: res.headers,
    body: parsed,
  };
}

async function cleanup() {
  console.log('\nCleaning up tracked test artifacts...');
  for (const tenantId of tracked.tenants) {
    await db.collection('tenants').deleteMany({_id: tenantId}).catch(() => {});
    await db.collection('authUsers').deleteMany({tenantId}).catch(() => {});
    await db.collection('authAccounts').deleteMany({userId: {$in: tracked.users.map(u => new ObjectId(u))}}).catch(() => {});
    await db.collection('companySettings').deleteMany({tenantId}).catch(() => {});
    await db.collection('openingSetups').deleteMany({tenantId}).catch(() => {});
    await db.collection('tenantAccountBalances').deleteMany({tenantId}).catch(() => {});
    await db.collection('businessDayGates').deleteMany({tenantId}).catch(() => {});
    await db.collection('idempotencyOperations').deleteMany({tenantId}).catch(() => {});
    await db.collection('customers').deleteMany({tenantId}).catch(() => {});
    await db.collection('suppliers').deleteMany({tenantId}).catch(() => {});
    await db.collection('customerReceipts').deleteMany({tenantId}).catch(() => {});
    await db.collection('customerAllocations').deleteMany({tenantId}).catch(() => {});
    await db.collection('supplierPayments').deleteMany({tenantId}).catch(() => {});
    await db.collection('supplierAllocations').deleteMany({tenantId}).catch(() => {});
    await db.collection('accountMovements').deleteMany({tenantId}).catch(() => {});
    await db.collection('auditHistory').deleteMany({tenantId}).catch(() => {});
  }
}

async function runPass1Pass2Verification() {
  console.log('=== Starting Pass 1 & Pass 2 Real Service & API Verification ===\n');

  try {
    const ts = Date.now();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const tenantId = `tenant-p12-${ts}`;
    const otherTenantId = `tenant-p12-other-${ts}`;
    tracked.tenants.push(tenantId, otherTenantId);

    const userId = new ObjectId();
    const otherUserId = new ObjectId();
    tracked.users.push(userId.toString(), otherUserId.toString());

    const email = `admin.p12.${ts}@example.com`;
    const otherEmail = `admin.other.${ts}@example.com`;
    const password = 'Password123!';
    const hashedPassword = await hashPassword(password);

    // Setup Tenant 1
    await db.collection('tenants').insertOne({
      _id: tenantId,
      name: 'P12 Verification Shop',
      companyName: 'P12 Verification Shop',
      verified: true,
      disabled: false,
      status: 'Active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.collection('authUsers').insertOne({
      _id: userId,
      tenantId,
      email,
      emailVerified: true,
      name: 'P12 Admin',
      phone: '9876543210',
      role: 'Admin',
      status: 'Active',
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
      tenantId,
      name: 'P12 Verification Shop',
      phone: '9876543210',
      email,
      address: '10 GST Road, Chennai',
      gst: '33ABCDE1234F1Z5',
      bank: 'HDFC Bank',
      account: '502000999999',
      ifsc: 'HDFC0001234',
      accountInitializationVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Setup Tenant 2 (for cross-tenant testing)
    await db.collection('tenants').insertOne({
      _id: otherTenantId,
      name: 'Other Tenant Shop',
      companyName: 'Other Tenant Shop',
      verified: true,
      disabled: false,
      status: 'Active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.collection('authUsers').insertOne({
      _id: otherUserId,
      tenantId: otherTenantId,
      email: otherEmail,
      emailVerified: true,
      name: 'Other Admin',
      phone: '9876543211',
      role: 'Admin',
      status: 'Active',
      verified: true,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.collection('authAccounts').insertOne({
      _id: new ObjectId(),
      userId: otherUserId,
      accountId: otherUserId.toString(),
      providerId: 'credential',
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Login as Tenant 1
    const loginRes = await api('POST', '/api/auth/sign-in/email', {email, password});
    assert.strictEqual(loginRes.status, 200, `Login for tenant 1 must succeed: ${JSON.stringify(loginRes.body)}`);
    const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
    const cookie1 = setCookies.map(c => c?.split(';')[0]).filter(Boolean).join('; ');

    // Login as Tenant 2
    const loginRes2 = await api('POST', '/api/auth/sign-in/email', {email: otherEmail, password});
    assert.strictEqual(loginRes2.status, 200, `Login for tenant 2 must succeed: ${JSON.stringify(loginRes2.body)}`);
    const setCookies2 = loginRes2.headers.getSetCookie ? loginRes2.headers.getSetCookie() : [loginRes2.headers.get('set-cookie')];
    const cookie2 = setCookies2.map(c => c?.split(';')[0]).filter(Boolean).join('; ');

    // Initialize OpeningSetup for Tenant 1: Cutoff 2026-09-10, Cash ₹50,000 (5,000,000 paise), Bank ₹100,000 (10,000,000 paise)
    await db.collection('openingSetups').insertOne({
      _id: tenantId,
      tenantId,
      status: 'Finalized',
      cutoffDate: '2026-09-10',
      openingCashPaise: 5000000,
      openingBankPaise: 10000000,
      finalizedAt: new Date(),
    });

    await db.collection('tenantAccountBalances').insertMany([
      {_id: `tab-cash-${tenantId}`, tenantId, account: 'Cash', balancePaise: 5000000, version: 1, updatedAt: new Date()},
      {_id: `tab-bank-${tenantId}`, tenantId, account: 'Bank', balancePaise: 10000000, version: 1, updatedAt: new Date()},
    ]);

    // Initialize OpeningSetup for Tenant 2 as well
    await db.collection('openingSetups').insertOne({
      _id: otherTenantId,
      tenantId: otherTenantId,
      status: 'Finalized',
      cutoffDate: '2026-09-10',
      openingCashPaise: 1000000,
      openingBankPaise: 2000000,
      finalizedAt: new Date(),
    });
    await db.collection('tenantAccountBalances').insertMany([
      {_id: `tab-cash-${otherTenantId}`, tenantId: otherTenantId, account: 'Cash', balancePaise: 1000000, version: 1, updatedAt: new Date()},
      {_id: `tab-bank-${otherTenantId}`, tenantId: otherTenantId, account: 'Bank', balancePaise: 2000000, version: 1, updatedAt: new Date()},
    ]);

    await db.collection('accountMovements').insertMany([
      {_id: `mov-open-cash-${ts}`, tenantId, date: '2026-09-10', account: 'Cash', qty: 5000000, amountPaise: 5000000, direction: 'In', category: 'OpeningBalance', sourceType: 'OpeningSetup', sourceId: tenantId, reason: 'Opening Cash Setup', reference: 'OPENING-SETUP', isReversed: false, createdAt: new Date()},
      {_id: `mov-open-bank-${ts}`, tenantId, date: '2026-09-10', account: 'Bank', qty: 10000000, amountPaise: 10000000, direction: 'In', category: 'OpeningBalance', sourceType: 'OpeningSetup', sourceId: tenantId, reason: 'Opening Bank Setup', reference: 'OPENING-SETUP', isReversed: false, createdAt: new Date()},
      {_id: `mov-open-cash-other-${ts}`, tenantId: otherTenantId, date: '2026-09-10', account: 'Cash', qty: 1000000, amountPaise: 1000000, direction: 'In', category: 'OpeningBalance', sourceType: 'OpeningSetup', sourceId: otherTenantId, reason: 'Opening Cash Setup', reference: 'OPENING-SETUP', isReversed: false, createdAt: new Date()},
      {_id: `mov-open-bank-other-${ts}`, tenantId: otherTenantId, date: '2026-09-10', account: 'Bank', qty: 2000000, amountPaise: 2000000, direction: 'In', category: 'OpeningBalance', sourceType: 'OpeningSetup', sourceId: otherTenantId, reason: 'Opening Bank Setup', reference: 'OPENING-SETUP', isReversed: false, createdAt: new Date()},
    ]);

    console.log('✓ Isolated test tenants configured and signed in.');

    // -------------------------------------------------------------
    // Test Case 1: Generic reversal rejects customer receipt and supplier payment
    // -------------------------------------------------------------
    console.log('\n[Case 1] Verifying generic reversal rejects customer receipts and supplier payments...');

    // Create a customer
    const custRes = await api('POST', '/api/master/customers', {
      name: 'Lakshmi Electronics',
      phone: '9840123456',
      email: 'lakshmi@example.com',
      address: '12 Main St, Chennai',
    }, cookie1);
    assert.strictEqual(custRes.status, 200, `Customer creation must succeed: ${JSON.stringify(custRes.body)}`);
    const customerId = custRes.body.customer?._id || custRes.body._id;

    // Record customer receipt via customer ledger API
    const custRcptRes = await api('POST', '/api/sales/receipts', {
      customerId,
      date: today,
      components: [{account: 'Cash', method: 'Cash', amountPaise: 100000}],
      allocations: [],
      recordExcessAsCustomerAdvance: true,
      notes: 'Advance receipt',
      idempotencyKey: `rcpt-${ts}-test1`,
    }, cookie1);
    assert.strictEqual(custRcptRes.status, 200, `Customer receipt must succeed: ${JSON.stringify(custRcptRes.body)}`);

    // Find the movement generated by customer receipt
    const custMov = await db.collection('accountMovements').findOne({
      tenantId,
      sourceType: 'CustomerReceipt',
    });
    assert.ok(custMov, 'Customer receipt movement must exist');

    // Attempt to reverse customer receipt via generic money reversal endpoint: MUST BE REJECTED!
    const revCustRes = await api('POST', `/api/money/${custMov._id}/reverse`, {
      reason: 'Attempted generic reversal of customer receipt',
      idempotencyKey: `rev-cust-${ts}`,
    }, cookie1);
    assert.strictEqual(revCustRes.status, 400, 'Generic reversal of customer receipt must fail with 400');
    assert.match(revCustRes.body.error, /respective workflow|generic money reversal/i);
    console.log('✓ Generic reversal correctly rejected customer receipt movement.');

    // Create a supplier and payment
    const supRes = await api('POST', '/api/master/suppliers', {
      name: 'Delta Distributing Ltd',
      phone: '9840999888',
      email: 'delta@example.com',
      address: '45 Trade St, Chennai',
      terms: 30,
    }, cookie1);
    assert.strictEqual(supRes.status, 200, `Supplier creation must succeed: ${JSON.stringify(supRes.body)}`);
    const supplierId = supRes.body.supplier?._id || supRes.body._id;

    const supPayRes = await api('POST', '/api/purchases/payments', {
      supplierId,
      date: today,
      components: [{account: 'Cash', method: 'Cash', amountPaise: 50000}],
      allocations: [],
      recordExcessAsAdvance: true,
      notes: 'Supplier advance payment',
      idempotencyKey: `pay-${ts}-test1`,
    }, cookie1);
    assert.strictEqual(supPayRes.status, 200, `Supplier payment must succeed: ${JSON.stringify(supPayRes.body)}`);

    const supMov = await db.collection('accountMovements').findOne({
      tenantId,
      sourceType: 'SupplierPayment',
    });
    assert.ok(supMov, 'Supplier payment movement must exist');

    // Attempt to reverse supplier payment via generic reversal endpoint: MUST BE REJECTED!
    const revSupRes = await api('POST', `/api/money/${supMov._id}/reverse`, {
      reason: 'Attempted generic reversal of supplier payment',
      idempotencyKey: `rev-sup-${ts}`,
    }, cookie1);
    assert.strictEqual(revSupRes.status, 400, 'Generic reversal of supplier payment must fail with 400');
    assert.match(revSupRes.body.error, /respective workflow|generic money reversal/i);
    console.log('✓ Generic reversal correctly rejected supplier payment movement.');

    // -------------------------------------------------------------
    // Test Case 2: Concurrent reversal with different keys applies once
    // -------------------------------------------------------------
    console.log('\n[Case 2] Verifying concurrent reversal with different keys applies once...');

    // Post an expense of ₹200 (20,000 paise) from Cash
    const expRes = await api('POST', '/api/money', {
      action: 'out',
      category: 'Expense',
      subCategory: 'TeaAndRefreshments',
      account: 'Cash',
      method: 'Cash',
      amountPaise: 20000,
      date: today,
      reason: 'Staff refreshments',
      idempotencyKey: `exp-${ts}-concur`,
    }, cookie1);
    assert.strictEqual(expRes.status, 200, `Expense must succeed: ${JSON.stringify(expRes.body)}`);
    const targetMovId = expRes.body.movementId;

    // Check balance after expense
    const cashDocAfterExp = await db.collection('tenantAccountBalances').findOne({tenantId, account: 'Cash'});
    const expBalance = cashDocAfterExp.balancePaise;

    // Fire two concurrent reversal requests with DIFFERENT keys
    const [raceA, raceB] = await Promise.all([
      api('POST', `/api/money/${targetMovId}/reverse`, {
        reason: 'Concurrent reversal attempt A',
        idempotencyKey: `rev-race-A-${ts}`,
      }, cookie1),
      api('POST', `/api/money/${targetMovId}/reverse`, {
        reason: 'Concurrent reversal attempt B',
        idempotencyKey: `rev-race-B-${ts}`,
      }, cookie1),
    ]);

    const statuses = [raceA.status, raceB.status].sort();
    assert.deepStrictEqual(
      statuses.includes(200),
      true,
      'At least one concurrent reversal attempt must succeed'
    );
    assert.strictEqual(
      statuses[1] >= 400,
      true,
      `The competing reversal attempt must fail with 400 or 409 (got ${statuses.join(', ')})`
    );

    // Verify balance was restored only ONCE (by exactly +20,000 paise)
    const cashDocAfterRev = await db.collection('tenantAccountBalances').findOne({tenantId, account: 'Cash'});
    assert.strictEqual(
      cashDocAfterRev.balancePaise,
      expBalance + 20000,
      'Balance must be credited exactly once; double compensation is blocked'
    );
    console.log('✓ Concurrent reversal race condition safely claimed and compensated exactly once.');

    // -------------------------------------------------------------
    // Test Case 3: Transfer reversal cannot be reversed one leg at a time
    // -------------------------------------------------------------
    console.log('\n[Case 3] Verifying transfer reversal claims and reverses both legs atomically...');

    const transRes = await api('POST', '/api/money', {
      action: 'transfer',
      fromAccount: 'Cash',
      toAccount: 'Bank',
      amountPaise: 50000, // ₹500
      date: today,
      reason: 'Deposit cash into bank',
      idempotencyKey: `trans-${ts}-pair`,
    }, cookie1);
    assert.strictEqual(transRes.status, 200, `Transfer must succeed: ${JSON.stringify(transRes.body)}`);

    const outLegId = transRes.body.outMovementId;
    const inLegId = transRes.body.inMovementId;

    // Reverse via outLegId
    const revTransRes = await api('POST', `/api/money/${outLegId}/reverse`, {
      reason: 'Reverse deposit mistake',
      idempotencyKey: `rev-trans-${ts}`,
    }, cookie1);
    assert.strictEqual(revTransRes.status, 200, `Transfer reversal must succeed: ${JSON.stringify(revTransRes.body)}`);

    // Verify in database: BOTH legs are marked isReversed === true!
    const [outDoc, inDoc] = await Promise.all([
      db.collection('accountMovements').findOne({_id: outLegId, tenantId}),
      db.collection('accountMovements').findOne({_id: inLegId, tenantId}),
    ]);
    assert.strictEqual(outDoc.isReversed, true, 'Out leg must be marked isReversed: true');
    assert.strictEqual(inDoc.isReversed, true, 'In leg must be marked isReversed: true');

    // Attempt to reverse the other leg (inLegId): MUST BE REJECTED as already reversed!
    const revLeg2 = await api('POST', `/api/money/${inLegId}/reverse`, {
      reason: 'Attempt second leg reversal',
      idempotencyKey: `rev-trans-leg2-${ts}`,
    }, cookie1);
    assert.strictEqual(revLeg2.status, 400, 'Reversing second leg must fail with 400 (already reversed)');
    console.log('✓ Transfer reversal claimed and reversed both reciprocal legs together.');

    // -------------------------------------------------------------
    // Test Case 4: Retry after successful commit but lost response
    // -------------------------------------------------------------
    console.log('\n[Case 4] Verifying idempotency exact replay returns cached response...');

    const postPayload = {
      action: 'in',
      category: 'OtherReceipt',
      subCategory: 'ScrapSale',
      account: 'Cash',
      method: 'Cash',
      amountPaise: 15000,
      date: today,
      reason: 'Cardboard box sale',
      idempotencyKey: `idemp-replay-${ts}`,
    };

    const firstPost = await api('POST', '/api/money', postPayload, cookie1);
    assert.strictEqual(firstPost.status, 200, 'Initial post must succeed');
    const firstMovementId = firstPost.body.movementId;

    // Retry exact request (simulating lost client response)
    const retryPost = await api('POST', '/api/money', postPayload, cookie1);
    assert.strictEqual(retryPost.status, 200, 'Retry must succeed with 200');
    assert.strictEqual(retryPost.body.movementId, firstMovementId, 'Retry must return the same movementId');

    // Verify no second document was created in DB
    const matchingDocs = await db.collection('accountMovements').find({
      tenantId,
      idempotencyKey: postPayload.idempotencyKey,
    }).toArray();
    assert.strictEqual(matchingDocs.length, 1, 'Only one database document must exist for this idempotency key');

    // Payload mismatch with same idempotency key must return 409
    const mismatchPost = await api('POST', '/api/money', {
      ...postPayload,
      amountPaise: 99999,
    }, cookie1);
    assert.strictEqual(mismatchPost.status, 409, 'Modified payload with reused key must fail with 409');
    console.log('✓ Idempotency exact replay returned original response and rejected payload mismatch.');

    // -------------------------------------------------------------
    // Test Case 5: Retry after business date changes/closes
    // -------------------------------------------------------------
    console.log('\n[Case 5] Verifying idempotency replay succeeds after business date closes...');

    const closedDateKey = `post-then-close-${ts}`;
    const dateToClose = today;

    const postBeforeClose = await api('POST', '/api/money', {
      action: 'in',
      category: 'OtherReceipt',
      subCategory: 'InterestReceived',
      account: 'Bank',
      method: 'BankTransfer',
      amountPaise: 75000,
      date: dateToClose,
      reason: 'Quarterly savings interest',
      idempotencyKey: closedDateKey,
    }, cookie1);
    assert.strictEqual(postBeforeClose.status, 200, 'Post on open date must succeed');

    // Close the business day through today in businessDayGates
    await db.collection('businessDayGates').updateOne(
      {_id: `DAY-${tenantId}`},
      {$set: {closedThrough: dateToClose, version: 999}},
      {upsert: true}
    );

    // Retry the completed operation after the day is closed: MUST SUCCEED (replaying cached result)
    const retryAfterClose = await api('POST', '/api/money', {
      action: 'in',
      category: 'OtherReceipt',
      subCategory: 'InterestReceived',
      account: 'Bank',
      method: 'BankTransfer',
      amountPaise: 75000,
      date: dateToClose,
      reason: 'Quarterly savings interest',
      idempotencyKey: closedDateKey,
    }, cookie1);
    assert.strictEqual(retryAfterClose.status, 200, 'Replay on closed date must return cached 200');
    assert.strictEqual(retryAfterClose.body.movementId, postBeforeClose.body.movementId);

    // Attempt a brand new posting on the closed date: MUST FAIL with 409!
    const newPostClosedDay = await api('POST', '/api/money', {
      action: 'in',
      category: 'OtherReceipt',
      subCategory: 'CommissionIncome',
      account: 'Bank',
      method: 'BankTransfer',
      amountPaise: 10000,
      date: dateToClose,
      reason: 'New commission attempt on closed date',
      idempotencyKey: `new-post-closed-${ts}`,
    }, cookie1);
    assert.strictEqual(newPostClosedDay.status, 409, 'New posting on closed date must be rejected with 409');
    console.log('✓ Idempotency replay succeeded after day closure while new posting was blocked.');

    // Reopen business day for remaining tests
    await db.collection('businessDayGates').updateOne(
      {_id: `DAY-${tenantId}`},
      {$set: {closedThrough: null}}
    );

    // -------------------------------------------------------------
    // Test Case 6: Legacy outgoing summary is correct (never counted in In)
    // -------------------------------------------------------------
    console.log('\n[Case 6] Verifying legacy outgoing movement summary calculation...');

    const legacyDate = '2026-09-14';
    // Insert a legacy outgoing movement with NO qty (only amountPaise and direction: 'Out')
    await db.collection('accountMovements').insertOne({
      _id: `legacy-out-${ts}`,
      tenantId,
      date: legacyDate,
      account: 'Cash',
      amountPaise: 18000, // ₹180
      direction: 'Out',
      category: 'Expense',
      reason: 'Legacy format shop repairs',
      isReversed: false,
      createdAt: new Date(),
    });

    const regRes = await api('GET', `/api/money?date=${legacyDate}`, undefined, cookie1);
    assert.strictEqual(regRes.status, 200);
    assert.strictEqual(regRes.body.filterSummary.totalInPaise, 0, 'totalInPaise must be 0 for legacy Out record');
    assert.strictEqual(regRes.body.filterSummary.totalOutPaise, 18000, 'totalOutPaise must be 18000');
    assert.strictEqual(regRes.body.filterSummary.netPaise, -18000, 'netPaise must be -18000');
    console.log('✓ Legacy outgoing record correctly categorized as Out; totalIn remained 0.');

    // -------------------------------------------------------------
    // Test Case 7: Historical opening and closing balances
    // -------------------------------------------------------------
    console.log('\n[Case 7] Verifying historical opening and closing balance calculation...');

    const histDate = '2026-09-13';
    const histReg = await api('GET', `/api/money?date=${histDate}`, undefined, cookie1);
    assert.strictEqual(histReg.status, 200);
    assert.ok(histReg.body.historicalPosition, 'Historical position must be populated for date query');
    assert.strictEqual(typeof histReg.body.historicalPosition.openingCashPaise, 'number');
    assert.strictEqual(typeof histReg.body.historicalPosition.expectedClosingCashPaise, 'number');
    assert.strictEqual(
      histReg.body.historicalPosition.expectedClosingCashPaise,
      histReg.body.historicalPosition.openingCashPaise +
        histReg.body.historicalPosition.dayCashInPaise -
        histReg.body.historicalPosition.dayCashOutPaise,
      'Closing cash position must equal Opening + In - Out'
    );
    console.log('✓ Historical opening and closing positions calculate accurately.');

    // -------------------------------------------------------------
    // Test Case 8: More than 100 register entries remain accessible
    // -------------------------------------------------------------
    console.log('\n[Case 8] Verifying pagination keeps >100 entries accessible...');

    const batchDate = '2026-09-15';
    const batchDocs = [];
    for (let i = 1; i <= 105; i++) {
      batchDocs.push({
        _id: `batch-mov-${ts}-${i}`,
        tenantId,
        date: batchDate,
        account: 'Cash',
        qty: 1000,
        amountPaise: 1000,
        direction: 'In',
        category: 'OtherReceipt',
        sourceType: 'ManualMoneyEntry',
        reason: `Bulk entry #${i}`,
        isReversed: false,
        createdAt: new Date(Date.now() + i * 1000),
      });
    }
    await db.collection('accountMovements').insertMany(batchDocs);

    // Fetch page 1 (limit 50)
    const p1 = await api('GET', `/api/money?date=${batchDate}&limit=50&page=1`, undefined, cookie1);
    assert.strictEqual(p1.status, 200);
    assert.strictEqual(p1.body.movements.length, 50, 'Page 1 must contain 50 rows');
    assert.strictEqual(p1.body.pagination.totalCount >= 105, true, 'Total count must be at least 105');
    assert.strictEqual(p1.body.pagination.totalPages >= 3, true, 'Total pages must be at least 3');

    // Fetch page 3 (limit 50)
    const p3 = await api('GET', `/api/money?date=${batchDate}&limit=50&page=3`, undefined, cookie1);
    assert.strictEqual(p3.status, 200);
    assert.strictEqual(p3.body.movements.length >= 5, true, 'Page 3 must contain remaining rows');
    console.log(`✓ Verified pagination: ${p1.body.pagination.totalCount} entries accessible across ${p1.body.pagination.totalPages} pages.`);

    // -------------------------------------------------------------
    // Test Case 9: Cross-tenant references are rejected
    // -------------------------------------------------------------
    console.log('\n[Case 9] Verifying cross-tenant references are rejected...');

    // Attempt to reverse Tenant 1's movement using Tenant 2's session
    const crossRev = await api('POST', `/api/money/${firstMovementId}/reverse`, {
      reason: 'Cross tenant reversal attempt',
      idempotencyKey: `rev-cross-${ts}`,
    }, cookie2);
    assert.strictEqual(crossRev.status, 404, 'Cross-tenant reversal target must not be accessible (404)');

    // Attempt to read Tenant 1's register from Tenant 2's session
    const crossReg = await api('GET', `/api/money?date=${batchDate}`, undefined, cookie2);
    assert.strictEqual(crossReg.status, 200);
    assert.strictEqual(crossReg.body.movements.length, 0, 'Tenant 2 cannot see Tenant 1 movements');
    console.log('✓ Cross-tenant boundaries strictly enforced on reads and reversals.');

    console.log('\n=== ALL PASS 1 & PASS 2 VERIFICATION CHECKS PASSED ===');
  } finally {
    await cleanup();
    await client.close();
  }
}

await runPass1Pass2Verification();
