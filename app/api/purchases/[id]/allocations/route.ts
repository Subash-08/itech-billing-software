import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {col, canReverseAllocation} from '@/server/purchase-service';
import {SupplierAllocationDocument} from '@/server/purchase-schema';

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

    const filter = {tenantId: identity.tenantId, targetId: id};
    const [allocations, total] = await Promise.all([
      col<SupplierAllocationDocument>(db, 'supplierAllocations')
        .find(filter)
        .sort({effectiveDate: -1, createdAt: -1})
        .skip(skip)
        .limit(limit)
        .toArray(),
      col(db, 'supplierAllocations').countDocuments(filter),
    ]);

    const enriched = await Promise.all(
      allocations.map(async a => {
        const check = await canReverseAllocation(db, identity.tenantId, a);
        return {
          ...a,
          canReverse: check.canReverse,
          reverseBlockReason: check.reverseBlockReason,
        };
      })
    );

    return {
      records: enriched,
      allocations: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  });
}
