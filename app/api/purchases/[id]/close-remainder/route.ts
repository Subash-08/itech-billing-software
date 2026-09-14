import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {closePurchaseRemainder} from '@/server/purchase-service';
import {CloseRemainderSchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const raw = await jsonBody(request).catch(() => ({}));
    const body = raw && Object.keys(raw).length > 0 ? CloseRemainderSchema.parse(raw) : undefined;

    return closePurchaseRemainder(db, identity, id, body);
  });
}

