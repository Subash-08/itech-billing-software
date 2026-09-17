import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {col} from '@/server/purchase-service';
import {todayInKolkata} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET() {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const tenantId = identity.tenantId;
    const today = todayInKolkata();

    const [
      todayInvoices,
      cashAccount,
      bankAccount,
      activeJobsCount,
      readyJobsCount,
      products,
      recentInvoices,
      todayMovements,
      allCustomerDues,
      allSupplierDues,
    ] = await Promise.all([
      col(db, 'invoices')
        .find({tenantId, status: 'Issued', invoiceDate: today})
        .toArray(),
      col(db, 'tenantAccountBalances')
        .findOne({tenantId, accountType: 'Cash'}),
      col(db, 'tenantAccountBalances')
        .findOne({tenantId, accountType: 'Bank'}),
      col(db, 'serviceJobs')
        .countDocuments({tenantId, status: {$nin: ['Delivered', 'Cancelled', 'Unrepaired']}}),
      col(db, 'serviceJobs')
        .countDocuments({tenantId, status: 'ReadyForDelivery'}),
      col(db, 'products')
        .find({tenantId, status: 'Active'})
        .project({stock: 1, low: 1})
        .toArray(),
      col(db, 'invoices')
        .find({tenantId, status: 'Issued'})
        .sort({invoiceDate: -1, createdAt: -1})
        .limit(5)
        .toArray(),
      col(db, 'accountMovements')
        .find({tenantId, date: today})
        .sort({createdAt: -1})
        .limit(5)
        .toArray(),
      col(db, 'invoices')
        .aggregate([
          {$match: {tenantId, status: 'Issued', duePaise: {$gt: 0}}},
          {$group: {_id: null, totalDue: {$sum: '$duePaise'}}},
        ])
        .toArray(),
      col(db, 'purchases')
        .aggregate([
          {$match: {tenantId, billStatus: 'Posted', duePaise: {$gt: 0}}},
          {$group: {_id: null, totalDue: {$sum: '$duePaise'}}},
        ])
        .toArray(),
    ]);

    const todaySalesPaise = todayInvoices.reduce((s, inv) => s + (inv.totalPaise || 0), 0);
    const lowStockCount = products.filter((p: any) => (p.stock ?? 0) <= (p.low ?? 2)).length;
    const customerDuesPaise = allCustomerDues[0]?.totalDue || 0;
    const supplierDuesPaise = allSupplierDues[0]?.totalDue || 0;

    return {
      todayDate: today,
      sales: {
        todayCount: todayInvoices.length,
        todayTotalPaise: todaySalesPaise,
      },
      cash: {
        balancePaise: cashAccount?.balancePaise ?? 0,
      },
      bank: {
        balancePaise: bankAccount?.balancePaise ?? 0,
      },
      serviceJobs: {
        activeCount: activeJobsCount,
        readyCount: readyJobsCount,
      },
      inventory: {
        lowStockCount,
      },
      dues: {
        customerOutstandingPaise: customerDuesPaise,
        supplierOutstandingPaise: supplierDuesPaise,
      },
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv._id,
        invoiceNumber: inv.invoiceNumber || inv._id,
        customerName: inv.customerSnapshot?.name || 'Customer',
        customerId: inv.customerId,
        category: inv.businessCategory || 'NewGoods',
        amountPaise: inv.totalPaise || 0,
        duePaise: inv.duePaise || 0,
        paymentStatus: inv.paymentStatus || (inv.duePaise === 0 ? 'Paid' : 'Unpaid'),
      })),
      todayMovements: todayMovements.map((m) => ({
        id: m._id,
        purpose: m.purpose || m.sourceType || 'Transaction',
        account: m.accountType,
        amountPaise: m.amountPaise || Math.abs(m.signedAmountPaise || 0),
        direction: m.direction || (m.signedAmountPaise >= 0 ? 'In' : 'Out'),
        reference: m.sourceReference || m.reference || '',
      })),
    };
  });
}
