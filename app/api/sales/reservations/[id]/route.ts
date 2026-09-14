import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {getStockReservation} from '@/server/stock-reservations';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    return getStockReservation(db, identity, id);
  });
}
