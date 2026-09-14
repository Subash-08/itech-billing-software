import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {createStockReservation, listStockReservations} from '@/server/stock-reservations';
import {CreateStockReservationSchema} from '@/server/sales-schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams);
    if (!params.search && params.q) params.search = params.q;
    return listStockReservations(db, identity, params);
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const body = CreateStockReservationSchema.parse(await jsonBody(request));
    return createStockReservation(db, identity, body);
  });
}
