import {endpoint, requireIdentity} from '@/server/auth';
import {AppError, database} from '@/server/db';
import {col} from '@/server/purchase-service';
import {todayInKolkata} from '@/server/purchase-schema';
import {signedAccountMovementPaise} from '@/server/account-initialization';
import {getOpeningBalanceForDate, isProfitUnlocked} from '@/server/closing-service';

export const runtime = 'nodejs';

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const tenantId = identity.tenantId;
    const today = todayInKolkata();
    const start = new Date(Date.parse(today + 'T00:00:00Z') - 29 * 86400000).toISOString().slice(0, 10);
    const url = new URL(request.url);
    const periodFrom = url.searchParams.get('from') || today;
    const periodTo = url.searchParams.get('to') || today;
    if (!validDate(periodFrom) || !validDate(periodTo)) throw new AppError(400, 'Invalid dashboard date range.');
    if (periodFrom > periodTo) throw new AppError(400, 'Dashboard start date must be on or before the end date.');
    if (periodTo > today) throw new AppError(400, 'Dashboard date range cannot extend into the future.');

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

    const periodDateFilter = {$gte: periodFrom, $lte: periodTo};
    const signedMovement = {
      $ifNull: [
        '$qty',
        {$cond: [{$eq: ['$direction', 'Out']}, {$multiply: ['$amountPaise', -1]}, '$amountPaise']},
      ],
    };
    const [periodInvoiceRows, periodMovementRows, periodAdjustmentRows, openingBalances] = await Promise.all([
      col(db, 'invoices').aggregate([
        {$match: {tenantId, status: 'Issued', invoiceDate: periodDateFilter}},
        {$addFields: {dashboardProfitPaise: {$ifNull: ['$manualProfitPaise', '$calculatedProfitPaise']}}},
        {$group: {
          _id: null,
          totalPaise: {$sum: {$ifNull: ['$totalPaise', 0]}},
          outstandingPaise: {$sum: {$ifNull: ['$duePaise', 0]}},
          count: {$sum: 1},
          newGoodsPaise: {$sum: {$cond: [{$eq: ['$businessCategory', 'NewGoods']}, {$ifNull: ['$totalPaise', 0]}, 0]}},
          usedGoodsPaise: {$sum: {$cond: [{$eq: ['$businessCategory', 'UsedGoods']}, {$ifNull: ['$totalPaise', 0]}, 0]}},
          servicePaise: {$sum: {$cond: [{$eq: ['$businessCategory', 'Service']}, {$ifNull: ['$totalPaise', 0]}, 0]}},
          tradingProfitPaise: {$sum: {$ifNull: ['$dashboardProfitPaise', 0]}},
          pendingProfitCount: {$sum: {$cond: [{$eq: ['$dashboardProfitPaise', null]}, 1, 0]}},
        }},
      ]).toArray(),
      col(db, 'accountMovements').aggregate([
        {$match: {tenantId, date: periodDateFilter}},
        {$addFields: {dashboardSignedPaise: signedMovement}},
        {$group: {
          _id: {account: '$account', category: '$category', sourceType: '$sourceType'},
          signedPaise: {$sum: '$dashboardSignedPaise'},
        }},
      ]).toArray(),
      col(db, 'manualProfitAdjustments').aggregate([
        {$match: {tenantId, date: periodDateFilter}},
        {$group: {
          _id: null,
          tradingProfitPaise: {$sum: {$ifNull: ['$signedAdjustmentPaise', 0]}},
          pendingProfitCount: {$sum: {$cond: [{$eq: [{$ifNull: ['$signedAdjustmentPaise', null]}, null]}, 1, 0]}},
        }},
      ]).toArray(),
      getOpeningBalanceForDate(db, tenantId, periodFrom),
    ]);

    const periodInvoice: any = periodInvoiceRows[0] || {};
    const periodAdjustment: any = periodAdjustmentRows[0] || {};
    const buckets = {
      cashInPaise: 0, cashOutPaise: 0, bankInPaise: 0, bankOutPaise: 0,
      collectionCashPaise: 0, collectionBankPaise: 0,
      expenseCashPaise: 0, expenseBankPaise: 0,
      supplierCashPaise: 0, supplierBankPaise: 0,
      refundCashPaise: 0, refundBankPaise: 0,
    };

    for (const row of periodMovementRows as any[]) {
      const account = row._id?.account === 'Cash' ? 'cash' : 'bank';
      const signed = Number(row.signedPaise || 0);
      if (signed >= 0) buckets[account === 'cash' ? 'cashInPaise' : 'bankInPaise'] += signed;
      else buckets[account === 'cash' ? 'cashOutPaise' : 'bankOutPaise'] += Math.abs(signed);

      const sourceType = row._id?.sourceType || '';
      const category = row._id?.category || '';
      if (sourceType === 'CustomerReceipt' || sourceType === 'CustomerReceiptReversal') {
        buckets[account === 'cash' ? 'collectionCashPaise' : 'collectionBankPaise'] += signed;
      }
      if (category === 'Expense') {
        buckets[account === 'cash' ? 'expenseCashPaise' : 'expenseBankPaise'] += Math.abs(signed);
      } else if (category === 'ExpenseReversal') {
        buckets[account === 'cash' ? 'expenseCashPaise' : 'expenseBankPaise'] -= Math.abs(signed);
      }
      if (sourceType === 'SupplierPayment' && signed < 0) {
        buckets[account === 'cash' ? 'supplierCashPaise' : 'supplierBankPaise'] += Math.abs(signed);
      } else if (sourceType === 'SupplierPaymentReversal' && signed > 0) {
        buckets[account === 'cash' ? 'supplierCashPaise' : 'supplierBankPaise'] -= signed;
      }
      if ((sourceType === 'CustomerRefund' || sourceType === 'CustomerReturnRefund') && signed < 0) {
        buckets[account === 'cash' ? 'refundCashPaise' : 'refundBankPaise'] += Math.abs(signed);
      } else if (sourceType === 'CustomerRefundReversal' && signed > 0) {
        buckets[account === 'cash' ? 'refundCashPaise' : 'refundBankPaise'] -= signed;
      }
    }

    const closingCashPaise = openingBalances.cashPaise + buckets.cashInPaise - buckets.cashOutPaise;
    const closingBankPaise = openingBalances.bankPaise + buckets.bankInPaise - buckets.bankOutPaise;
    const expensesPaise = buckets.expenseCashPaise + buckets.expenseBankPaise;
    const tradingProfitPaise = (periodInvoice.tradingProfitPaise || 0) + (periodAdjustment.tradingProfitPaise || 0);
    const profitUnlocked = isProfitUnlocked(identity);
    const periodSummary = {
      dateFrom: periodFrom,
      dateTo: periodTo,
      sales: {
        totalPaise: periodInvoice.totalPaise || 0,
        outstandingPaise: periodInvoice.outstandingPaise || 0,
        invoiceCount: periodInvoice.count || 0,
        newGoodsPaise: periodInvoice.newGoodsPaise || 0,
        usedGoodsPaise: periodInvoice.usedGoodsPaise || 0,
        servicePaise: periodInvoice.servicePaise || 0,
        cashReceivedPaise: buckets.collectionCashPaise,
        bankReceivedPaise: buckets.collectionBankPaise,
      },
      expenses: {cashPaise: buckets.expenseCashPaise, bankPaise: buckets.expenseBankPaise, totalPaise: expensesPaise},
      collections: {cashPaise: buckets.collectionCashPaise, bankPaise: buckets.collectionBankPaise, totalPaise: buckets.collectionCashPaise + buckets.collectionBankPaise},
      supplierPayments: {cashPaise: buckets.supplierCashPaise, bankPaise: buckets.supplierBankPaise, totalPaise: buckets.supplierCashPaise + buckets.supplierBankPaise},
      customerRefunds: {cashPaise: buckets.refundCashPaise, bankPaise: buckets.refundBankPaise, totalPaise: buckets.refundCashPaise + buckets.refundBankPaise},
      accountPosition: {
        openingCashPaise: openingBalances.cashPaise,
        openingBankPaise: openingBalances.bankPaise,
        openingCombinedPaise: openingBalances.cashPaise + openingBalances.bankPaise,
        cashInPaise: buckets.cashInPaise,
        bankInPaise: buckets.bankInPaise,
        cashOutPaise: buckets.cashOutPaise,
        bankOutPaise: buckets.bankOutPaise,
        closingCashPaise,
        closingBankPaise,
        closingCombinedPaise: closingCashPaise + closingBankPaise,
      },
      profit: {
        unlocked: profitUnlocked,
        tradingProfitPaise: profitUnlocked ? tradingProfitPaise : null,
        netProfitPaise: profitUnlocked ? tradingProfitPaise - expensesPaise : null,
        pendingCount: (periodInvoice.pendingProfitCount || 0) + (periodAdjustment.pendingProfitCount || 0),
      },
    };

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
      periodSummary,
    };
  });
}
