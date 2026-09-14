import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {quarantineStockLot} from '@/server/purchase-service';
import {QuarantineStockSchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const body = QuarantineStockSchema.parse(await jsonBody(request));

    return quarantineStockLot(db, identity, body);
  });
}
