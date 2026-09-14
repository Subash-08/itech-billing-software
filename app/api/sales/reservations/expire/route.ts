import {endpoint, requireIdentity, checkOrigin} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {processExpiredReservations, processExpiredReservationsAllTenants} from '@/server/stock-reservations';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return endpoint(async () => {
    const db = await database();
    const cronSecret = request.headers.get('x-internal-cron-secret');
    const expectedSecret = process.env.INTERNAL_CRON_SECRET;

    // Check if called via authenticated internal scheduler
    if (expectedSecret && cronSecret === expectedSecret) {
      // Internal batch worker running bounded batch across tenants
      return processExpiredReservationsAllTenants(db, 100);
    }

    // Otherwise must be authenticated browser session
    checkOrigin(request);
    const identity = await requireIdentity();
    // Strictly scoped to session tenant
    return processExpiredReservations(db, identity.tenantId, 50);
  });
}
