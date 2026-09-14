import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {getSupplierStatement} from '@/server/purchase-service';
import {SupplierStatementQuerySchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const url = new URL(request.url);
    const parsed = SupplierStatementQuerySchema.parse(
      Object.fromEntries(url.searchParams.entries())
    );

    return getSupplierStatement(db, identity, id, {
      ...parsed,
    });
  });
}
