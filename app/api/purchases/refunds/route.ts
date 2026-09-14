import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {recordSupplierRefund, col} from '@/server/purchase-service';
import {RecordSupplierRefundSchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const supplierId = url.searchParams.get('supplierId') || undefined;
    const filter: Record<string, any> = {tenantId: identity.tenantId};
    if (supplierId) filter.supplierId = supplierId;

    const refunds = await col(db, 'supplierRefunds')
      .find(filter)
      .sort({date: -1, createdAt: -1})
      .toArray();

    return {refunds};
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const body = RecordSupplierRefundSchema.parse(await jsonBody(request));

    return recordSupplierRefund(db, identity, body);
  });
}
