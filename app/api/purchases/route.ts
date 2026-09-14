import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {listPurchases, createPurchase, recordReceiveShortcut, recordReceiveAndPayShortcut} from '@/server/purchase-service';
import {CreatePurchaseSchema, RecordReceiveSchema, RecordReceiveAndPaySchema, PurchaseListQuerySchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const raw = Object.fromEntries(url.searchParams.entries());
    if (!raw.search && raw.q) raw.search = raw.q;
    return listPurchases(db, identity, PurchaseListQuerySchema.parse(raw));
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const body = await jsonBody(request);

    if (body && typeof body === 'object' && ('shortcut' in body || ('receipt' in body && 'payment' in body))) {
      const parsed = RecordReceiveAndPaySchema.parse(body);
      return recordReceiveAndPayShortcut(db, identity, parsed);
    }

    if (body && typeof body === 'object' && 'receipt' in body && !('payment' in body)) {
      const parsed = RecordReceiveSchema.parse(body);
      return recordReceiveShortcut(db, identity, parsed);
    }

    const parsed = CreatePurchaseSchema.parse(body);
    return createPurchase(db, identity, parsed);
  });
}
