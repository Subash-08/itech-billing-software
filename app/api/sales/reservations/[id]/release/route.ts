import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {releaseStockReservation} from '@/server/stock-reservations';
import {ReleaseStockReservationSchema} from '@/server/sales-schema';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const body = ReleaseStockReservationSchema.parse(await jsonBody(request));
    if (body.reservationId !== id) {
      throw new AppError(400, 'reservationId in body must match the URL parameter.');
    }
    return releaseStockReservation(db, identity, body);
  });
}
