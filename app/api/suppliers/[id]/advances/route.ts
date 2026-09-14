import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {col} from '@/server/purchase-service';
import {SupplierAdvanceDocument, deriveAdvanceStatus, SupplierHistoryQuerySchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const url = new URL(request.url);

    const {page, limit, dateFrom, dateTo} = SupplierHistoryQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {tenantId: identity.tenantId, supplierId: id};
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(`${dateFrom}T00:00:00+05:30`);
      if (dateTo) filter.createdAt.$lte = new Date(`${dateTo}T23:59:59.999+05:30`);
    }
    const [advances, total] = await Promise.all([
      col<SupplierAdvanceDocument>(db, 'supplierAdvances')
        .find(filter)
        .sort({createdAt: -1})
        .skip(skip)
        .limit(limit)
        .toArray(),
      col(db, 'supplierAdvances').countDocuments(filter),
    ]);

    const mapped = advances.map(adv => ({
      ...adv,
      status: deriveAdvanceStatus(adv),
    }));

    return {
      records: mapped,
      advances: mapped,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  });
}
