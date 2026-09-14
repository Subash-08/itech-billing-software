import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {col, canReverseSupplierReturn} from '@/server/purchase-service';
import {SupplierReturnDocument} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const url = new URL(request.url);

    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    const filter = {tenantId: identity.tenantId, purchaseId: id};
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
      records: enriched,
      returns: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  });
}
