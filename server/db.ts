import 'server-only';
import {MongoClient} from 'mongodb';

export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const globalDb = globalThis as typeof globalThis & {
  itechMongo?: Promise<MongoClient>;
  itechIndexes?: Promise<void>;
};

export async function mongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new AppError(503, 'MongoDB is not configured. The demo is still available.');
  if (!globalDb.itechMongo) {
    globalDb.itechMongo = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    }).connect().catch(e => {
      globalDb.itechMongo = undefined;
      throw e;
    });
  }
  return globalDb.itechMongo;
}

export async function database() {
  return (await mongo()).db(process.env.MONGODB_DB || 'itech_dev');
}

async function safeCreateIndex(
  col: any,
  keys: Record<string, 1 | -1 | string>,
  options?: any
) {
  try {
    const existing = await col.listIndexes().toArray().catch(() => []);
    const keyJson = JSON.stringify(keys);
    const exists = existing.some((idx: any) => JSON.stringify(idx.key) === keyJson);
    if (!exists) {
      await col.createIndex(keys, options);
    }
  } catch (err: any) {
    if (err?.codeName !== 'IndexAlreadyExists' && err?.code !== 85 && err?.code !== 86) {
      console.warn(`[db:safeCreateIndex] on ${col.collectionName}:`, err?.message || err);
    }
  }
}

