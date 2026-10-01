import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {col} from '@/server/purchase-service';
import {todayInKolkata} from '@/server/purchase-schema';
import {signedAccountMovementPaise} from '@/server/account-initialization';

export const runtime = 'nodejs';

export async function GET() {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const tenantId = identity.tenantId;
    const today = todayInKolkata();
    const start = new Date(Date.parse(today + 'T00:00:00Z') - 29 * 86400000).toISOString().slice(0, 10);

    const [invoiceFacetRows, accountRows, serviceFacetRows, products, stock,
      movementFacetRows, supplierDueRows, receivableRows, payableRows] = await Promise.all([
      col(db, 'invoices').aggregate([
        {$match: {tenantId, status: 'Issued'}},
        {$facet: {
          today: [{$match: {invoiceDate: today}}, {$group: {_id: null, totalPaise: {$sum: '$totalPaise'}, count: {$sum: 1}}}],
          recent: [{$sort: {invoiceDate: -1, createdAt: -1, _id: -1}}, {$limit: 5}, {$project: {
            _id: 1, invoiceNumber: 1, customerId: 1, customerSnapshot: 1, businessCategory: 1,
            totalPaise: 1, duePaise: 1, paymentStatus: 1,
          }}],
          trend: [{$match: {invoiceDate: {$gte: start, $lte: today}}},
            {$group: {_id: '$invoiceDate', salesPaise: {$sum: '$totalPaise'}, count: {$sum: 1}}}, {$sort: {_id: 1}}],
          dues: [{$match: {duePaise: {$gt: 0}}}, {$group: {_id: null, totalDue: {$sum: '$duePaise'}}}],
        }},
      ]).toArray(),
      col(db, 'tenantAccountBalances').find(
        {tenantId, account: {$in: ['Cash', 'Bank']}},
        {projection: {account: 1, balancePaise: 1}}
      ).toArray(),
      col(db, 'serviceJobs').aggregate([
        {$match: {tenantId}},
        {$facet: {
          active: [{$match: {status: {$nin: ['Delivered', 'Cancelled', 'Unrepaired']}}}, {$count: 'count'}],
          ready: [{$match: {status: 'ReadyForDelivery'}}, {$count: 'count'}],
        }},
      ]).toArray(),
      col(db, 'products').find({tenantId, status: 'Active'}, {projection: {_id: 1, low: 1}}).toArray(),
      col(db, 'stockLots').aggregate([
        {$match: {tenantId}}, {$group: {_id: '$productId', available: {$sum: '$quantitySellable'}}},
      ]).toArray(),
      col(db, 'accountMovements').aggregate([
        {$match: {tenantId, date: today}},
        {$addFields: {dashboardSignedPaise: {$ifNull: ['$qty', {$cond: [{$eq: ['$direction', 'Out']}, {$multiply: ['$amountPaise', -1]}, '$amountPaise']}]}}},
        {$facet: {
          recent: [{$sort: {createdAt: -1, _id: -1}}, {$limit: 5}],
          // Cash-to-bank transfers create one In and one Out movement but do
          // not represent external money received or paid by the business.
          totals: [{$match: {sourceType: {$nin: ['ManualTransfer', 'ManualTransferReversal']}}}, {$group: {
            _id: null,
            moneyInPaise: {$sum: {$cond: [{$gte: ['$dashboardSignedPaise', 0]}, '$dashboardSignedPaise', 0]}},
            moneyOutPaise: {$sum: {$cond: [{$lt: ['$dashboardSignedPaise', 0]}, {$multiply: ['$dashboardSignedPaise', -1]}, 0]}},
          }}],
        }},
      ]).toArray(),
      col(db, 'purchases').aggregate([
        {$match: {tenantId, billStatus: {$in: ['Posted', 'Credited', 'FullyCredited']}, duePaise: {$gt: 0}}},
        {$group: {_id: null, totalDue: {$sum: '$duePaise'}}},
      ]).toArray(),
      col(db, 'openingReceivables').aggregate([
        {$match: {tenantId, remainingAmountPaise: {$gt: 0}}}, {$group: {_id: null, amount: {$sum: '$remainingAmountPaise'}}},
      ]).toArray(),
      col(db, 'openingPayables').aggregate([
        {$match: {tenantId, remainingAmountPaise: {$gt: 0}}}, {$group: {_id: null, amount: {$sum: '$remainingAmountPaise'}}},
      ]).toArray(),
    ]);

    const invoiceFacet: any = invoiceFacetRows[0] || {};
    const serviceFacet: any = serviceFacetRows[0] || {};
    const movementFacet: any = movementFacetRows[0] || {};
    const accountByName = new Map(accountRows.map((row: any) => [row.account, row.balancePaise || 0]));
    const quantities = new Map(stock.map((row: any) => [String(row._id), row.available || 0]));
    const lowStockCount = products.filter((product: any) =>
      (quantities.get(String(product._id)) || 0) <= (product.low ?? 2)
    ).length;
    const todaySummary = invoiceFacet.today?.[0] || {};
    const movementTotals = movementFacet.totals?.[0] || {};
    const customerDuesPaise = (invoiceFacet.dues?.[0]?.totalDue || 0) + (receivableRows[0]?.amount || 0);
    const supplierDuesPaise = (supplierDueRows[0]?.totalDue || 0) + (payableRows[0]?.amount || 0);

    return {
      todayDate: today,
      salesTrend: (invoiceFacet.trend || []).map((row: any) => ({date: row._id, salesPaise: row.salesPaise, count: row.count})),
      sales: {todayCount: todaySummary.count || 0, todayTotalPaise: todaySummary.totalPaise || 0},
      cash: {balancePaise: accountByName.get('Cash') || 0},
      bank: {balancePaise: accountByName.get('Bank') || 0},
      moneyToday: {inPaise: movementTotals.moneyInPaise || 0, outPaise: movementTotals.moneyOutPaise || 0},
      serviceJobs: {activeCount: serviceFacet.active?.[0]?.count || 0, readyCount: serviceFacet.ready?.[0]?.count || 0},
      inventory: {lowStockCount},
      dues: {customerOutstandingPaise: customerDuesPaise, supplierOutstandingPaise: supplierDuesPaise},
      recentInvoices: (invoiceFacet.recent || []).map((invoice: any) => ({
        id: invoice._id, invoiceNumber: invoice.invoiceNumber || invoice._id,
        customerName: invoice.customerSnapshot?.name || 'Customer', customerId: invoice.customerId,
        category: invoice.businessCategory || 'NewGoods', amountPaise: invoice.totalPaise || 0,
        duePaise: invoice.duePaise || 0,
        paymentStatus: invoice.paymentStatus || (invoice.duePaise === 0 ? 'Paid' : 'Unpaid'),
      })),
      todayMovements: (movementFacet.recent || []).map((movement: any) => {
        const signed = signedAccountMovementPaise(movement);
        return {id: movement._id, purpose: movement.reason || movement.purpose || movement.sourceType || 'Transaction',
          account: movement.account, amountPaise: Math.abs(signed), direction: signed >= 0 ? 'In' : 'Out',
          reference: movement.sourceReference || movement.reference || ''};
      }),
    };
  });
}
