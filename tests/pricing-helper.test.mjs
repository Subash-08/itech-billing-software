import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {
  costWithoutRecoverableGst,
  suggestExclusiveRate,
  pricingEstimate,
  cumulativeCostSlice,
} = require('../.test-build/pricing-helper.js');
const {calculateGst} = require('../.test-build/gst.js');

test('Verification Case 2: Recoverable GST 18%, Cost 11800, Profit 2000, Sales GST 18%', () => {
  const costPaise = costWithoutRecoverableGst(1180000, 1800);
  assert.equal(costPaise, 1000000, 'Cost without recoverable GST should be ₹10,000 (1,000,000 paise)');

  const desiredPaise = 200000;
  const exclusiveRate = suggestExclusiveRate(costPaise, desiredPaise);
  assert.equal(exclusiveRate, 12000, 'Exclusive selling rate should be ₹12,000');

  const line = {qty: 1, rate: exclusiveRate, tax: 18, discount: 0, priceEntryMode: 'Exclusive'};
  const estimate = pricingEstimate(line, false, costPaise);

  assert.equal(estimate.base, 12000, 'Taxable base should be ₹12,000');
  assert.equal(estimate.tax, 2160, 'Sales GST should be ₹2,160');
  assert.equal(estimate.total, 14160, 'Customer total should be ₹14,160');
  assert.equal(estimate.profitPaise, 200000, 'Estimated profit should be ₹2,000 (200,000 paise)');
});

test('Verification Case 3: Quantity 2 and 10% sales discount', () => {
  const costPaise = 1000000; // ₹10,000 per unit
  const exclusiveRate = 12000;

  // Quantity 2, no discount
  const lineQty2 = {qty: 2, rate: exclusiveRate, tax: 18, discount: 0, priceEntryMode: 'Exclusive'};
  const estimateQty2 = pricingEstimate(lineQty2, false, costPaise);
  assert.equal(estimateQty2.total, 28320, 'Customer total for qty 2 should be ₹28,320');
  assert.equal(estimateQty2.profitPaise, 400000, 'Estimated profit for qty 2 should be ₹4,000');

  // Quantity 2, 10% discount
  const lineDiscounted = {qty: 2, rate: exclusiveRate, tax: 18, discount: 10, discountType: 'Percentage', priceEntryMode: 'Exclusive'};
  const estimateDisc = pricingEstimate(lineDiscounted, false, costPaise);
  assert.equal(estimateDisc.base, 21600, 'Taxable value after 10% discount should be ₹21,600');
  assert.equal(estimateDisc.profitPaise, 160000, 'Estimated profit after discount should be ₹1,600');
  assert.equal(estimateDisc.total, 25488, 'Customer total with 18% tax on ₹21,600 should be ₹25,488');
});

test('Verification Case 4: Nonrecoverable cost 11800 plus desired profit 2000', () => {
  const fullCostPaise = 1180000;
  const desiredPaise = 200000;
  const rate = suggestExclusiveRate(fullCostPaise, desiredPaise);
  assert.equal(rate, 13800, 'Full nonrecoverable cost rate should be ₹13,800');
  assert.notEqual(rate, 12000, 'Must differ from recoverable Case 2 rate (₹12,000)');
});

test('Verification Case 5: Purchase tax 18%, sales tax 5%, and zero-tax treatments', () => {
  const costPaise = costWithoutRecoverableGst(1180000, 1800); // 1,000,000 paise (₹10,000)
  const exclusiveRate = suggestExclusiveRate(costPaise, 200000); // ₹12,000

  // 5% Sales Tax
  const line5 = {qty: 1, rate: exclusiveRate, tax: 5, discount: 0, priceEntryMode: 'Exclusive'};
  const est5 = pricingEstimate(line5, false, costPaise);
  assert.equal(est5.base, 12000);
  assert.equal(est5.tax, 600, 'Customer GST at 5% should be ₹600');
  assert.equal(est5.total, 12600, 'Customer total should be ₹12,600');
  assert.equal(est5.profitPaise, 200000, 'Estimated profit is ₹2,000');

  // Exempt
  const lineExempt = {qty: 1, rate: exclusiveRate, tax: 18, discount: 0, taxTreatment: 'Exempt', priceEntryMode: 'Exclusive'};
  const estExempt = pricingEstimate(lineExempt, false, costPaise);
  assert.equal(estExempt.tax, 0, 'Exempt should have 0 GST');
  assert.equal(estExempt.total, 12000, 'Exempt total should equal base');

  // NonGST
  const lineNonGst = {qty: 1, rate: exclusiveRate, tax: 18, discount: 0, taxTreatment: 'NonGST', priceEntryMode: 'Exclusive'};
  const estNonGst = pricingEstimate(lineNonGst, false, costPaise);
  assert.equal(estNonGst.tax, 0, 'NonGST should have 0 GST');
  assert.equal(estNonGst.total, 12000, 'NonGST total should equal base');

  // Taxable 0%
  const lineZero = {qty: 1, rate: exclusiveRate, tax: 0, discount: 0, taxTreatment: 'Taxable', priceEntryMode: 'Exclusive'};
  const estZero = pricingEstimate(lineZero, false, costPaise);
  assert.equal(estZero.tax, 0, 'Taxable 0% should have 0 GST');
  assert.equal(estZero.total, 12000, 'Taxable 0% total should equal base');
});