export async function ensureIndexes() {
  if (!globalDb.itechIndexes) {
    globalDb.itechIndexes = (async () => {
      const db = await database();
      await Promise.all([
        safeCreateIndex(db.collection('authUsers'), {email: 1}, {unique: true}),
        safeCreateIndex(db.collection('authSessions'), {expiresAt: 1}, {expireAfterSeconds: 0}),
        safeCreateIndex(db.collection('rateLimits'), {expiresAt: 1}, {expireAfterSeconds: 0}),
        safeCreateIndex(db.collection('files'), {tenantId: 1, createdAt: -1}),
        safeCreateIndex(db.collection('authUsers'), {tenantId: 1}),
        safeCreateIndex(db.collection('authSessions'), {userId: 1}),
        safeCreateIndex(db.collection('authSessions'), {token: 1}, {unique: true}),
        safeCreateIndex(db.collection('authAccounts'), {providerId: 1, accountId: 1}, {unique: true}),
        safeCreateIndex(db.collection('authRateLimits'), {key: 1}, {unique: true}),

        // Phase 2: Master data indexes
        safeCreateIndex(db.collection('companySettings'), {tenantId: 1}, {unique: true}),
        safeCreateIndex(db.collection('customers'), {tenantId: 1, status: 1, createdAt: -1}),
        safeCreateIndex(db.collection('customers'), {tenantId: 1, name: 1}),
        safeCreateIndex(db.collection('customers'), {tenantId: 1, phone: 1}),
        safeCreateIndex(
          db.collection('customers'),
          {tenantId: 1, gstNormalized: 1},
          {unique: true, partialFilterExpression: {gstNormalized: {$type: 'string', $gt: ''}, status: 'Active'}}
        ),

        safeCreateIndex(db.collection('suppliers'), {tenantId: 1, status: 1, createdAt: -1}),
        safeCreateIndex(db.collection('suppliers'), {tenantId: 1, name: 1}),
        safeCreateIndex(
          db.collection('suppliers'),
          {tenantId: 1, gstNormalized: 1},
          {unique: true, partialFilterExpression: {gstNormalized: {$type: 'string', $gt: ''}, status: 'Active'}}
        ),

        safeCreateIndex(db.collection('products'), {tenantId: 1, status: 1, createdAt: -1}),
        safeCreateIndex(db.collection('products'), {tenantId: 1, name: 1}),
        safeCreateIndex(db.collection('products'), {tenantId: 1, category: 1}),
        safeCreateIndex(db.collection('products'), {tenantId: 1, preferredSupplierId: 1}),

        // Serial uniqueness per tenant
        safeCreateIndex(db.collection('serialUnits'), {tenantId: 1, serialNormalized: 1}, {unique: true}),
        safeCreateIndex(db.collection('serialUnits'), {tenantId: 1, productId: 1, status: 1}),
        // Phase 3.5 serial index
        safeCreateIndex(db.collection('serialUnits'), {tenantId: 1, productId: 1, lotId: 1, status: 1}),
        safeCreateIndex(db.collection('serialUnits'), {tenantId: 1, lotId: 1}),

        safeCreateIndex(db.collection('stockLots'), {tenantId: 1, productId: 1, quantityRemaining: 1}),
        safeCreateIndex(db.collection('stockLots'), {tenantId: 1, productId: 1, quantitySellable: 1}),
        safeCreateIndex(db.collection('stockLots'), {tenantId: 1, purchaseId: 1}),
        // Phase 3.5 stockLots indexes
        safeCreateIndex(db.collection('stockLots'), {tenantId: 1, productId: 1, receivedDate: -1}),
        safeCreateIndex(db.collection('stockLots'), {tenantId: 1, purchaseReceiptId: 1}),

        safeCreateIndex(db.collection('stockMovements'), {tenantId: 1, productId: 1, date: -1}),
        safeCreateIndex(db.collection('stockMovements'), {tenantId: 1, createdAt: -1}),
        safeCreateIndex(
          db.collection('stockMovements'),
          {tenantId: 1, idempotencyKey: 1},
          {unique: true, partialFilterExpression: {idempotencyKey: {$type: 'string', $gt: ''}}}
        ),
        // Phase 3.5 stockMovements index
        safeCreateIndex(db.collection('stockMovements'), {tenantId: 1, lotId: 1, date: -1}),

        safeCreateIndex(db.collection('accountMovements'), {tenantId: 1, account: 1, date: -1}),

        safeCreateIndex(db.collection('openingSetups'), {tenantId: 1}, {unique: true}),
        safeCreateIndex(db.collection('openingReceivables'), {tenantId: 1, customerId: 1, status: 1}),
        safeCreateIndex(db.collection('openingPayables'), {tenantId: 1, supplierId: 1, status: 1}),

        safeCreateIndex(db.collection('serviceCatalog'), {tenantId: 1, name: 1}),
        safeCreateIndex(db.collection('serviceCatalog'), {tenantId: 1, status: 1, active: 1}),

        safeCreateIndex(
          db.collection('invoiceTemplates'),
          {tenantId: 1, nameNormalized: 1},
          {unique: true, partialFilterExpression: {status: 'Active'}}
        ),
        safeCreateIndex(
          db.collection('invoiceTemplates'),
          {tenantId: 1, isDefault: 1},
          {unique: true, partialFilterExpression: {isDefault: true, status: 'Active'}}
        ),
        safeCreateIndex(db.collection('templateRevisions'), {tenantId: 1, templateId: 1, revision: 1}, {unique: true}),

        safeCreateIndex(db.collection('auditHistory'), {tenantId: 1, timestamp: -1}),
        safeCreateIndex(db.collection('auditHistory'), {tenantId: 1, entityType: 1, entityId: 1}),

        // Phase 3: Purchases, stock receipts, and supplier settlement
        safeCreateIndex(db.collection('purchases'), {tenantId: 1, purchaseNumber: 1}, {unique: true}),
        safeCreateIndex(
          db.collection('purchases'),
          {tenantId: 1, supplierId: 1, financialYear: 1, supplierInvoiceNumberNormalized: 1},
          {unique: true, partialFilterExpression: {billStatus: 'Posted', supplierInvoiceNumberNormalized: {$type: 'string', $gt: ''}}}
        ),
        safeCreateIndex(db.collection('purchases'), {tenantId: 1, documentStatus: 1, orderDate: -1}),
        safeCreateIndex(db.collection('purchases'), {tenantId: 1, billStatus: 1, duePaise: 1}),
        // Phase 3.5 purchases indexes
        safeCreateIndex(db.collection('purchases'), {tenantId: 1, supplierId: 1, billStatus: 1, orderDate: -1}),
        safeCreateIndex(db.collection('purchases'), {tenantId: 1, receiptStatus: 1, orderDate: -1}),
        safeCreateIndex(db.collection('purchases'), {tenantId: 1, paymentStatus: 1, orderDate: -1}),

        safeCreateIndex(db.collection('purchaseReceipts'), {tenantId: 1, receiptNumber: 1}, {unique: true}),
        safeCreateIndex(db.collection('purchaseReceipts'), {tenantId: 1, purchaseId: 1, receiptDate: -1}),

        safeCreateIndex(db.collection('supplierPayments'), {tenantId: 1, paymentNumber: 1}, {unique: true}),
        safeCreateIndex(db.collection('supplierPayments'), {tenantId: 1, supplierId: 1, date: -1}),

        safeCreateIndex(db.collection('supplierAllocations'), {tenantId: 1, targetType: 1, targetId: 1}),
        safeCreateIndex(db.collection('supplierAllocations'), {tenantId: 1, sourceId: 1}),
        // Phase 3.5 supplierAllocations indexes
        safeCreateIndex(db.collection('supplierAllocations'), {tenantId: 1, supplierId: 1, effectiveDate: -1}),
        safeCreateIndex(db.collection('supplierAllocations'), {tenantId: 1, isReversal: 1, reversesAllocationId: 1}),

        safeCreateIndex(db.collection('supplierAdvances'), {tenantId: 1, advanceNumber: 1}, {unique: true}),
        safeCreateIndex(db.collection('supplierAdvances'), {tenantId: 1, supplierId: 1, status: 1}),
        // Phase 3.5 supplierAdvances index
        safeCreateIndex(db.collection('supplierAdvances'), {tenantId: 1, supplierId: 1, status: 1, createdAt: -1}),

        safeCreateIndex(db.collection('supplierCreditNotes'), {tenantId: 1, creditNoteNumber: 1}, {unique: true}),
        safeCreateIndex(db.collection('supplierCreditNotes'), {tenantId: 1, supplierId: 1, date: -1}),
        // Phase 3.5 supplierCreditNotes index
        safeCreateIndex(db.collection('supplierCreditNotes'), {tenantId: 1, purchaseId: 1, date: -1}),

        safeCreateIndex(db.collection('supplierReturns'), {tenantId: 1, returnNumber: 1}, {unique: true}),
        safeCreateIndex(db.collection('supplierReturns'), {tenantId: 1, purchaseId: 1}),
        // Phase 3.5 supplierReturns index
        safeCreateIndex(db.collection('supplierReturns'), {tenantId: 1, supplierId: 1, createdAt: -1}),

        safeCreateIndex(db.collection('supplierRefunds'), {tenantId: 1, refundNumber: 1}, {unique: true}),
        safeCreateIndex(db.collection('supplierRefunds'), {tenantId: 1, supplierId: 1, date: -1}),

        safeCreateIndex(db.collection('tenantAccountBalances'), {tenantId: 1, account: 1}, {unique: true}),
        safeCreateIndex(db.collection('tenantCounters'), {tenantId: 1, sequenceType: 1, year: 1}, {unique: true}),
        safeCreateIndex(db.collection('idempotencyOperations'), {tenantId: 1, idempotencyKey: 1}, {unique: true}),

        // Phase 4: Quotations, invoices, customer receipts/advances/allocations, warranties, reservations
        safeCreateIndex(db.collection('quotations'), {tenantId: 1, quotationNumber: 1}, {unique: true}),
        safeCreateIndex(db.collection('quotations'), {tenantId: 1, status: 1, createdAt: -1}),
        safeCreateIndex(db.collection('quotations'), {tenantId: 1, customerId: 1, status: 1, createdAt: -1}),

        safeCreateIndex(db.collection('invoices'), {tenantId: 1, invoiceNumber: 1}, {
          unique: true,
          partialFilterExpression: {status: 'Issued', invoiceNumber: {$type: 'string', $gt: ''}},
        }),
        safeCreateIndex(db.collection('invoices'), {tenantId: 1, status: 1, invoiceDate: -1}),
        safeCreateIndex(db.collection('invoices'), {tenantId: 1, customerId: 1, status: 1, invoiceDate: -1}),
        safeCreateIndex(db.collection('invoices'), {tenantId: 1, duePaise: 1, status: 1}),

        safeCreateIndex(db.collection('customerReceipts'), {tenantId: 1, receiptNumber: 1}, {unique: true}),
        safeCreateIndex(db.collection('customerReceipts'), {tenantId: 1, customerId: 1, date: -1}),
        safeCreateIndex(db.collection('customerReceipts'), {tenantId: 1, invoiceId: 1}),

        safeCreateIndex(db.collection('customerAllocations'), {tenantId: 1, targetType: 1, targetId: 1}),
        safeCreateIndex(db.collection('customerAllocations'), {tenantId: 1, sourceId: 1}),
        safeCreateIndex(db.collection('customerAllocations'), {tenantId: 1, customerId: 1, effectiveDate: -1}),

        safeCreateIndex(db.collection('customerAdvances'), {tenantId: 1, advanceNumber: 1}, {unique: true}),
        safeCreateIndex(db.collection('customerAdvances'), {tenantId: 1, customerId: 1, status: 1}),

        safeCreateIndex(db.collection('warranties'), {tenantId: 1, invoiceId: 1}),
        safeCreateIndex(db.collection('warranties'), {tenantId: 1, customerId: 1, status: 1}),
        safeCreateIndex(db.collection('warranties'), {tenantId: 1, productId: 1, status: 1}),

        safeCreateIndex(db.collection('stockReservations'), {tenantId: 1, customerId: 1, status: 1}),
        safeCreateIndex(db.collection('stockReservations'), {tenantId: 1, productId: 1, status: 1}),
        safeCreateIndex(db.collection('stockReservations'), {tenantId: 1, expiresAt: 1, status: 1}),
        safeCreateIndex(db.collection('stockMovements'), {tenantId: 1, reservationId: 1}),
        safeCreateIndex(db.collection('serialUnits'), {tenantId: 1, reservationId: 1}),
      ]);
    })().catch(e => {
      globalDb.itechIndexes = undefined;
      throw e;
    });
  }
  return globalDb.itechIndexes;
}
