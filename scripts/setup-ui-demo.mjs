import {MongoClient} from 'mongodb';
import {api, getDates} from '../tests/targeted-inventory-returns-acceptance.mjs';
import assert from 'node:assert/strict';

process.env.DISABLE_AUTH_RATE_LIMIT = 'true';
process.env.NODE_ENV = 'test';
process.loadEnvFile('.env.local');

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db('itech_dev');

const tenantId = 'tenant-acc-1790008932582';
const email = 'admin.acc.1790008932582@example.com';
const password = 'Password123!';

const loginRes = await api('POST', '/api/auth/sign-in/email', {email, password});
const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
const cookie = setCookies.map(c => c?.split(';')[0]).filter(Boolean).join('; ');
const {today} = getDates();

console.log('Logged into test tenant:', tenantId);

// 1. Ensure a customer with exactly 1 invoice, ₹3,000 due, and last sale date exists for Screenshot 1
const custRes = await api('POST', '/api/master/customers', {
  name: 'Return Test Customer',
  phone: '9876544444',
  gst: '33AABCR1234F1Z8',
  details: {state: 'Tamil Nadu', stateCode: '33'},
}, cookie);
const customerId = custRes.body._id;

// Get product and a stock lot
const prod = await db.collection('products').findOne({tenantId, name: 'LG 24-inch Monitor'});
const template = await db.collection('invoiceTemplates').findOne({tenantId});

// Purchase 2 fresh units to ensure lots are readily available in the UI modal
const sup = await db.collection('suppliers').findOne({tenantId});
const purRes = await api('POST', '/api/purchases', {
  supplierId: sup._id,
  orderDate: today,
  supplierInvoiceNumber: `INV-UI-DEMO-${Date.now()}`,
  supplierInvoiceDate: today,
  taxMode: 'Intra-state',
  inclusive: true,
  placeOfSupply: 'Tamil Nadu',
  postImmediately: true,
  lines: [{
    clientLineKey: 'line-ui-demo',
    productId: prod._id,
    quantityOrdered: 2,
    unitCostPaise: 700000,
    taxBasisPoints: 1800,
  }],
}, cookie);

await api('POST', `/api/purchases/${purRes.body._id}/receive`, {
  receiptDate: today,
  idempotencyKey: `rec-ui-demo-${Date.now()}`,
  lines: [{
    lineId: purRes.body.lines[0].lineId,
    quantityReceived: 2,
    serials: ['MON-UI-01', 'MON-UI-02'],
  }],
}, cookie);

const lot = await db.collection('stockLots').findOne({tenantId, purchaseId: purRes.body._id});

// Issue invoice: ₹7,000 total, ₹4,000 paid into Bank, ₹3,000 due
const invDraft = await api('POST', '/api/sales/invoices', {
  customerId,
  invoiceDate: today,
  invoiceKind: 'Sale',
  businessCategory: 'NewGoods',
  inclusive: true,
  taxMode: 'Intra-state',
  placeOfSupply: 'Tamil Nadu',
  billTo: {name: 'Return Test Customer', phone: '9876544444', state: 'Tamil Nadu', stateCode: '33'},
  shipTo: {name: 'Return Test Customer', phone: '9876544444', state: 'Tamil Nadu', stateCode: '33'},
  templateId: template._id,
  templateRevision: 1,
  lines: [{
    lineType: 'Product',
    clientLineKey: 'line-c1',
    productId: prod._id,
    description: 'LG 24-inch Monitor',
    hsn: '85285200',
    quantity: 1,
    unitRatePaise: 700000,
    taxBasisPoints: 1800,
    taxTreatment: 'Taxable',
    discountType: 'Percentage',
    discountValue: 0,
    stockAllocations: [{
      lotId: lot._id,
      quantity: 1,
      serials: ['MON-UI-01'],
    }],
    warrantyMonths: 12,
  }],
  idempotencyKey: `inv-ui-demo-${Date.now()}`,
}, cookie);

const issRes = await api('POST', `/api/sales/invoices/${invDraft.body._id}/issue`, {
  draftId: invDraft.body._id,
  expectedVersion: 1,
  idempotencyKey: `iss-ui-demo-${Date.now()}`,
  paymentComponents: [{account: 'Bank', method: 'UPI', amountPaise: 400000}],
}, cookie);

console.log('✓ Issued demo invoice:', issRes.body.invoiceNumber, 'for Customer:', customerId, 'Due: ₹3,000');
console.log('Supplier ID for history screenshot:', sup._id);
await client.close();
