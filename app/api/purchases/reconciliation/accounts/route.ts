import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {reconcileTenantAccountBalances} from '@/server/purchase-service';

export const runtime = 'nodejs';

export async function GET() {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();

    return reconcileTenantAccountBalances(db, identity);
  });
}
