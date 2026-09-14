import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {reverseSupplierPayment} from '@/server/purchase-service';
import {ReverseOperationSchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const body = ReverseOperationSchema.parse(await jsonBody(request));

    return reverseSupplierPayment(db, identity, id, body);
  });
}
