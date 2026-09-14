import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {postPurchaseBill} from '@/server/purchase-service';
import {PostPurchaseBillSchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const body = PostPurchaseBillSchema.parse(await jsonBody(request));

    return postPurchaseBill(db, identity, id, body);
  });
}
