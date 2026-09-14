import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {recordSupplierReturn, col, canReverseSupplierReturn} from '@/server/purchase-service';
import {SupplierReturnSchema, SupplierReturnDocument, SupplierTransactionListQuerySchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const {purchaseId, supplierId, page, limit, dateFrom, dateTo} = SupplierTransactionListQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {tenantId: identity.tenantId};
    if (purchaseId) filter.purchaseId = purchaseId;
    if (supplierId) filter.supplierId = supplierId;
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }

    const [returns, total] = await Promise.all([
      col<SupplierReturnDocument>(db, 'supplierReturns')
        .find(filter)
        .sort({date: -1, createdAt: -1})
        .skip(skip)
        .limit(limit)
        .toArray(),
      col(db, 'supplierReturns').countDocuments(filter),
    ]);

    const enriched = await Promise.all(
      returns.map(async r => {
        const check = await canReverseSupplierReturn(db, identity.tenantId, r);
        return {
          ...r,
          canReverse: check.canReverse,
          reverseBlockReason: check.reverseBlockReason,
        };
      })
    );

    return {
      returns: enriched,
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
    const body = SupplierReturnSchema.parse(await jsonBody(request));

    return recordSupplierReturn(db, identity, body);
  });
}
