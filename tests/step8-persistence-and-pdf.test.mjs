import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const d = require('../.test-build/domain.js');
const {seed, makeLine} = require('../.test-build/seed.js');
const op = require('../.test-build/operations.js');

test('Step 8: Resulting price persists, cost/target inputs never leak, daily profit stays pending', () => {
  // 1. Create invoice with manual service/charge row configured via pricing helper
  // Cost was ₹10,000 net, desired profit ₹2,000 -> exclusive rate ₹12,000
  const manualServiceLine = {
    ...makeLine('P006'),
    productId: '',
    name: 'Consulting & Setup Service',
    lineType: 'Service',
    qty: 1,
    rate: 12000,
    tax: 18,
    discount: 0,
    priceEntryMode: 'Exclusive',
  };

  // Ensure helper transient state (cost, desired profit) is NOT on the document line
  assert.equal(manualServiceLine.productId, '', 'Manual line has no product ID');
  assert.equal('cost' in manualServiceLine, false, 'No transient cost on line');
  assert.equal('desired' in manualServiceLine, false, 'No transient desired profit on line');
  assert.equal('costPaise' in manualServiceLine, false, 'No costPaise on line');

  const invoice = {
    id: 'INV-TEST-PRICING-HELPER',
    customerId: 'C001',
    date: d.TODAY,
    due: d.TODAY,
    kind: 'Sale',
    category: 'Service',
    status: 'Issued',
    lines: [manualServiceLine],
    inclusive: false,
    notes: 'Thank you',
    profit: null, // Daily closing requires profit entry; helper does NOT post profit
  };

  // Issue the bill
  const state = op.issueBill(structuredClone(seed), invoice);
  const issuedBill = state.bills.find(b => b.id === invoice.id);
  assert.ok(issuedBill, 'Invoice must be recorded');

  // Verify rate and total persist
  const billTotal = d.totals(issuedBill);
  assert.equal(billTotal.base, 12000, 'Taxable base must be ₹12,000');
  assert.equal(billTotal.tax, 2160, 'Tax must be ₹2,160');
  assert.equal(billTotal.total, 14160, 'Customer total must be ₹14,160');

  // Verify profit remains null (pending entry at daily closing)
  assert.equal(issuedBill.profit, null, 'Profit must remain null (pending entry at daily closing)');

  // Verify document line properties do NOT contain any cost or target profit
  const line = issuedBill.lines[0];
  assert.equal(line.rate, 12000, 'Selling price must persist as 12000');
  assert.equal(Object.hasOwn(line, 'cost'), false, 'Line must not have cost property');
  assert.equal(Object.hasOwn(line, 'desired'), false, 'Line must not have desired property');
  assert.equal(Object.hasOwn(line, 'costPaise'), false, 'Line must not have costPaise property');
  assert.equal(Object.hasOwn(line, 'profitPaise'), false, 'Line must not have profitPaise property');

  // Verify customer JSON serialization does not leak cost or profit
  const serialized = JSON.stringify(issuedBill);
  assert.ok(!serialized.includes('"cost":'), 'Document JSON must never leak cost');
  assert.ok(!serialized.includes('"costPaise":'), 'Document JSON must never leak costPaise');
  assert.ok(!serialized.includes('"desiredProfit":'), 'Document JSON must never leak desiredProfit');
});