test('Verification Case 6: Edge cases, zero, negatives, unsafe amounts, and below-cost', () => {
  // Explicit zero is permitted
  assert.equal(suggestExclusiveRate(0, 0), 0);
  assert.equal(suggestExclusiveRate(0, 100000), 1000);
  assert.equal(suggestExclusiveRate(100000, 0), 1000);

  // Negative amounts rejected
  assert.throws(() => costWithoutRecoverableGst(-100, 1800), /valid purchase amount/);
  assert.throws(() => costWithoutRecoverableGst(1000, -1800), /valid purchase amount/);
  assert.throws(() => suggestExclusiveRate(-100, 200), /valid non-negative cost/);
  assert.throws(() => suggestExclusiveRate(100, -200), /valid non-negative cost/);
  assert.throws(() => pricingEstimate({qty: 1, rate: 100, tax: 18, discount: 0}, false, -500), /valid cost/);

  // Non-integer / non-numeric / unsafe amounts rejected
  assert.throws(() => suggestExclusiveRate(1.5, 200), /valid non-negative cost/);
  assert.throws(() => suggestExclusiveRate(NaN, 200), /valid non-negative cost/);
  assert.throws(() => suggestExclusiveRate(Infinity, 200), /valid non-negative cost/);
  assert.throws(() => costWithoutRecoverableGst(11800.5, 1800), /valid purchase amount/);

  // Quantity zero has no valid profit estimate
  assert.throws(() => pricingEstimate({qty: 0, rate: 1000, tax: 18, discount: 0}, false, 80000), /whole quantity/);
  assert.throws(() => pricingEstimate({qty: -1, rate: 1000, tax: 18, discount: 0}, false, 80000), /whole quantity/);

  // Two-decimal exact rounding
  // 100.33 cost + 50.25 desired profit = 150.58
  const r = suggestExclusiveRate(10033, 5025);
  assert.equal(r, 150.58);

  // Below-cost selling price
  // Cost = ₹10,000 (1,000,000 paise), Selling price = ₹8,000
  const belowCostLine = {qty: 1, rate: 8000, tax: 18, discount: 0, priceEntryMode: 'Exclusive'};
  const estBelow = pricingEstimate(belowCostLine, false, 1000000);
  assert.equal(estBelow.profitPaise, -200000, 'Negative profit of -₹2,000 for below-cost sale');
  assert.ok(estBelow.profitPaise < 0, 'Detects below-cost condition');
});

test('₹6,500 GST-inclusive supplier cost plus ₹1,000 profit produces the correct selling rates', () => {
  const costPaise = costWithoutRecoverableGst(650000, 1800);
  assert.equal(costPaise, 550847);
  const exclusiveRate = suggestExclusiveRate(costPaise, 100000);
  assert.equal(exclusiveRate, 6508.47);
  const sale = calculateGst({qty: 1, rate: exclusiveRate, tax: 18, discount: 0}, false);
  assert.equal(Math.round(sale.base * 100) - costPaise, 100000);
  assert.equal(sale.total, 7679.99);
});

test('exact lot-cost slices reconcile across partial sales and returns', () => {
  const first = cumulativeCostSlice(10000, 3, 0, 1);
  const second = cumulativeCostSlice(10000, 3, 1, 1);
  const last = cumulativeCostSlice(10000, 3, 2, 1);
  assert.deepEqual([first, second, last], [3333, 3333, 3334]);
  assert.equal(first + second + last, 10000);
  assert.throws(() => cumulativeCostSlice(10000, 3, 2, 2), /Invalid stock-lot/);
});
