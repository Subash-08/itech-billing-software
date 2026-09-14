import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {col} from '@/server/purchase-service';
import {StockMovementDocument, InventoryQuerySchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const {page, limit, productId, lotId, dateFrom, dateTo} = InventoryQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {tenantId: identity.tenantId};
    if (productId) filter.productId = productId;
    if (lotId) filter.lotId = lotId;
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }

    const [movements, total] = await Promise.all([
      col<StockMovementDocument>(db, 'stockMovements')
        .find(filter)
        .sort({date: -1, createdAt: -1})
        .skip(skip)
        .limit(limit)
        .toArray(),
      col(db, 'stockMovements').countDocuments(filter),
    ]);

    const mapped = movements.map(m => ({
      ...m,
      onHandDelta: m.onHandDelta !== undefined ? m.onHandDelta : m.qty,
      sellableDelta: m.sellableDelta !== undefined ? m.sellableDelta : m.qty,
      defectiveDelta: m.defectiveDelta !== undefined ? m.defectiveDelta : 0,
    }));

    return {
      records: mapped,
      movements: mapped,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  });
}
