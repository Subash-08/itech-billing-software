import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {reversePurchaseReceipt} from '@/server/purchase-service';
import {ReverseReceiptSchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const body = ReverseReceiptSchema.parse(await jsonBody(request));

    return reversePurchaseReceipt(db, identity, id, body);
  });
}
