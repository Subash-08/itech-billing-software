import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {todayInKolkata} from '@/server/purchase-schema';
export const runtime = 'nodejs';
export async function GET() {
  return endpoint(async () => {
    const {tenantId} = await requireIdentity();
    const db = await database();
    const today = todayInKolkata();
    const deadline = {$or: [{promisedPaymentDate: {$lte: today, $gte: '1900-01-01'}},
      {$and: [{$or: [{promisedPaymentDate: {$exists: false}}, {promisedPaymentDate: null}, {promisedPaymentDate: ''}]}, {dueDate: {$lte: today, $gte: '1900-01-01'}}]}]};
    const [purchases, invoices, jobs, returns, opening, gate, pendingProfit] = await Promise.all([
      db.collection<any>('purchases').find({tenantId, billStatus: {$in: ['Posted','Credited','FullyCredited']}, duePaise: {$gt: 0}, ...deadline},
        {projection: {_id: 1, supplierId: 1, purchaseNumber: 1, supplierInvoiceNumber: 1, dueDate: 1, promisedPaymentDate: 1}}).sort({dueDate: 1, _id: 1}).limit(6).toArray(),
      db.collection<any>('invoices').find({tenantId, status: 'Issued', duePaise: {$gt: 0}, ...deadline},
        {projection: {_id: 1, invoiceNumber: 1, dueDate: 1, promisedPaymentDate: 1}}).sort({dueDate: 1, _id: 1}).limit(6).toArray(),
      db.collection<any>('serviceJobs').find({tenantId, status: {$in: ['ReadyForDelivery','EstimatePending','WaitingForParts']}},
        {projection: {_id: 1, jobNumber: 1, status: 1}}).sort({updatedAt: 1, _id: 1}).limit(6).toArray(),
      db.collection<any>('supplierReturns').find({tenantId, isReversed: {$ne: true}, creditStatus: {$ne: 'Accepted'}, creditNoteId: null},
        {projection: {_id: 1, supplierId: 1, returnNumber: 1}}).sort({createdAt: 1, _id: 1}).limit(6).toArray(),
      db.collection<any>('openingSetups').findOne({tenantId}, {projection: {status: 1, cutoffDate: 1}}),
      db.collection<any>('businessDayGates').findOne({_id: `DAY-${tenantId}`}, {projection: {closedThrough: 1}}),
      db.collection<any>('invoices').findOne({tenantId, status: 'Issued', invoiceDate: today,
        manualProfitPaise: null, calculatedProfitPaise: null}, {projection: {_id: 1}}),
    ]);
    const items: Array<{id: string; title: string; detail: string; href: string}> = [];
    if (!opening || opening.status !== 'Finalized') items.push({id:'setup',title:'Complete opening setup',detail:'Review your starting balances before posting.',href:'/settings'});
    else {
      const through = gate?.closedThrough || opening.cutoffDate;
      if (/^\d{4}-\d{2}-\d{2}$/.test(through || '')) {
        const next = new Date(`${through}T00:00:00Z`); next.setUTCDate(next.getUTCDate()+1);
        const date = next.toISOString().slice(0,10);
        if (date < today) items.push({id:'closing',title:'Previous days need closing',detail:`Review from ${date}.`,href:`/profit?date=${date}`});
      }
    }
    for (const p of purchases) items.push({id:`purchase:${p._id}`, title:`Supplier bill ${p.supplierInvoiceNumber || p.purchaseNumber}`,
      detail:`${(p.promisedPaymentDate || p.dueDate) < today ? 'Overdue' : 'Due today'} · Pay, review a return, or extend the deadline.`,href:`/suppliers/${p.supplierId}?tab=Purchases`});
    for (const i of invoices) items.push({id:`invoice:${i._id}`,title:`Collect payment · ${i.invoiceNumber}`,detail:`Due ${i.promisedPaymentDate || i.dueDate}`,href:`/sales/${i._id}`});
    for (const j of jobs) items.push({id:`job:${j._id}`,title:j.jobNumber,detail: j.status === 'ReadyForDelivery' ? 'Ready for customer collection' : j.status === 'EstimatePending' ? 'Estimate approval needed' : 'Waiting for parts',href:`/services/${j._id}`});
    for (const r of returns) items.push({id:`return:${r._id}`,title:`Confirm supplier credit · ${r.returnNumber}`,detail:'Goods returned; financial credit awaits confirmation.',href:`/suppliers/${r.supplierId}?tab=Returns`});
    if (pendingProfit) items.push({id:'profit',title:'Complete missing profit entries',detail:'Review costs before closing today.',href:`/profit?date=${today}`});
    return {items, hasMore: [purchases,invoices,jobs,returns].some(rows => rows.length === 6), checkedAt: new Date().toISOString()};
  });
}
