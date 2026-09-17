import {endpoint, requireIdentity, requireProfit} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {col} from '@/server/purchase-service';
import {todayInKolkata} from '@/server/purchase-schema';
import {isValidCalendarDate} from '@/server/master-schema';
import {signedAccountMovementPaise} from '@/server/account-initialization';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const url = new URL(request.url);
    const reportType = url.searchParams.get('report') || 'Sales';
    const from = url.searchParams.get('from') || todayInKolkata().slice(0, 8) + '01';
    const to = url.searchParams.get('to') || todayInKolkata();
    if (!isValidCalendarDate(from) || !isValidCalendarDate(to) || from > to) throw new AppError(400, 'Choose a valid date range.');
    const customerId = url.searchParams.get('customerId') || undefined;
    const supplierId = url.searchParams.get('supplierId') || undefined;
    const paymentStatus = url.searchParams.get('paymentStatus') || 'All payments';
    const category = url.searchParams.get('category') || 'All categories';

    let identity;
    if (reportType === 'Profit') {
      identity = await requireProfit();
    } else {
      identity = await requireIdentity();
    }

    const db = await database();
    const tenantId = identity.tenantId;

    switch (reportType) {
      case 'Tax summary':
      case 'Sales': {
        const query: Record<string, any> = {
          tenantId,
          status: 'Issued',
          invoiceDate: {$gte: from, $lte: to},
        };
        if (customerId && customerId !== 'All customers') query.customerId = customerId;
        if (paymentStatus === 'Paid') query.duePaise = 0;
        if (paymentStatus === 'Unpaid / partial') query.duePaise = {$gt: 0};
        if (category && category !== 'All categories') {
          if (category === 'Tax invoices') query['lines.taxBasisPoints'] = {$gt: 0};
          else if (category === 'Non-GST invoices') query.lines = {$not: {$elemMatch: {taxTreatment: {$ne: 'NonGST'}}}};
          else if (category === 'New goods') query.businessCategory = 'NewGoods';
          else if (category === 'Used goods') query.businessCategory = 'UsedGoods';
          else if (category === 'Service') query.businessCategory = 'Service';
        }

        const [invoices, customers] = await Promise.all([
          col(db, 'invoices').find(query).sort({invoiceDate: -1}).toArray(),
          col(db, 'customers').find({tenantId}).toArray(),
        ]);
        const custMap = new Map(customers.map((c) => [c._id, c.name]));

        if (reportType === 'Tax summary') {
          const rows = invoices.map((b) => {
            const lines = b.lines || [];
            const taxable = lines.reduce((s: number, l: any) => s + (l.taxableBasePaise || 0), 0) / 100;
            const cgst = lines.reduce((s: number, l: any) => s + (l.cgstPaise || 0), 0) / 100;
            const sgst = lines.reduce((s: number, l: any) => s + (l.sgstPaise || 0), 0) / 100;
            const igst = lines.reduce((s: number, l: any) => s + (l.igstPaise || 0), 0) / 100;
            const total = (b.totalPaise || 0) / 100;
            return [
              b.invoiceNumber || b._id,
              b.invoiceDate,
              b.taxMode || 'Intra-state',
              taxable,
              cgst,
              sgst,
              igst,
              total,
            ];
          });
          return {
            headers: ['Invoice', 'Date', 'Supply type', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total'],
            rows,
          };
        }

        const rows = invoices.map((b) => {
          const total = (b.totalPaise || 0) / 100;
          const paid = (b.allocatedPaidPaise ?? ((b.allocatedReceiptPaise || 0) + (b.allocatedAdvancePaise || 0))) / 100;
          const due = (b.duePaise || 0) / 100;
          return [
            b.invoiceNumber || b._id,
            b.invoiceDate,
            custMap.get(b.customerId) || 'Customer',
            b.businessCategory || 'Sale',
            total,
            paid,
            due,
          ];
        });
        return {
          headers: ['Invoice', 'Date', 'Customer', 'Category', 'Billed total', 'Paid', 'Due'],
          rows,
        };
      }

      case 'Purchases': {
        const query: Record<string, any> = {
          tenantId,
          billStatus: {$in: ['Posted', 'Credited', 'FullyCredited']},
          orderDate: {$gte: from, $lte: to},
        };
        if (supplierId && supplierId !== 'All suppliers') query.supplierId = supplierId;
        if (paymentStatus === 'Paid') query.duePaise = 0;
        if (paymentStatus === 'Unpaid / partial') query.duePaise = {$gt: 0};

        const [purchases, suppliers] = await Promise.all([
          col(db, 'purchases').find(query).sort({orderDate: -1}).toArray(),
          col(db, 'suppliers').find({tenantId}).toArray(),
        ]);
        const suppMap = new Map(suppliers.map((s) => [s._id, s.name]));

        const rows = purchases.map((p) => [
          p.purchaseNumber || p._id,
          p.orderDate,
          suppMap.get(p.supplierId) || 'Supplier',
          p.receiptStatus || 'Received',
          (p.totalPaise || 0) / 100,
          (p.allocatedPaidPaise || 0) / 100,
          (p.duePaise || 0) / 100,
        ]);
        return {
          headers: ['Purchase', 'Date', 'Supplier', 'Receipt status', 'Total', 'Paid', 'Due'],
          rows,
        };
      }

      case 'Inventory': {
        const products = await col(db, 'products').find({tenantId, status: 'Active'}).sort({name: 1}).toArray();
        const buckets = await col(db, 'stockLots').aggregate([
          {$match: {tenantId}}, {$group: {_id: '$productId',
            sellable: {$sum: '$quantitySellable'}, reserved: {$sum: '$quantityReserved'}, defective: {$sum: '$quantityDefective'}}}
        ]).toArray();
        const stock = new Map(buckets.map(l => [l._id, l]));
        const rows = products.map((p) => {
          const l = stock.get(p._id);
          return [p._id, p.name, p.category, (l?.sellable || 0) + (l?.reserved || 0) + (l?.defective || 0),
            l?.sellable || 0, (p.sellingPricePaise || 0) / 100];
        });
        return {
          headers: ['Product ID', 'Product', 'Category', 'On hand', 'Available', 'Price'],
          rows,
        };
      }

      case 'Expenses': {
        const movements = await col(db, 'accountMovements')
          .find({
            tenantId,
            date: {$gte: from, $lte: to},
            category: {$in: ['Expense', 'ExpenseReversal']},
          })
          .sort({date: -1})
          .toArray();

        const rows = movements.map((m) => [
          m.date,
          m.partyName || m.payee || 'Shop',
          m.reason || m.notes || 'Operating expense',
          m.account,
          -signedAccountMovementPaise(m) / 100,
        ]);
        return {
          headers: ['Date', 'Payee', 'Reason', 'Account', 'Amount'],
          rows,
        };
      }

      case 'Customer dues': {
        const query: Record<string, any> = {
          tenantId,
          status: 'Issued',
          duePaise: {$gt: 0},
          invoiceDate: {$lte: to},
        };
        if (customerId && customerId !== 'All customers') query.customerId = customerId;

        const [invoices, customers] = await Promise.all([
          col(db, 'invoices').find(query).sort({dueDate: 1}).toArray(),
          col(db, 'customers').find({tenantId}).toArray(),
        ]);
        const custMap = new Map(customers.map((c) => [c._id, c.name]));

        const rows = invoices.map((b) => [
          b.invoiceNumber || b._id,
          custMap.get(b.customerId) || 'Customer',
          b.promisedPaymentDate || b.dueDate,
          (b.duePaise || 0) / 100,
        ]);
        const opening = await col(db, 'openingReceivables').find({
          tenantId, remainingAmountPaise: {$gt: 0}, date: {$lte: to},
          ...(customerId && !customerId.startsWith('All ') ? {customerId} : {}),
        }).toArray();
        rows.push(...opening.map(o => [o.reference || o._id, custMap.get(o.customerId) || 'Opening balance', o.date, o.remainingAmountPaise / 100]));
        return {
          headers: ['Bill', 'Party', 'Due date', 'Current balance'],
          rows,
        };
      }

      case 'Supplier dues': {
        const query: Record<string, any> = {
          tenantId,
          billStatus: {$in: ['Posted', 'Credited', 'FullyCredited']},
          duePaise: {$gt: 0},
          orderDate: {$lte: to},
        };
        if (supplierId && supplierId !== 'All suppliers') query.supplierId = supplierId;

        const [purchases, suppliers] = await Promise.all([
          col(db, 'purchases').find(query).sort({dueDate: 1}).toArray(),
          col(db, 'suppliers').find({tenantId}).toArray(),
        ]);
        const suppMap = new Map(suppliers.map((s) => [s._id, s.name]));

        const rows = purchases.map((p) => [
          p.purchaseNumber || p._id,
          suppMap.get(p.supplierId) || 'Supplier',
          p.promisedPaymentDate || p.dueDate,
          (p.duePaise || 0) / 100,
        ]);
        const opening = await col(db, 'openingPayables').find({
          tenantId, remainingAmountPaise: {$gt: 0}, date: {$lte: to},
          ...(supplierId && !supplierId.startsWith('All ') ? {supplierId} : {}),
        }).toArray();
        rows.push(...opening.map(o => [o.reference || o._id, suppMap.get(o.supplierId) || 'Opening balance', o.date, o.remainingAmountPaise / 100]));
        return {
          headers: ['Bill', 'Party', 'Due date', 'Current balance'],
          rows,
        };
      }

      case 'Services': {
        const query: Record<string, any> = {
          tenantId,
          createdAt: {
            $gte: new Date(from + 'T00:00:00.000+05:30'),
            $lte: new Date(to + 'T23:59:59.999+05:30'),
          },
        };
        if (customerId && customerId !== 'All customers') query.customerId = customerId;

        const jobs = await col(db, 'serviceJobs').find(query).sort({createdAt: -1}).toArray();
        const rows = jobs.map((j) => [
          j.jobNumber || j._id,
          j.customerSnapshot?.name || 'Customer',
          `${j.device?.brand || ''} ${j.device?.model || ''}`.trim(),
          j.status,
          (j.estimate?.estimatedCostPaise || 0) / 100,
          j.finalAmountPaise == null ? 'Not invoiced' : j.finalAmountPaise / 100,
        ]);
        return {
          headers: ['Job', 'Customer', 'Device', 'Status', 'Estimate', 'Final service amount'],
          rows,
        };
      }

      case 'Returns': {
        const [custReturns, suppReturns] = await Promise.all([
          col(db, 'customerReturns')
            .find({tenantId, date: {$gte: from, $lte: to}})
            .sort({date: -1})
            .toArray(),
          col(db, 'supplierReturns')
            .find({tenantId, date: {$gte: from, $lte: to}})
            .sort({date: -1})
            .toArray(),
        ]);

        const rows = [
          ...custReturns.map((r) => [
            r.returnNumber || r._id,
            'Customer',
            r.invoiceId || '',
            r.date,
            r.quantity ?? r.lines?.reduce((q: number, l: any) => q + (l.quantity || 0), 0) ?? 0,
            (r.refundPaise || 0) / 100,
          ]),
          ...suppReturns.map((r) => [
            r.returnNumber || r._id,
            'Supplier',
            r.purchaseId || '',
            r.date,
            r.quantity || 1,
            (r.totalReturnCreditPaise || 0) / 100,
          ]),
        ];
        return {
          headers: ['Adjustment', 'Type', 'Original bill', 'Date', 'Quantity', 'Refund / supplier credit'],
          rows,
        };
      }

      case 'Profit': {
        const [invoices, adjustments] = await Promise.all([
          col(db, 'invoices')
            .find({tenantId, status: 'Issued', invoiceDate: {$gte: from, $lte: to}})
            .sort({invoiceDate: -1})
            .toArray(),
          col(db, 'manualProfitAdjustments')
            .find({tenantId, date: {$gte: from, $lte: to}})
            .sort({date: -1})
            .toArray(),
        ]);

        const rows = [
          ...invoices.map((b) => [
            b.invoiceNumber || b._id,
            b.invoiceDate,
            b.businessCategory || 'Sale',
            b.manualProfitPaise !== null && b.manualProfitPaise !== undefined
              ? b.manualProfitPaise / 100
              : 'Pending',
          ]),
          ...adjustments.map((a) => [
            a._id,
            a.date,
            'Return adjustment',
            a.signedAdjustmentPaise !== null && a.signedAdjustmentPaise !== undefined
              ? a.signedAdjustmentPaise / 100
              : 'Pending',
          ]),
        ];
        return {
          headers: ['Invoice', 'Date', 'Category', 'Entered profit'],
          rows,
        };
      }

      default:
        throw new AppError(400, `Unknown report type: ${reportType}`);
    }
  });
}
