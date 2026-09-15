import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {col} from '@/server/purchase-service';
import {normalizeSerial} from '@/server/master-schema';
import {InventoryQuerySchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const {page, limit, productId, lotId, status, search} = InventoryQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {tenantId: identity.tenantId};
    if (productId) filter.productId = productId;
    if (lotId) filter.lotId = lotId;
    if (status) filter.status = status;
    if (search) {
      const normalized = normalizeSerial(search);
      if (normalized) filter.serialNormalized = {$regex: normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};
    }

    const [serials, total] = await Promise.all([
      col(db, 'serialUnits')
        .find(filter)
        .sort({createdAt: -1})
        .skip(skip)
        .limit(limit)
        .toArray(),
      col(db, 'serialUnits').countDocuments(filter),
    ]);

    const lotIds = Array.from(new Set(serials.map((s: any) => s.lotId).filter(Boolean)));
    const lots = await col(db, 'stockLots').find(
      {tenantId: identity.tenantId, _id: {$in: lotIds}},
      {projection: {sourceReference: 1, purchaseId: 1, purchaseReceiptId: 1, receivedDate: 1}}
    ).toArray();
    const lotMap = new Map(lots.map((l: any) => [l._id, l]));
    const enriched = serials.map((serial: any) => ({...serial, lot: lotMap.get(serial.lotId)}));
    return {
      records: enriched,
      serials: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  });
}
