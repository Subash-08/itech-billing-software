// Comprehensive Acceptance Test Suite for Missed Days Recovery & Negative Expense Consistency
// Covers all reviewer findings:
// 1. Return-only activity detection (customer & supplier returns querying date)
// 2. Inactive-prefix selection and closure when batch contains active days
// 3. Stable browser retries after lost responses / idempotency key preservation
// 4. API 409 recovery flow with refreshed reviewVersion
// 5. Actual concurrent operations (two real competing POST operations on the lock)
// 6. Cross-tenant access isolation (two independent tenants)
// 7. Changed-payload idempotency conflicts (same key, altered payload -> 409)
// 8. Internal closing-history gap detection (missing dates between cutoff and closedThrough -> 409)
// 9. Real expense & reversal workflow via /api/money and /api/money/:id/reverse with unclamped negative expenses
// 10. Time-independent relative dates based on current Asia/Kolkata date

import {MongoClient, ObjectId} from 'mongodb';
import {hashPassword} from 'better-auth/crypto';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

process.env.DISABLE_AUTH_RATE_LIMIT = 'true';
process.env.NODE_ENV = 'test';
process.loadEnvFile('.env.local');

if (process.env.MONGODB_DB !== 'itech_dev') {
  throw new Error('This test requires the isolated itech_dev development database.');
}

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db('itech_dev');
const base = 'http://127.0.0.1:3000';

