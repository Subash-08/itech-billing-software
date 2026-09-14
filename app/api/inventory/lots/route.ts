import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {col} from '@/server/purchase-service';
import {StockLotDocument, InventoryQuerySchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const {page, limit, productId, search} = InventoryQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {tenantId: identity.tenantId};
    if (productId) filter.productId = productId;
    if (search) {
      filter.$or = [
        {batchNumber: {$regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i'}},
        {sourceReference: {$regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i'}},
      ];
    }

    const [lots, total] = await Promise.all([
      col<StockLotDocument>(db, 'stockLots')
        .find(filter)
        .sort({receivedDate: -1, createdAt: -1})
        .skip(skip)
        .limit(limit)
        .toArray(),
      col(db, 'stockLots').countDocuments(filter),
    ]);

    // Enrich with product name if needed
    const productIds = Array.from(new Set(lots.map(l => l.productId)));
    const purchaseIds = Array.from(new Set(lots.map(l => l.purchaseId).filter(Boolean)));
    const [products, purchases] = await Promise.all([
      col(db, 'products').find({tenantId: identity.tenantId, _id: {$in: productIds}}).toArray(),
      col(db, 'purchases').find(
        {tenantId: identity.tenantId, _id: {$in: purchaseIds}},
        {projection: {purchaseNumber: 1, supplierId: 1, supplierSnapshot: 1, paymentStatus: 1, lines: 1}}
      ).toArray(),
    ]);
    const prodMap = new Map(products.map((p: any) => [p._id, p]));
    const purchaseMap = new Map(purchases.map((p: any) => [p._id, p]));

    const enriched = lots.map(l => ({
      ...l,
      product: prodMap.get(l.productId),
      purchase: l.purchaseId ? purchaseMap.get(l.purchaseId) : undefined,
      settlementStatus: l.purchaseId
        ? purchaseMap.get(l.purchaseId)?.paymentStatus || 'Unpaid'
        : 'Opening stock',
    }));

    return {
      records: enriched,
      lots: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  });
}
