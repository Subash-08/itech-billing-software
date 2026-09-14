import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {cancelPurchaseOrder} from '@/server/purchase-service';
import {CancelPurchaseOrderSchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const raw = await jsonBody(request).catch(() => ({}));
    const body = raw && Object.keys(raw).length > 0 ? CancelPurchaseOrderSchema.parse(raw) : undefined;

    return cancelPurchaseOrder(db, identity, id, body);
  });
}

