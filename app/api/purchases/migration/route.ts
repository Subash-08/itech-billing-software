import {endpoint, requireIdentity, checkOrigin} from '@/server/auth';
import {database} from '@/server/db';
import {migratePhase3AccountBalances} from '@/server/purchase-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();

    return migratePhase3AccountBalances(db, identity);
  });
}
