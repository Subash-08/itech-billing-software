// Focused Verification of Supplier Workflow:
// Unpaid purchase (3 units @ ₹60k = ₹180k) -> Receive 3 -> Sell 1 -> Return 1 ->
// Confirm ₹60k credit note -> Verify ₹120k due and unchanged Cash/Bank -> Settle remainder.

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

const tracked = {
  users: [],
  tenants: [],
  suppliers: [],
  customers: [],
  products: [],
  stockLots: [],
  serialUnits: [],
  stockMovements: [],
  accountMovements: [],
  purchases: [],
  purchaseReceipts: [],
  supplierReturns: [],
  supplierCreditNotes: [],
  supplierPayments: [],
  invoices: [],
  invoiceTemplates: [],
  templateRevisions: [],
  openingSetups: [],
  tenantAccountBalances: [],
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

async function runFocusedSupplierScenario() {
  console.log('=== Starting Focused Verification of Supplier Workflow ===\n');

  try {
    const timestamp = Date.now();
    const tenantId = `tenant-sup-${timestamp}`;
    const userId = new ObjectId();
    const email = `admin.sup.${timestamp}@example.com`;
    const password = 'Password123!';
    const hashedPassword = await hashPassword(password);

    // 1. Create Isolated Test Tenant & Admin User
    tracked.tenants.push(tenantId);
    await db.collection('tenants').insertOne({
      _id: tenantId,
      name: 'Supplier Verification Enterprise',
      normalizedName: 'supplier verification enterprise',
      companyName: 'Supplier Verification Enterprise',
      verified: true,
      disabled: false,
      status: 'Active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    tracked.users.push(userId.toString());
    await db.collection('authUsers').insertOne({
      _id: userId,
      tenantId,
      email,
      emailVerified: true,
      name: 'Supplier Test Admin',
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
      name: 'Supplier Verification Enterprise',
      phone: '9876543210',
      email,
      address: '100 Mount Road, Chennai, Tamil Nadu',
      gst: '33ABCDE1234F1Z5',
      bank: 'HDFC Bank',
      account: '50200012345678',
      ifsc: 'HDFC0001234',
      declaration: 'Standard Computer and Electronics Hardware Billing',
      updatedAt: new Date(),
    });

    // Sign in to obtain session cookie
    const loginRes = await api('POST', '/api/auth/sign-in/email', {email, password});
    assert.strictEqual(loginRes.status, 200, `Sign-in must succeed: ${JSON.stringify(loginRes.body)}`);
    const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
    const cookie = setCookies.map(c => c?.split(';')[0]).filter(Boolean).join('; ');
    console.log('✓ Signed in with isolated test tenant:', tenantId);

    // 2. Setup Opening Balances: Cash ₹25,000, Bank ₹50,000, Cutoff 2026-09-10
    await db.collection('openingSetups').insertOne({
      _id: tenantId,
      tenantId,
      status: 'Finalized',
      cutoffDate: '2026-09-10',
      openingCashPaise: 2500000,
      openingBankPaise: 5000000,
      finalizedAt: new Date(),
    });
    tracked.openingSetups.push(tenantId);

    await db.collection('tenantAccountBalances').insertMany([
      {_id: `tab-cash-${tenantId}`, tenantId, account: 'Cash', balancePaise: 2500000, version: 1, updatedAt: new Date()},
      {_id: `tab-bank-${tenantId}`, tenantId, account: 'Bank', balancePaise: 5000000, version: 1, updatedAt: new Date()},
    ]);
    tracked.tenantAccountBalances.push(`tab-cash-${tenantId}`, `tab-bank-${tenantId}`);

    const movCash = new ObjectId();
    const movBank = new ObjectId();
    await db.collection('accountMovements').insertMany([
      {_id: movCash.toString(), tenantId, date: '2026-09-10', account: 'Cash', qty: 2500000, amountPaise: 2500000, direction: 'In', reason: 'Opening cash balance', reference: 'OPENING-SETUP'},
      {_id: movBank.toString(), tenantId, date: '2026-09-10', account: 'Bank', qty: 5000000, amountPaise: 5000000, direction: 'In', reason: 'Opening bank balance', reference: 'OPENING-SETUP'},
    ]);
    tracked.accountMovements.push(movCash.toString(), movBank.toString());
    console.log('✓ Opening setup finalized: Cash ₹25,000 (2,500,000 paise), Bank ₹50,000 (5,000,000 paise)');

    // 3. Create Supplier TechSource Wholesale Ltd
    const supRes = await api('POST', '/api/master/suppliers', {
      name: 'TechSource Wholesale Ltd',
      phone: '9876510001',
      email: 'sales@techsource.in',
      gst: '33AAAAA1111A1Z1',
      address: '45 Trade Centre, Chennai',
      terms: 30,
    }, cookie);
    assert.strictEqual(supRes.status, 200, `Supplier creation failed: ${JSON.stringify(supRes.body)}`);
    const supplierId = supRes.body._id;
    tracked.suppliers.push(supplierId);
    console.log('✓ Created supplier:', supplierId);

    // 4. Create Serial-Tracked Product Lenovo ThinkPad X1
    const prodRes = await api('POST', '/api/master/products', {
      name: 'Lenovo ThinkPad X1 Carbon',
      brand: 'Lenovo',
      hsn: '8471',
      category: 'Laptops',
      isSerialTracked: true,
      costPaise: 6000000,
      sellingPricePaise: 7500000,
      condition: 'New',
      warranty: 12,
    }, cookie);
    assert.strictEqual(prodRes.status, 200, `Product creation failed: ${JSON.stringify(prodRes.body)}`);
    const productId = prodRes.body._id;
    tracked.products.push(productId);
    console.log('✓ Created serial-tracked product:', productId);

    const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata'}).format(new Date());

    // 5. Create & Post Purchase Bill for 3 units @ ₹60,000 each = ₹180,000 total
    const purchaseRes = await api('POST', '/api/purchases', {
      supplierId,
      orderDate: today,
      supplierInvoiceNumber: `INV-SUP-${timestamp}`,
      supplierInvoiceDate: today,
      taxMode: 'Intra-state',
      inclusive: true,
      placeOfSupply: 'Tamil Nadu',
      postImmediately: true,
      lines: [{
        clientLineKey: 'line-laptops',
        productId,
        description: 'Lenovo ThinkPad X1 Carbon',
        quantityOrdered: 3,
        unitCostPaise: 6000000,
        taxBasisPoints: 1800,
        discountType: 'Percentage',
        discountValue: 0,
      }],
    }, cookie);
    assert.strictEqual(purchaseRes.status, 200, `Purchase bill creation failed: ${JSON.stringify(purchaseRes.body)}`);
    const purchaseId = purchaseRes.body._id;
    const purchaseLineId = purchaseRes.body.lines[0].lineId;
    tracked.purchases.push(purchaseId);
    assert.strictEqual(purchaseRes.body.billStatus, 'Posted');
    assert.strictEqual(purchaseRes.body.duePaise, 18000000, 'Due must be ₹180,000');
    console.log('✓ Created and posted purchase bill for ₹180,000 (3 units @ ₹60,000):', purchaseId);

    // 6. Goods Receipt: Receive all 3 units with distinct serials
    const sn1 = `SN-TP-001-${timestamp}`;
    const sn2 = `SN-TP-002-${timestamp}`;
    const sn3 = `SN-TP-003-${timestamp}`;

    const rcvRes = await api('POST', `/api/purchases/${purchaseId}/receive`, {
      receiptDate: today,
      idempotencyKey: `rcv-${timestamp}`,
      lines: [{
        lineId: purchaseLineId,
        quantityReceived: 3,
        serials: [sn1, sn2, sn3],
      }],
    }, cookie);
    assert.strictEqual(rcvRes.status, 200, `Receipt failed: ${JSON.stringify(rcvRes.body)}`);
    const receiptId = rcvRes.body._id;
    tracked.purchaseReceipts.push(receiptId);
    console.log('✓ Goods receipt complete for 3 serials:', [sn1, sn2, sn3]);

    // Find stock lot
    const lotDoc = await db.collection('stockLots').findOne({
      tenantId,
      purchaseId,
      purchaseLineId,
    });
    assert.ok(lotDoc, 'Stock lot must exist');
    const lotId = lotDoc._id;
    assert.strictEqual(lotDoc.quantitySellable, 3);
    assert.strictEqual(lotDoc.quantitySold, 0);
    assert.strictEqual(lotDoc.quantityReturned, 0);

    // 7. Create Customer Kavitha Traders & Sell 1 Unit (SN-TP-001) for ₹75,000 Cash
    const custRes = await api('POST', '/api/master/customers', {
      name: 'Kavitha Traders',
      phone: '9876520002',
      details: {state: 'Tamil Nadu', stateCode: '33'},
    }, cookie);
    assert.strictEqual(custRes.status, 200, `Customer creation failed: ${JSON.stringify(custRes.body)}`);
    const customerId = custRes.body._id;
    tracked.customers.push(customerId);

    // Seed default template for invoice issuing
    const defTplId = `tpl-def-${timestamp}`;
    const tplRecord = {
      _id: defTplId,
      tenantId,
      name: 'Default Tax Invoice',
      nameNormalized: 'default tax invoice',
      title: 'TAX INVOICE',
      paper: 'A4',
      orientation: 'portrait',
      fontSize: 11,
      accent: '#6246e5',
      borders: true,
      striped: false,
      logoPosition: 'left',
      isDefault: true,
      currentRevision: 1,
      status: 'Active',
      fields: {logo: true, shopName: true, number: true, date: true},
      columns: [
        {id: 'index', label: '#', show: true, align: 'left'},
        {id: 'description', label: 'Item & Description', show: true, align: 'left'},
        {id: 'qty', label: 'Qty', show: true, align: 'right'},
        {id: 'amount', label: 'Amount', show: true, align: 'right'},
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: userId.toString(),
    };
    await db.collection('invoiceTemplates').insertOne(tplRecord);
    await db.collection('templateRevisions').insertOne({
      _id: `${defTplId}_rev_1`,
      templateId: defTplId,
      tenantId,
      revision: 1,
      snapshot: tplRecord,
      createdAt: new Date(),
      createdBy: userId.toString(),
    });
    tracked.invoiceTemplates.push(defTplId);
    tracked.templateRevisions.push(`${defTplId}_rev_1`);

    // Create Draft Invoice
    const draftInvRes = await api('POST', '/api/sales/invoices', {
      customerId,
      invoiceDate: today,
      invoiceKind: 'Sale',
      businessCategory: 'NewGoods',
      inclusive: true,
      taxMode: 'Intra-state',
      placeOfSupply: 'Tamil Nadu',
      templateId: defTplId,
      templateRevision: 1,
      lines: [{
        lineType: 'Product',
        clientLineKey: 'line-sale-1',
        productId,
        description: 'Lenovo ThinkPad X1 Carbon',
        hsn: '8471',
        quantity: 1,
        unitRatePaise: 7500000,
        taxBasisPoints: 1800,
        taxTreatment: 'Taxable',
        discountType: 'Percentage',
        discountValue: 0,
        stockAllocations: [{
          lotId,
          quantity: 1,
          serials: [sn1],
        }],
        warrantyMonths: 12,
      }],
      idempotencyKey: `inv-draft-${timestamp}`,
    }, cookie);
    assert.strictEqual(draftInvRes.status, 200, `Invoice draft failed: ${JSON.stringify(draftInvRes.body)}`);
    const invoiceId = draftInvRes.body._id;
    tracked.invoices.push(invoiceId);

    // Issue invoice with Cash payment ₹75,000
    const issueInvRes = await api('POST', `/api/sales/invoices/${invoiceId}/issue`, {
      draftId: invoiceId,
      expectedVersion: 1,
      idempotencyKey: `inv-iss-${timestamp}`,
      paymentComponents: [{account: 'Cash', method: 'Cash', amountPaise: 7500000}],
    }, cookie);
    assert.strictEqual(issueInvRes.status, 200, `Invoice issue failed: ${JSON.stringify(issueInvRes.body)}`);
    console.log(`✓ Sold 1 unit (${sn1}) for ₹75,000 Cash. Invoice ${issueInvRes.body.invoiceNumber} issued.`);

    // --- CHECK INVARIANT 1: Customer sale does NOT alter supplier due ---
    const lotAfterSale = await db.collection('stockLots').findOne({_id: lotId});
    assert.strictEqual(lotAfterSale.quantitySold, 1, 'Lot quantitySold must be 1');
    assert.strictEqual(lotAfterSale.quantitySellable, 2, 'Lot quantitySellable must be 2');

    const purAfterSale = await db.collection('purchases').findOne({_id: purchaseId});
    assert.strictEqual(purAfterSale.duePaise, 18000000, 'Supplier due must remain ₹180,000 after customer sale');
    console.log('✓ Invariant 1 passed: Supplier liability is STILL ₹180,000 after customer sale');

    // 8. Return 1 unsold unit (SN-TP-002) to supplier
    console.log(`\nReturning 1 unsold unit (${sn2}) to TechSource Wholesale...`);
    const returnRes = await api('POST', '/api/purchases/returns', {
      purchaseId,
      purchaseLineId,
      lotId,
      quantity: 1,
      condition: 'Sellable',
      disposition: 'ReturnedToSupplier',
      serials: [sn2],
      reason: 'Defect noticed before customer dispatch - returned for supplier credit',
      idempotencyKey: `ret-unit2-${timestamp}`,
    }, cookie);
    assert.strictEqual(returnRes.status, 200, `Return creation failed: ${JSON.stringify(returnRes.body)}`);
    const returnId = returnRes.body._id;
    tracked.supplierReturns.push(returnId);
    console.log(`✓ Supplier return record created (${returnRes.body.returnNumber || returnId}). Status: ${returnRes.body.status}`);

    // --- CHECK INVARIANT 2: Return before credit acceptance ---
    const lotAfterReturn = await db.collection('stockLots').findOne({_id: lotId});
    assert.strictEqual(lotAfterReturn.quantitySold, 1, '1 unit sold');
    assert.strictEqual(lotAfterReturn.quantityReturned, 1, '1 unit returned to supplier');
    assert.strictEqual(lotAfterReturn.quantitySellable, 1, '1 unit available in stock');

    const purBeforeAccept = await db.collection('purchases').findOne({_id: purchaseId});
    assert.strictEqual(purBeforeAccept.duePaise, 18000000, 'Supplier due must remain ₹180,000 until credit is accepted');
    console.log('✓ Invariant 2 passed: Pre-acceptance supplier due is STILL ₹180,000 (1 sold, 1 returned, 1 in stock)');

    // 9. Accept Return Credit Note for ₹60,000 with allocateToBillDue: true
    console.log('Accepting supplier credit note for ₹60,000...');
    const acceptRes = await api('POST', `/api/purchases/returns/${returnId}/accept`, {
      acceptedCreditPaise: 6000000,
      allocateToBillDue: true,
      date: today,
      idempotencyKey: `acc-unit2-${timestamp}`,
    }, cookie);
    assert.strictEqual(acceptRes.status, 200, `Accept credit failed: ${JSON.stringify(acceptRes.body)}`);
    const creditNoteId = acceptRes.body._id;
    tracked.supplierCreditNotes.push(creditNoteId);
    console.log(`✓ Supplier credit note accepted (${acceptRes.body.creditNoteNumber || creditNoteId})`);

    // --- CHECK INVARIANT 3: Post-acceptance financial invariants ---
    const purAfterAccept = await db.collection('purchases').findOne({_id: purchaseId});
    assert.strictEqual(purAfterAccept.duePaise, 12000000, 'Purchase remaining due must be exactly ₹120,000 (12,000,000 paise)');
    assert.strictEqual(purAfterAccept.lines[0].remainingDuePaise, 12000000, 'Line remaining due must be ₹120,000');
    assert.strictEqual(purAfterAccept.lines[0].creditedLiabilityPaise, 6000000, 'Line credited liability must be ₹60,000');

    const lotFinal = await db.collection('stockLots').findOne({_id: lotId});
    assert.strictEqual(lotFinal.quantitySellable, 1, 'Stock on hand must remain 1 available (SN-TP-003)');

    // Cash and Bank Balances check: MUST BE EXACTLY UNCHANGED by credit acceptance
    const cashBalDoc = await db.collection('tenantAccountBalances').findOne({tenantId, account: 'Cash'});
    const bankBalDoc = await db.collection('tenantAccountBalances').findOne({tenantId, account: 'Bank'});
    // Opening Cash ₹25,000 + Sale Cash ₹75,000 = ₹100,000 (10,000,000 paise)
    assert.strictEqual(cashBalDoc.balancePaise, 10000000, 'Cash balance must be exactly ₹100,000 (opening + customer payment, ZERO from credit)');
    // Opening Bank ₹50,000 = ₹50,000 (5,000,000 paise)
    assert.strictEqual(bankBalDoc.balancePaise, 5000000, 'Bank balance must remain exactly ₹50,000 (ZERO movement)');

    // Verify ZERO accountMovements for supplier credit note
    const supplierMovements = await db.collection('accountMovements').find({
      tenantId,
      reason: /supplier/i,
    }).toArray();
    assert.strictEqual(supplierMovements.length, 0, 'No cash/bank movement must be created by supplier credit note acceptance');

    console.log('\n✓ Invariant 3 passed: Post-Acceptance Invariants 100% Verified:');
    console.log('  - Supplier due: ₹120,000 (cleanly reduced by ₹60,000)');
    console.log('  - Stock on hand: 1 available (SN-TP-003)');
    console.log('  - Cash balance: ₹100,000 (unchanged by credit note)');
    console.log('  - Bank balance: ₹50,000 (unchanged by credit note)');
    console.log('  - Supplier account movements: ₹0 (NO money created or moved)');

    // 10. Separate Case: Return 2nd unsold unit (SN-TP-003), accept credit note, settle remaining due
    console.log('\n--- Executing Settle Remainder Scenario ---');
    const returnRes2 = await api('POST', '/api/purchases/returns', {
      purchaseId,
      purchaseLineId,
      lotId,
      quantity: 1,
      condition: 'Sellable',
      disposition: 'ReturnedToSupplier',
      serials: [sn3],
      reason: 'Surplus returned to supplier',
      idempotencyKey: `ret-unit3-${timestamp}`,
    }, cookie);
    assert.strictEqual(returnRes2.status, 200);
    const returnId2 = returnRes2.body._id;
    tracked.supplierReturns.push(returnId2);

    const acceptRes2 = await api('POST', `/api/purchases/returns/${returnId2}/accept`, {
      acceptedCreditPaise: 6000000,
      allocateToBillDue: true,
      date: today,
      idempotencyKey: `acc-unit3-${timestamp}`,
    }, cookie);
    assert.strictEqual(acceptRes2.status, 200);
    tracked.supplierCreditNotes.push(acceptRes2.body._id);

    const purAfter2ndAccept = await db.collection('purchases').findOne({_id: purchaseId});
    assert.strictEqual(purAfter2ndAccept.duePaise, 6000000, 'Due must now be ₹60,000 (6,000,000 paise)');
    console.log('✓ Returned 2nd unit and accepted credit note. Remaining supplier due: ₹60,000');

    // Pay the remaining ₹60,000 from Cash
    const payRes = await api('POST', '/api/purchases/payments', {
      supplierId,
      date: today,
      components: [{account: 'Cash', method: 'Cash', amountPaise: 6000000}],
      allocations: [{
        targetType: 'PurchaseLine',
        targetId: purchaseId,
        purchaseLineId,
        amountPaise: 6000000,
      }],
      notes: 'Settlement of remaining due for sold laptop',
      idempotencyKey: `pay-final-${timestamp}`,
    }, cookie);
    assert.strictEqual(payRes.status, 200, `Payment failed: ${JSON.stringify(payRes.body)}`);
    tracked.supplierPayments.push(payRes.body._id);

    const purFinal = await db.collection('purchases').findOne({_id: purchaseId});
    assert.strictEqual(purFinal.duePaise, 0, 'Purchase payable must be exactly 0');
    assert.strictEqual(purFinal.paymentStatus, 'Paid', 'Purchase status must be Paid');

    const cashAfterPay = await db.collection('tenantAccountBalances').findOne({tenantId, account: 'Cash'});
    assert.strictEqual(cashAfterPay.balancePaise, 4000000, 'Cash balance must be ₹40,000 (100k - 60k)');
    console.log('✓ Paid ₹60,000 from Cash. Purchase status: Paid (due: ₹0). Cash balance: ₹40,000.');

    console.log('\n===============================================================');
    console.log('🎉 ALL SUPPLIER WORKFLOW ACCEPTANCE INVARIANTS VERIFIED 100% PASSING!');
    console.log('===============================================================\n');

  } finally {
    console.log('--- Cleaning up isolated test tenant data ---');
    if (tracked.tenants.length) {
      const tenantIds = tracked.tenants;
      const userObjIds = tracked.users.map(u => {
        try { return new ObjectId(u); } catch { return u; }
      });
      const userStrIds = tracked.users.map(u => String(u));

      // 1. Clean primary and relational collections
      await db.collection('tenants').deleteMany({_id: {$in: tenantIds}});
      await db.collection('authUsers').deleteMany({$or: [{tenantId: {$in: tenantIds}}, {_id: {$in: userObjIds}}]});
      await db.collection('authAccounts').deleteMany({$or: [{userId: {$in: userObjIds}}, {userId: {$in: userStrIds}}]});
      await db.collection('authSessions').deleteMany({$or: [{userId: {$in: userObjIds}}, {userId: {$in: userStrIds}}]});
      await db.collection('companySettings').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('openingSetups').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('tenantAccountBalances').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('accountMovements').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('suppliers').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('customers').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('products').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('stockLots').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('serialUnits').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('stockMovements').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('purchases').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('purchaseReceipts').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('supplierReturns').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('supplierCreditNotes').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('supplierPayments').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('supplierAllocations').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('supplierAdvances').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('invoices').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('invoiceTemplates').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('templateRevisions').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('warranties').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('warrantyClaims').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('stockReservations').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('customerReturns').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('customerReceipts').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('customerAllocations').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('customerCreditNotes').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('customerLedgerEntries').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('tenantCounters').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('idempotencyOperations').deleteMany({tenantId: {$in: tenantIds}});
      await db.collection('auditLogs').deleteMany({tenantId: {$in: tenantIds}});

      // 2. Dynamic sweep check across every collection in the database
      const allCollections = await db.listCollections().toArray();
      const residuals = [];
      for (const colInfo of allCollections) {
        const count = await db.collection(colInfo.name).countDocuments({tenantId: {$in: tenantIds}});
        if (count > 0) {
          residuals.push({collection: colInfo.name, count});
          await db.collection(colInfo.name).deleteMany({tenantId: {$in: tenantIds}});
        }
      }

      if (residuals.length > 0) {
        console.warn('Swept residual records from additional collections:', residuals);
      }

      // 3. Final verification: assert zero residual records remain for test tenant across all collections
      let totalRemaining = 0;
      for (const colInfo of allCollections) {
        const c = await db.collection(colInfo.name).countDocuments({tenantId: {$in: tenantIds}});
        totalRemaining += c;
      }
      assert.strictEqual(totalRemaining, 0, 'Residual test tenant records detected after cleanup!');
      console.log('✓ Cleaned up all test tenant records cleanly without touching user records. Residual count: 0 across all collections.');
    }
    await client.close();
  }
}

runFocusedSupplierScenario().catch(err => {
  console.error('❌ Focused supplier scenario failed:', err);
  process.exit(1);
});
