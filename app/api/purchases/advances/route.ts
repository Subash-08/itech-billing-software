import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {col} from '@/server/purchase-service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const supplierId = url.searchParams.get('supplierId') || undefined;
    const status = url.searchParams.get('status') || undefined;

    const filter: Record<string, any> = {tenantId: identity.tenantId};
    if (supplierId) filter.supplierId = supplierId;
    if (status) filter.status = status;

    const advances = await col(db, 'supplierAdvances')
      .find(filter)
      .sort({createdAt: -1})
      .toArray();

    return {advances};
  });
}
