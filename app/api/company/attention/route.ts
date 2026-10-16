import {z} from 'zod';
import {checkOrigin, endpoint, jsonBody, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {todayInKolkata} from '@/server/purchase-schema';
import {digest} from '@/server/security';

export const runtime = 'nodejs';

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  area: 'Setup' | 'Closing' | 'Supplier' | 'Customer' | 'Service' | 'Stock' | 'Enquiry' | 'Profit';
  occurredAt: string;
  key?: string;
  unread?: boolean;
};

const ReadInput = z.object({keys: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(100)}).strict();

function itemKey(tenantId: string, userId: string, item: AttentionItem) {
  return digest(`${tenantId}:${userId}:${item.id}:${item.occurredAt}:${item.detail}`);
}

export async function GET() {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const {tenantId, userId} = identity;
    const db = await database();
    const today = todayInKolkata();
    const deadline = {$or: [
      {promisedPaymentDate: {$lte: today, $gte: '1900-01-01'}},
      {$and: [
        {$or: [{promisedPaymentDate: {$exists: false}}, {promisedPaymentDate: null}, {promisedPaymentDate: ''}]},
        {dueDate: {$lte: today, $gte: '1900-01-01'}},
      ]},
    ]};

    const [purchases, invoices, jobs, returns, opening, gate, pendingProfit, enquiries, receipts, lowStock] = await Promise.all([
      db.collection<any>('purchases').find(
        {tenantId, billStatus: {$in: ['Posted', 'Credited', 'FullyCredited']}, duePaise: {$gt: 0}, ...deadline},
        {projection: {_id: 1, supplierId: 1, purchaseNumber: 1, supplierInvoiceNumber: 1, dueDate: 1, promisedPaymentDate: 1, updatedAt: 1}}
      ).sort({dueDate: 1, _id: 1}).limit(6).toArray(),
      db.collection<any>('invoices').find(
        {tenantId, status: 'Issued', duePaise: {$gt: 0}, ...deadline},
        {projection: {_id: 1, invoiceNumber: 1, dueDate: 1, promisedPaymentDate: 1, updatedAt: 1}}
      ).sort({dueDate: 1, _id: 1}).limit(6).toArray(),
      db.collection<any>('serviceJobs').find(
        {tenantId, status: {$in: ['ReadyForDelivery', 'EstimatePending', 'WaitingForParts']}},
        {projection: {_id: 1, jobNumber: 1, status: 1, updatedAt: 1, receivedDate: 1}}
      ).sort({updatedAt: 1, _id: 1}).limit(6).toArray(),
      db.collection<any>('supplierReturns').find(
        {tenantId, isReversed: {$ne: true}, creditStatus: {$ne: 'Accepted'}, creditNoteId: null},
        {projection: {_id: 1, supplierId: 1, returnNumber: 1, createdAt: 1, returnDate: 1}}
      ).sort({createdAt: 1, _id: 1}).limit(6).toArray(),
      db.collection<any>('openingSetups').findOne({tenantId}, {projection: {status: 1, cutoffDate: 1, createdAt: 1, updatedAt: 1}}),
      db.collection<any>('businessDayGates').findOne({_id: `DAY-${tenantId}`}, {projection: {closedThrough: 1}}),
      db.collection<any>('invoices').findOne(
        {tenantId, status: 'Issued', invoiceDate: today, manualProfitPaise: null, calculatedProfitPaise: null},
        {projection: {_id: 1, updatedAt: 1, createdAt: 1}}
      ),
      db.collection<any>('enquiries').find(
        {tenantId, status: {$nin: ['Won', 'Closed']}, followUpDate: {$lte: today, $gte: '1900-01-01'}},
        {projection: {_id: 1, enquiryNumber: 1, followUpDate: 1, updatedAt: 1}}
      ).sort({followUpDate: 1, _id: 1}).limit(6).toArray(),
      db.collection<any>('purchases').find(
        {tenantId, documentStatus: 'Confirmed', billStatus: {$in: ['Posted', 'Credited', 'FullyCredited']}, receiptStatus: {$in: ['NotReceived', 'PartlyReceived']}},
        {projection: {_id: 1, purchaseNumber: 1, receiptStatus: 1, orderDate: 1, updatedAt: 1}}
      ).sort({orderDate: 1, _id: 1}).limit(6).toArray(),
      db.collection<any>('products').aggregate([
        {$match: {tenantId, status: 'Active'}},
        {$lookup: {from: 'stockLots', let: {productId: '$_id'}, pipeline: [
          {$match: {$expr: {$and: [{$eq: ['$tenantId', tenantId]}, {$eq: ['$productId', '$$productId']}]}}},
          {$group: {_id: null, available: {$sum: {$ifNull: ['$quantitySellable', 0]}}}},
        ], as: 'stock'}},
        {$set: {available: {$ifNull: [{$first: '$stock.available'}, 0]}, threshold: {$ifNull: ['$low', 0]}}},
        {$match: {$expr: {$lte: ['$available', '$threshold']}}},
        {$sort: {available: 1, name: 1}},
        {$limit: 6},
        {$project: {_id: 1, name: 1, available: 1, threshold: 1, updatedAt: 1}},
      ]).toArray(),
    ]);

    const items: AttentionItem[] = [];
    if (!opening || opening.status !== 'Finalized') {
      items.push({id: 'setup', title: 'Complete opening setup', detail: 'Review your starting balances before posting.', href: '/settings', area: 'Setup', occurredAt: opening?.updatedAt?.toISOString?.() || opening?.createdAt?.toISOString?.() || today});
    } else {
      const through = gate?.closedThrough || opening.cutoffDate;
      if (/^\d{4}-\d{2}-\d{2}$/.test(through || '')) {
        const next = new Date(`${through}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        const date = next.toISOString().slice(0, 10);
        if (date < today) items.push({id: 'closing', title: 'Previous days need closing', detail: `Review from ${date}.`, href: `/profit?date=${date}`, area: 'Closing', occurredAt: date});
      }
    }
    for (const p of purchases) {
      const due = p.promisedPaymentDate || p.dueDate;
      items.push({id: `purchase:${p._id}`, title: `Supplier bill ${p.supplierInvoiceNumber || p.purchaseNumber}`, detail: `${due < today ? 'Overdue' : 'Due today'} · Pay, review a return, or extend the deadline.`, href: `/suppliers/${p.supplierId}?tab=Purchases`, area: 'Supplier', occurredAt: due || p.updatedAt?.toISOString?.() || today});
    }
    for (const i of invoices) {
      const due = i.promisedPaymentDate || i.dueDate;
      items.push({id: `invoice:${i._id}`, title: `Collect payment · ${i.invoiceNumber}`, detail: `${due < today ? 'Overdue' : 'Due today'} · ${due}`, href: `/sales/${i._id}`, area: 'Customer', occurredAt: due || i.updatedAt?.toISOString?.() || today});
    }
    for (const j of jobs) items.push({id: `job:${j._id}`, title: j.jobNumber, detail: j.status === 'ReadyForDelivery' ? 'Ready for customer collection.' : j.status === 'EstimatePending' ? 'Estimate approval needed.' : 'Waiting for parts.', href: `/services/${j._id}`, area: 'Service', occurredAt: j.updatedAt?.toISOString?.() || j.receivedDate || today});
    for (const r of returns) items.push({id: `return:${r._id}`, title: `Confirm supplier credit · ${r.returnNumber}`, detail: 'Goods returned; financial credit awaits confirmation.', href: `/suppliers/${r.supplierId}?tab=Returns`, area: 'Supplier', occurredAt: r.createdAt?.toISOString?.() || r.returnDate || today});
    for (const e of enquiries) items.push({id: `enquiry:${e._id}`, title: `Follow up · ${e.enquiryNumber}`, detail: `${e.followUpDate < today ? 'Follow-up overdue' : 'Follow-up due today'}.`, href: '/enquiries', area: 'Enquiry', occurredAt: e.followUpDate});
    for (const p of receipts) items.push({id: `receipt:${p._id}`, title: `Receive stock · ${p.purchaseNumber}`, detail: p.receiptStatus === 'PartlyReceived' ? 'Some ordered units are still pending.' : 'Supplier bill posted; stock has not been received.', href: `/purchases/${p._id}/receive`, area: 'Stock', occurredAt: p.updatedAt?.toISOString?.() || p.orderDate || today});
    for (const product of lowStock) items.push({id: `stock:${product._id}`, title: product.available === 0 ? `Out of stock · ${product.name}` : `Low stock · ${product.name}`, detail: `${product.available} available · Restock level ${product.threshold}.`, href: `/inventory/${product._id}`, area: 'Stock', occurredAt: product.updatedAt?.toISOString?.() || today});
    if (pendingProfit) items.push({id: 'profit', title: 'Complete missing profit entries', detail: 'Review costs before closing today.', href: `/profit?date=${today}`, area: 'Profit', occurredAt: pendingProfit.updatedAt?.toISOString?.() || pendingProfit.createdAt?.toISOString?.() || today});

    for (const item of items) item.key = itemKey(tenantId, userId, item);
    const keys = items.map((item) => item.key as string);
    const reads = keys.length ? await db.collection<any>('attentionReads').find({tenantId, userId, key: {$in: keys}}, {projection: {key: 1}}).toArray() : [];
    const readKeys = new Set(reads.map((read) => read.key));
    for (const item of items) item.unread = !readKeys.has(item.key as string);

    const unreadCount = items.filter((item) => item.unread).length;
    return {
      items,
      unreadCount,
      hasMore: [purchases, invoices, jobs, returns, enquiries, receipts, lowStock].some((rows) => rows.length === 6),
      checkedAt: new Date().toISOString(),
    };
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const {tenantId, userId} = await requireIdentity();
    const {keys} = ReadInput.parse(await jsonBody(request, 16_384));
    const db = await database();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 90 * 86400000);
    await db.collection('attentionReads').bulkWrite(keys.map((key) => ({
      updateOne: {
        filter: {tenantId, userId, key},
        update: {$set: {readAt: now, expiresAt}, $setOnInsert: {tenantId, userId, key}},
        upsert: true,
      },
    })), {ordered: false});
    return {success: true, marked: keys.length};
  });
}