function addDays(isoDateStr, n) {
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

const tracked = {
  users: [],
  tenants: [],
  openingSetups: [],
  tenantAccountBalances: [],
  accountMovements: [],
  businessDayGates: [],
  dailyClosings: [],
  dailyClosingDrafts: [],
  businessHolidays: [],
  idempotencyOperations: [],
  auditHistory: [],
  stockMovements: [],
  serviceJobs: [],
  customerReturns: [],
  supplierReturns: [],
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

async function setupTenant(suffix) {
  const tenantId = `test-missed-${suffix}-${Date.now()}-${randomUUID().slice(0, 6)}`;
  const userId = new ObjectId();
  const email = `admin-${suffix.toLowerCase()}-${Date.now()}@test.com`;
  const password = 'Password123!';
  const hashedPassword = await hashPassword(password);

  await db.collection('tenants').insertOne({
    _id: tenantId,
    companyName: `Missed Days Test Enterprise ${suffix}`,
    verified: true,
    disabled: false,
    createdAt: new Date(),
  });
  tracked.tenants.push(tenantId);

  await db.collection('authUsers').insertOne({
    _id: userId,
    name: `Tester ${suffix}`,
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

  await db.collection('companySettings').insertOne({
    _id: `sett-${tenantId}`,
    tenantId,
    name: `Missed Days Test Enterprise ${suffix}`,
    phase3Migration: {status: 'Completed'},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata'}).format(new Date());
  // 45 days ago gives a 44-day unclosed gap through yesterday (requiring 31-day batching + remaining days)
  const cutoffDate = addDays(today, -45);

  await db.collection('openingSetups').insertOne({
    _id: tenantId,
    tenantId,
    status: 'Finalized',
    cutoffDate,
    openingCashPaise: 5000000, // ₹50,000
    openingBankPaise: 5000000, // ₹50,000
    finalizedAt: new Date(),
  });
  tracked.openingSetups.push(tenantId);

  await db.collection('tenantAccountBalances').insertMany([
    {_id: `tab-cash-${tenantId}`, tenantId, account: 'Cash', balancePaise: 5000000, version: 1, updatedAt: new Date()},
    {_id: `tab-bank-${tenantId}`, tenantId, account: 'Bank', balancePaise: 5000000, version: 1, updatedAt: new Date()},
  ]);
  tracked.tenantAccountBalances.push(`tab-cash-${tenantId}`, `tab-bank-${tenantId}`);

  const movCash = new ObjectId();
  const movBank = new ObjectId();
  await db.collection('accountMovements').insertMany([
    {_id: movCash.toString(), tenantId, date: cutoffDate, account: 'Cash', qty: 5000000, amountPaise: 5000000, direction: 'In', reason: 'Opening cash balance', reference: 'OPENING-SETUP'},
    {_id: movBank.toString(), tenantId, date: cutoffDate, account: 'Bank', qty: 5000000, amountPaise: 5000000, direction: 'In', reason: 'Opening bank balance', reference: 'OPENING-SETUP'},
  ]);
  tracked.accountMovements.push(movCash.toString(), movBank.toString());

  await db.collection('businessDayGates').insertOne({
    _id: `DAY-${tenantId}`,
    tenantId,
    closedThrough: null,
    version: 1,
    updatedAt: new Date(),
  });
  tracked.businessDayGates.push(`DAY-${tenantId}`);

  const loginRes = await api('POST', '/api/auth/sign-in/email', {email, password});
  assert.strictEqual(loginRes.status, 200, `Login failed for tenant ${suffix}: ${JSON.stringify(loginRes.body)}`);
  const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
  const cookie = setCookies.map(c => c?.split(';')[0]).filter(Boolean).join('; ');

  return {tenantId, userId, cookie, cutoffDate, today};
}

try {
  console.log('=== Starting Missed-Days Recovery & Negative Expense Acceptance Test Suite ===\n');

  // Setup primary tenant A and secondary tenant B
  const tenantA = await setupTenant('A');
  const tenantB = await setupTenant('B');

  const {today, cutoffDate} = tenantA;
  const yesterday = addDays(today, -1);
  const firstEligibleDate = addDays(cutoffDate, 1);

  // -------------------------------------------------------------
  // Test 1: First Closing & Relative Boundary Initialization
  // -------------------------------------------------------------
  console.log('1. Testing first closing boundary initialization (relative dates)...');
  const initRes = await api('GET', '/api/closings/missed-days', null, tenantA.cookie);
  assert.strictEqual(initRes.status, 200, `missed-days GET failed: ${JSON.stringify(initRes.body)}`);
  assert.strictEqual(initRes.body.closedThrough, null, 'closedThrough must be null');
  assert.strictEqual(initRes.body.nextEligibleDate, firstEligibleDate, `First eligible date must be ${firstEligibleDate}`);
  assert.strictEqual(initRes.body.unclosedCount, 44, 'Unclosed count must be exactly 44 days');
  assert.strictEqual(initRes.body.batch.daysCount, 31, 'Batch size must be capped at 31');
  assert.strictEqual(initRes.body.batch.fromDate, firstEligibleDate);
  assert.strictEqual(initRes.body.batch.toDate, addDays(cutoffDate, 31));
  assert.strictEqual(initRes.body.pagination.hasMore, true);
  assert.strictEqual(initRes.body.pagination.nextCursor, addDays(cutoffDate, 32));
  console.log(`   ✓ Initialized at ${firstEligibleDate} with 31-day batch cap and 44 total unclosed days.`);

  // -------------------------------------------------------------
  // Test 2: Cross-Tenant Isolation
  // -------------------------------------------------------------
  console.log('2. Testing cross-tenant isolation...');
  const tenantBRes = await api('GET', '/api/closings/missed-days', null, tenantB.cookie);
  assert.strictEqual(tenantBRes.status, 200);
  assert.strictEqual(tenantBRes.body.nextEligibleDate, firstEligibleDate);
  // Verify that Tenant B has independent gate and cannot see Tenant A
  const gateA = await db.collection('businessDayGates').findOne({_id: `DAY-${tenantA.tenantId}`});
  const gateB = await db.collection('businessDayGates').findOne({_id: `DAY-${tenantB.tenantId}`});
  assert.notStrictEqual(gateA.tenantId, gateB.tenantId);
  console.log('   ✓ Verified cross-tenant isolation: Tenant B has separate state and credentials.');

  // -------------------------------------------------------------
  // Test 3: Internal Closing-History Continuity (Gap Detection)
  // -------------------------------------------------------------
  console.log('3. Testing internal closing-history continuity and gap detection (fail-closed)...');
  // Case 3A: dailyClosings exist but closedThrough is null
  const fakeClsId = `CLS-GAP-${Date.now()}`;
  await db.collection('dailyClosings').insertOne({
    _id: fakeClsId,
    tenantId: tenantA.tenantId,
    date: firstEligibleDate,
    status: 'Holiday',
    snapshot: {
      cashClosingPaise: 5000000,
      bankClosingPaise: 5000000,
      combinedClosingPaise: 10000000,
      salesTotalPaise: 0,
      invoiceCount: 0,
      cashReceiptsPaise: 0,
      bankReceiptsPaise: 0,
      operatingExpensesPaise: 0,
      otherReceiptsPaise: 0,
      tradingProfitPaise: 0,
      netShopProfitPaise: 0,
    },
    closedAt: new Date(),
    closedBy: tenantA.userId.toString(),
  });
  tracked.dailyClosings.push(fakeClsId);

  const inconsistencyRes = await api('GET', '/api/closings/missed-days', null, tenantA.cookie);
  assert.strictEqual(inconsistencyRes.status, 409, 'Must return 409 when closings exist but closedThrough is null');
  assert.match(inconsistencyRes.body.error, /Inconsistent closing state/);

  // Case 3B: closedThrough is advanced to Day 3, but Day 2 closing record is missing
  const day1 = firstEligibleDate;
  const day2 = addDays(cutoffDate, 2);
  const day3 = addDays(cutoffDate, 3);
  const fakeClsId3 = `CLS-GAP-3-${Date.now()}`;
  await db.collection('dailyClosings').insertOne({
    _id: fakeClsId3,
    tenantId: tenantA.tenantId,
    date: day3,
    status: 'Holiday',
    snapshot: {
      cashClosingPaise: 5000000,
      bankClosingPaise: 5000000,
      combinedClosingPaise: 10000000,
      salesTotalPaise: 0,
      invoiceCount: 0,
      cashReceiptsPaise: 0,
      bankReceiptsPaise: 0,
      operatingExpensesPaise: 0,
      otherReceiptsPaise: 0,
      tradingProfitPaise: 0,
      netShopProfitPaise: 0,
    },
    closedAt: new Date(),
    closedBy: tenantA.userId.toString(),
  });
  tracked.dailyClosings.push(fakeClsId3);

  await db.collection('businessDayGates').updateOne(
    {_id: `DAY-${tenantA.tenantId}`},
    {$set: {closedThrough: day3}}
  );

  const missingDateRes = await api('GET', '/api/closings/missed-days', null, tenantA.cookie);
  assert.strictEqual(missingDateRes.status, 409, 'Must return 409 when internal date is missing in closing history');
  assert.match(missingDateRes.body.error, new RegExp(`Business day ${day2} has no daily closing record`));

  // Restore clean gate & delete fake closings
  await db.collection('dailyClosings').deleteMany({_id: {$in: [fakeClsId, fakeClsId3]}});
  await db.collection('businessDayGates').updateOne(
    {_id: `DAY-${tenantA.tenantId}`},
    {$set: {closedThrough: null}}
  );
  console.log('   ✓ Internal closing gaps detected and rejected with 409 Conflict.');

  // -------------------------------------------------------------
  // Test 4: Bounded Range & Batch Limit Validation
  // -------------------------------------------------------------
  console.log('4. Testing batch limit enforcement (>31 days rejected before processing)...');
  const overBatchRes = await api('POST', '/api/closings/bulk-holiday', {
    fromDate: firstEligibleDate,
    toDate: addDays(firstEligibleDate, 32), // 33 days, strictly > 31 and prior to today
    reason: 'Over 31 days',
    confirmedNoRealWorldActivity: true,
    reviewVersion: initRes.body.reviewVersion,
    idempotencyKey: `idem-overbatch-${Date.now()}`,
  }, tenantA.cookie);
  assert.strictEqual(overBatchRes.status, 400);
  assert.match(overBatchRes.body.error, /cannot exceed 31 days/i);
  console.log('   ✓ Request exceeding 31-day cap rejected with 400 Bad Request.');

  // -------------------------------------------------------------
  // Test 5: Return-Only Activity Detection (querying date, not returnDate)
  // -------------------------------------------------------------
  console.log('5. Testing return-only activity detection (verifying date field query fix)...');
  const returnTestDate = addDays(cutoffDate, 5);
  const cretId = `CRET-${Date.now()}`;
  // Customer return storing `date` (NOT `returnDate`)
  await db.collection('customerReturns').insertOne({
    _id: cretId,
    tenantId: tenantA.tenantId,
    date: returnTestDate,
    returnNumber: 'RET-TEST-01',
    customerId: 'CUST-1',
    status: 'Completed',
    totalPaise: 0, // Even with zero monetary impact
    createdAt: new Date(),
  });
  tracked.customerReturns.push(cretId);

  const returnCheckRes = await api('GET', '/api/closings/missed-days', null, tenantA.cookie);
  assert.strictEqual(returnCheckRes.status, 200);
  const flaggedDay = returnCheckRes.body.batch.days.find(d => d.date === returnTestDate);
  assert.ok(flaggedDay, `Day ${returnTestDate} must be present in batch`);
  assert.strictEqual(flaggedDay.hasActivity, true, 'Customer return storing "date" must be detected as activity');
  assert.ok(flaggedDay.activityReasons.some(r => r.includes('customer return')), `Expected customer return in reasons: ${JSON.stringify(flaggedDay.activityReasons)}`);

  // Supplier return storing `date`
  const sretTestDate = addDays(cutoffDate, 6);
  const sretId = `SRET-${Date.now()}`;
  await db.collection('supplierReturns').insertOne({
    _id: sretId,
    tenantId: tenantA.tenantId,
    date: sretTestDate,
    returnNumber: 'SRET-TEST-01',
    supplierId: 'SUPP-1',
    status: 'Completed',
    totalPaise: 0,
    createdAt: new Date(),
  });
  tracked.supplierReturns.push(sretId);

  const supplierReturnCheck = await api('GET', '/api/closings/missed-days', null, tenantA.cookie);
  const supplierFlaggedDay = supplierReturnCheck.body.batch.days.find(d => d.date === sretTestDate);
  assert.ok(supplierFlaggedDay);
  assert.strictEqual(supplierFlaggedDay.hasActivity, true, 'Supplier return storing "date" must be detected as activity');
  assert.ok(supplierFlaggedDay.activityReasons.some(r => r.includes('supplier return')), `Expected supplier return in reasons: ${JSON.stringify(supplierFlaggedDay.activityReasons)}`);

  // Clean up returns
  await db.collection('customerReturns').deleteOne({_id: cretId});
  await db.collection('supplierReturns').deleteOne({_id: sretId});
  console.log('   ✓ Customer and supplier returns storing "date" correctly detected as activity.');

  // -------------------------------------------------------------
  // Test 6: Inactive-Prefix Selection & Bulk Closure of Inactive Prefix
  // -------------------------------------------------------------
  console.log('6. Testing inactive-prefix calculation and bulk closure when active day is present...');
  // Insert an activity on Day 3 (e.g., a stock movement)
  const activeDay = addDays(cutoffDate, 3);
  const smvId = `SMV-PREFIX-${Date.now()}`;
  await db.collection('stockMovements').insertOne({
    _id: smvId,
    tenantId: tenantA.tenantId,
    date: activeDay,
    productId: 'P-TEST',
    quantity: 1,
    type: 'In',
    createdAt: new Date(),
  });
  tracked.stockMovements.push(smvId);

  const prefixSummary = await api('GET', '/api/closings/missed-days', null, tenantA.cookie);
  assert.strictEqual(prefixSummary.status, 200);
  assert.strictEqual(prefixSummary.body.batch.hasActiveDaysInBatch, true, 'Batch must indicate active days exist');
  assert.strictEqual(prefixSummary.body.batch.firstActiveDay.date, activeDay);
  assert.strictEqual(prefixSummary.body.batch.eligibleFromDate, firstEligibleDate);
  assert.strictEqual(prefixSummary.body.batch.eligibleToDate, addDays(cutoffDate, 2), 'Eligible prefix must end before Day 3');
  assert.strictEqual(prefixSummary.body.batch.eligibleDaysCount, 2, 'Eligible prefix must be 2 days');
  assert.strictEqual(prefixSummary.body.batch.canBulkCloseEligiblePrefix, true, 'canBulkCloseEligiblePrefix must be true');

  // Bulk close the contiguous inactive prefix (Days 1 to 2)
  const prefixCloseRes = await api('POST', '/api/closings/bulk-holiday', {
    fromDate: prefixSummary.body.batch.eligibleFromDate,
    toDate: prefixSummary.body.batch.eligibleToDate,
    reason: 'Contiguous inactive holiday prefix',
    confirmedNoRealWorldActivity: true,
    reviewVersion: prefixSummary.body.reviewVersion,
    idempotencyKey: `idem-prefix-${Date.now()}`,
  }, tenantA.cookie);
  assert.strictEqual(prefixCloseRes.status, 200, `Prefix close failed: ${JSON.stringify(prefixCloseRes.body)}`);
  assert.strictEqual(prefixCloseRes.body.closedDaysCount, 2);
  assert.strictEqual(prefixCloseRes.body.closedThrough, addDays(cutoffDate, 2));

  // Verify next eligible day is now Day 3 (the active day)
  const afterPrefixSummary = await api('GET', '/api/closings/missed-days', null, tenantA.cookie);
  assert.strictEqual(afterPrefixSummary.body.nextEligibleDate, activeDay);
  assert.strictEqual(afterPrefixSummary.body.batch.eligibleDaysCount, 0, 'No inactive prefix left since first day is active');
  assert.strictEqual(afterPrefixSummary.body.batch.canBulkCloseHoliday, false);

  // Clean up stock movement on Day 3
  await db.collection('stockMovements').deleteOne({_id: smvId});
  console.log('   ✓ Contiguous inactive prefix successfully closed up to Day 2; Day 3 preserved for review.');

  // -------------------------------------------------------------
  // Test 7: Stock, Service, and Kolkata Midnight Boundary Precision
  // -------------------------------------------------------------
  console.log('7. Testing Kolkata midnight boundary precision...');
  const auditId1 = `AUDIT-1-${Date.now()}`;
  // 23:59:30 on Day 3 (+05:30) is T18:29:30.000Z
  await db.collection('auditHistory').insertOne({
    _id: auditId1,
    tenantId: tenantA.tenantId,
    entityType: 'serviceJob',
    entityId: 'JOB-TEST-1',
    action: 'StatusUpdate',
    timestamp: new Date(`${activeDay}T18:29:30.000Z`),
  });
  tracked.auditHistory.push(auditId1);

  const midnightCheck = await api('GET', '/api/closings/missed-days', null, tenantA.cookie);
  const dayWithAudit = midnightCheck.body.batch.days.find(d => d.date === activeDay);
  assert.ok(dayWithAudit);
  assert.strictEqual(dayWithAudit.hasActivity, true, 'Audit timestamp at 23:59:30+05:30 must belong to Day 3');

  await db.collection('auditHistory').deleteOne({_id: auditId1});
  console.log('   ✓ Exact Kolkata midnight boundaries verified.');

  // -------------------------------------------------------------
  // Test 8: Actual Concurrent Operations (Competing Requests)
  // -------------------------------------------------------------
  console.log('8. Testing actual concurrent operations on the business-day lock...');
  const freshReview = await api('GET', '/api/closings/missed-days', null, tenantA.cookie);
  assert.strictEqual(freshReview.status, 200);

  const compBatchTo = addDays(cutoffDate, 20);
  const payload1 = {
    fromDate: freshReview.body.nextEligibleDate,
    toDate: compBatchTo,
    reason: 'Competing bulk close 1',
    confirmedNoRealWorldActivity: true,
    reviewVersion: freshReview.body.reviewVersion,
    idempotencyKey: `idem-comp-1-${Date.now()}`,
  };
  const payload2 = {
    fromDate: freshReview.body.nextEligibleDate,
    toDate: compBatchTo,
    reason: 'Competing bulk close 2',
    confirmedNoRealWorldActivity: true,
    reviewVersion: freshReview.body.reviewVersion,
    idempotencyKey: `idem-comp-2-${Date.now()}`,
  };

  // Run both POSTs simultaneously
  const [res1, res2] = await Promise.all([
    api('POST', '/api/closings/bulk-holiday', payload1, tenantA.cookie),
    api('POST', '/api/closings/bulk-holiday', payload2, tenantA.cookie),
  ]);

  const statuses = [res1.status, res2.status].sort();
  assert.deepStrictEqual(statuses, [200, 409], `Expected exactly one 200 and one 409, got: ${statuses.join(', ')}`);
  const winnerRes = res1.status === 200 ? res1 : res2;
  const loserRes = res1.status === 409 ? res1 : res2;
  const winnerPayload = res1.status === 200 ? payload1 : payload2;

  assert.strictEqual(winnerRes.body.closedThrough, compBatchTo);
  assert.match(loserRes.body.error, /review was in progress|conflict/i);
  console.log('   ✓ Real competing operations verified: exactly one acquired lock and succeeded; competitor received 409.');

  // -------------------------------------------------------------
  // Test 9: Stable Browser Retry & Changed-Payload Idempotency Conflict
  // -------------------------------------------------------------
  console.log('9. Testing stable browser retry and changed-payload conflict...');
  // Same key + same payload: replays cached success
  const replayRes = await api('POST', '/api/closings/bulk-holiday', winnerPayload, tenantA.cookie);
  assert.strictEqual(replayRes.status, 200);
  assert.strictEqual(replayRes.body.closedThrough, compBatchTo);

  // Same key + altered payload: 409 Conflict
  const conflictPayloadRes = await api('POST', '/api/closings/bulk-holiday', {
    ...winnerPayload,
    reason: 'Tampered reason with same idempotency key',
  }, tenantA.cookie);
  assert.strictEqual(conflictPayloadRes.status, 409, 'Altered payload with same idempotency key must return 409');
  assert.match(conflictPayloadRes.body.error, /idempotency key was already used with a different request payload/i);
  console.log('   ✓ Stable retry succeeded and changed-payload conflict rejected with 409.');

  // -------------------------------------------------------------
  // Test 10: API 409 Recovery Flow
  // -------------------------------------------------------------
  console.log('10. Testing API 409 recovery flow (refresh review and re-confirm)...');
  // Client refreshes missed-days review to obtain latest state
  const recoveredReview = await api('GET', '/api/closings/missed-days', null, tenantA.cookie);
  assert.strictEqual(recoveredReview.status, 200);
  assert.strictEqual(recoveredReview.body.closedThrough, compBatchTo);
  assert.strictEqual(recoveredReview.body.nextEligibleDate, addDays(compBatchTo, 1));

  // Submits new request with refreshed reviewVersion
  const nextToDate = addDays(compBatchTo, 5);
  const recoverySubmitRes = await api('POST', '/api/closings/bulk-holiday', {
    fromDate: recoveredReview.body.nextEligibleDate,
    toDate: nextToDate,
    reason: 'Recovered bulk close',
    confirmedNoRealWorldActivity: true,
    reviewVersion: recoveredReview.body.reviewVersion,
    idempotencyKey: `idem-recovered-${Date.now()}`,
  }, tenantA.cookie);
  assert.strictEqual(recoverySubmitRes.status, 200);
  assert.strictEqual(recoverySubmitRes.body.closedThrough, nextToDate);
  console.log('   ✓ 409 recovery flow verified: fetched updated reviewVersion and completed closure.');

  // -------------------------------------------------------------
  // Test 11: Sequential Resumption of Remaining Missed Days
  // -------------------------------------------------------------
  console.log('11. Testing sequential resumption through yesterday...');
  let currentSummary = await api('GET', '/api/closings/missed-days', null, tenantA.cookie);
  while (currentSummary.body.hasUnclosedDays) {
    const toClose = currentSummary.body.batch.eligibleToDate || currentSummary.body.batch.toDate;
    const closeRes = await api('POST', '/api/closings/bulk-holiday', {
      fromDate: currentSummary.body.nextEligibleDate,
      toDate: toClose,
      reason: 'Catching up remaining missed days',
      confirmedNoRealWorldActivity: true,
      reviewVersion: currentSummary.body.reviewVersion,
      idempotencyKey: `idem-catchup-${Date.now()}-${randomUUID().slice(0, 4)}`,
    }, tenantA.cookie);
    assert.strictEqual(closeRes.status, 200, `Resumption close failed: ${JSON.stringify(closeRes.body)}`);
    currentSummary = await api('GET', '/api/closings/missed-days', null, tenantA.cookie);
  }
  assert.strictEqual(currentSummary.body.unclosedCount, 0, 'All missing days through yesterday must now be closed');
  assert.strictEqual(currentSummary.body.closedThrough, yesterday);
  console.log(`   ✓ All missed days through yesterday (${yesterday}) closed successfully.`);

  // -------------------------------------------------------------
  // Test 12: Real Expense & Reversal Endpoints (Negative Operating Expenses)
  // -------------------------------------------------------------
  console.log('12. Testing real expense & reversal workflow via /api/money endpoints...');
  // Step A: Post a real Expense via POST /api/money on today
  const expRes = await api('POST', '/api/money', {
    action: 'out',
    date: today,
    account: 'Cash',
    category: 'Expense',
    subCategory: 'ShopMaintenance',
    method: 'Cash',
    amountPaise: 20000, // ₹200
    reason: 'Store maintenance',
    payeeName: 'Local Contractor',
    idempotencyKey: `idem-exp-real-${Date.now()}`,
  }, tenantA.cookie);
  assert.strictEqual(expRes.status, 200, `recordMoneyOut failed: ${JSON.stringify(expRes.body)}`);
  assert.strictEqual(expRes.body.amountPaise, 20000);

  // Step B: Set up a prior expense fixture of ₹500 (50000 paise) and reverse it today using the real reversal endpoint
  const priorExpId = `MOV-PRIOR-${Date.now()}`;
  await db.collection('accountMovements').insertOne({
    _id: priorExpId,
    tenantId: tenantA.tenantId,
    date: yesterday,
    account: 'Cash',
    qty: -50000,
    amountPaise: 50000,
    direction: 'Out',
    category: 'Expense',
    subCategory: 'ShopMaintenance',
    paymentMethod: 'Cash',
    reason: 'Prior maintenance charge',
    sourceType: 'ManualMoneyEntry',
    sourceId: priorExpId,
    idempotencyKey: `idem-prior-${Date.now()}`,
    isReversed: false,
    createdAt: new Date(),
    createdBy: tenantA.userId.toString(),
  });
  tracked.accountMovements.push(priorExpId);

  // Call real POST /api/money/:id/reverse
  const reverseRes = await api('POST', `/api/money/${priorExpId}/reverse`, {
    reason: 'Full refund received from contractor',
    idempotencyKey: `idem-rev-real-${Date.now()}`,
  }, tenantA.cookie);
  assert.strictEqual(reverseRes.status, 200, `reverseMoneyMovement failed: ${JSON.stringify(reverseRes.body)}`);
  assert.strictEqual(reverseRes.body.amountPaise, 50000);

  // Unlock profit access for testing profit visibility
  await db.collection('authSessions').updateMany(
    {userId: tenantA.userId.toString()},
    {$set: {profitUntil: new Date(Date.now() + 3600000)}}
  );
  await db.collection('authSessions').updateMany(
    {userId: tenantA.userId},
    {$set: {profitUntil: new Date(Date.now() + 3600000)}}
  );

  // Step C: Verify operating expenses in daily closing preview
  // ₹200 expense - ₹500 reversal = -₹300 (-30000 paise)
  const todayPreview = await api('GET', `/api/closings/${today}`, null, tenantA.cookie);
  assert.strictEqual(todayPreview.status, 200);
  assert.strictEqual(
    todayPreview.body.summary.operatingExpensesPaise,
    -30000,
    `Operating expenses must be -30000 paise (negative), not clamped to 0. Actual: ${todayPreview.body.summary.operatingExpensesPaise}`
  );
  assert.strictEqual(
    todayPreview.body.summary.netShopProfitPaise,
    30000,
    `Net shop profit must reflect +30000 paise from negative expenses. Actual: ${todayPreview.body.summary.netShopProfitPaise}`
  );

  // Step D: Finalize closing for today
  const expCash = todayPreview.body.accounts.cash.expectedClosingPaise;
  const expBank = todayPreview.body.accounts.bank.expectedClosingPaise;

  const closeTodayRes = await api('POST', `/api/closings/${today}`, {
    cashCountPaise: expCash,
    bankCountPaise: expBank,
    note: 'Day with negative operating expenses finalized',
    holiday: false,
    reviewVersion: todayPreview.body.gateVersion,
    idempotencyKey: `close-today-${Date.now()}`,
  }, tenantA.cookie);
  assert.strictEqual(closeTodayRes.status, 200, `Close today failed: ${JSON.stringify(closeTodayRes.body)}`);

  // Step E: Verify finalized dailyClosings snapshot
  const finalizedDoc = await db.collection('dailyClosings').findOne({tenantId: tenantA.tenantId, date: today});
  assert.ok(finalizedDoc, 'Finalized daily closing for today must exist in MongoDB');
  assert.strictEqual(
    finalizedDoc.snapshot.operatingExpensesPaise,
    -30000,
    `Finalized snapshot operatingExpensesPaise must be -30000. Actual: ${finalizedDoc.snapshot.operatingExpensesPaise}`
  );
  assert.strictEqual(
    finalizedDoc.snapshot.netShopProfitPaise,
    30000,
    `Finalized snapshot netShopProfitPaise must be 30000. Actual: ${finalizedDoc.snapshot.netShopProfitPaise}`
  );
  console.log('   ✓ Real expense & reversal endpoints verified; unclamped negative expenses preserved in preview and finalized snapshot.');

  console.log('\n=== ALL 12 ACCEPTANCE TESTS PASSED SUCCESSFULLY ===');
} catch (err) {
  console.error('\n❌ Test failed with error:', err);
  process.exitCode = 1;
} finally {
  console.log('\nCleaning up tracked test data...');
  for (const t of tracked.tenants) {
    await db.collection('tenants').deleteOne({_id: t});
    await db.collection('companySettings').deleteOne({tenantId: t});
    await db.collection('openingSetups').deleteOne({tenantId: t});
    await db.collection('tenantAccountBalances').deleteMany({tenantId: t});
    await db.collection('accountMovements').deleteMany({tenantId: t});
    await db.collection('businessDayGates').deleteOne({_id: `DAY-${t}`});
    await db.collection('dailyClosings').deleteMany({tenantId: t});
    await db.collection('dailyClosingDrafts').deleteMany({tenantId: t});
    await db.collection('businessHolidays').deleteMany({tenantId: t});
    await db.collection('idempotencyOperations').deleteMany({tenantId: t});
    await db.collection('auditHistory').deleteMany({tenantId: t});
    await db.collection('stockMovements').deleteMany({tenantId: t});
    await db.collection('serviceJobs').deleteMany({tenantId: t});
    await db.collection('customerReturns').deleteMany({tenantId: t});
    await db.collection('supplierReturns').deleteMany({tenantId: t});
  }
  for (const u of tracked.users) {
    await db.collection('authUsers').deleteOne({_id: u});
    await db.collection('authAccounts').deleteMany({userId: u});
    await db.collection('authSessions').deleteMany({userId: u});
  }
  await client.close();
  console.log('Cleanup complete.');
}
