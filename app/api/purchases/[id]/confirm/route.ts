import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {confirmPurchaseOrder} from '@/server/purchase-service';
import {ConfirmPurchaseOrderSchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const raw = await jsonBody(request).catch(() => ({}));
    const body = raw && Object.keys(raw).length > 0 ? ConfirmPurchaseOrderSchema.parse(raw) : undefined;

    return confirmPurchaseOrder(db, identity, id, body);
  });
}
