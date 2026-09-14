import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {restoreDefectiveStock} from '@/server/purchase-service';
import {RestoreDefectiveStockSchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const body = RestoreDefectiveStockSchema.parse(await jsonBody(request));

    return restoreDefectiveStock(db, identity, body);
  });
}
