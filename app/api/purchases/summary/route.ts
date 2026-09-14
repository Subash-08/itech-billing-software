import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {getPurchaseSummary} from '@/server/purchase-service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const hasDue = url.searchParams.get('hasDue') === 'true';
    const supplierId = url.searchParams.get('supplierId') || undefined;

    return getPurchaseSummary(db, identity, {hasDue, supplierId});
  });
}
