import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {recordSupplierPayment, col, canReversePayment} from '@/server/purchase-service';
import {RecordSupplierPaymentSchema, SupplierPaymentDocument, SupplierTransactionListQuerySchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const {page, limit, supplierId, purchaseId, dateFrom, dateTo} = SupplierTransactionListQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {tenantId: identity.tenantId};
    if (supplierId) filter.supplierId = supplierId;
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }

    if (purchaseId) {
      const allocs = await col(db, 'supplierAllocations').find(
        {tenantId: identity.tenantId, targetId: purchaseId},
        {projection: {sourceId: 1}}
      ).toArray();
      const paymentIds = Array.from(new Set(allocs.map((a: any) => a.sourceId).filter(Boolean)));
      filter._id = {$in: paymentIds};
    }

    const [payments, total] = await Promise.all([
      col<SupplierPaymentDocument>(db, 'supplierPayments').find(filter).sort({date: -1, createdAt: -1}).skip(skip).limit(limit).toArray(),
      col(db, 'supplierPayments').countDocuments(filter),
    ]);

    const enriched = await Promise.all(
      payments.map(async p => {
        const check = await canReversePayment(db, identity.tenantId, p);
        return {
          ...p,
          canReverse: check.canReverse,
          reverseBlockReason: check.reverseBlockReason,
        };
      })
    );

    return {
      payments: enriched,
      records: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const body = RecordSupplierPaymentSchema.parse(await jsonBody(request));

    return recordSupplierPayment(db, identity, body);
  });
}
