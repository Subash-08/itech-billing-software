import {z} from 'zod';
import {endpoint, requireIdentity} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {col} from '@/server/purchase-service';
import {todayInKolkata} from '@/server/purchase-schema';

export const runtime = 'nodejs';

const Query = z.object({
  productId: z.string().trim().min(1).max(128),
  customerId: z.string().trim().min(1).max(128).optional(),
});

/**
 * One bounded payload for the invoice stock picker. This replaces three
 * independently paginated browser requests and returns only fields needed by
 * allocation UI. Authoritative availability is still rechecked atomically
 * when the invoice is issued.
 */
export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const params = Query.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const db = await database();
    const tenantId = identity.tenantId;
    const product = await col(db, 'products').findOne(
      {_id: params.productId, tenantId, status: 'Active'},
      {projection: {_id: 1, name: 1, isSerialTracked: 1}}
    );
    if (!product) throw new AppError(404, 'Product not found or archived.');

    const [lots, reservations] = await Promise.all([
      col(db, 'stockLots')
        .find(
          {tenantId, productId: params.productId, quantitySellable: {$gt: 0}},
          {projection: {_id: 1, batchNumber: 1, lotNumber: 1, receivedDate: 1, createdAt: 1,
            costPaise: 1, quantitySellable: 1, sourceReference: 1, purchaseId: 1}}
        )
        .sort({receivedDate: 1, createdAt: 1, _id: 1})
        .limit(100)
        .toArray(),
      params.customerId
        ? col(db, 'stockReservations')
            .find(
              {tenantId, customerId: params.customerId, productId: params.productId,
                status: 'Active', expiresAt: {$gte: todayInKolkata()}},
              {projection: {_id: 1, reservationNumber: 1, lotId: 1, remainingQuantity: 1,
                quantity: 1, qty: 1, serials: 1, expiresAt: 1, createdAt: 1}}
            )
            .sort({createdAt: 1, _id: 1})
            .limit(100)
            .toArray()
        : Promise.resolve([]),
    ]);

    const lotIds = lots.map((lot: any) => lot._id);
    const serials = product.isSerialTracked && lotIds.length
      ? await col(db, 'serialUnits')
          .find(
            {tenantId, productId: params.productId, lotId: {$in: lotIds}, status: 'InStock'},
            {projection: {_id: 1, lotId: 1, serialOriginal: 1, serial: 1, serialNormalized: 1, status: 1}}
          )
          .sort({createdAt: 1, _id: 1})
          .limit(1000)
          .toArray()
      : [];

    return {
      product: {_id: product._id, name: product.name, isSerialTracked: !!product.isSerialTracked},
      lots,
      reservations,
      serials,
      limits: {lots: 100, reservations: 100, serials: 1000},
    };
  });
}
