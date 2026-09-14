import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {receivePurchaseStock} from '@/server/purchase-service';
import {ReceiveStockSchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const body = ReceiveStockSchema.parse(await jsonBody(request));

    return receivePurchaseStock(db, identity, id, body);
  });
}
