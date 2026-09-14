import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {migratePhase35StockMovements} from '@/server/purchase-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    let dryRun = false;
    if (url.searchParams.get('dryRun') === 'true') {
      dryRun = true;
    } else {
      const body = await jsonBody(request).catch(() => ({}));
      if (body && body.dryRun === true) {
        dryRun = true;
      }
    }

    return migratePhase35StockMovements(db, identity, dryRun);
  });
}
