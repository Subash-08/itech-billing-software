import {endpoint, requireIdentity, checkOrigin} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {listStockReservations} from '@/server/stock-reservations';

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
    await requireIdentity();
    throw new AppError(410, 'Stock holds are no longer available. Select stock when issuing the invoice.');
  });
}
