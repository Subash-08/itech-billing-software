import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {listSuppliers, createSupplier} from '@/server/master-service';
import {SupplierInputSchema, PaginationQuerySchema} from '@/server/master-schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const url = new URL(request.url);
    const query = PaginationQuerySchema.parse({
      page: url.searchParams.get('page') || '1',
      limit: url.searchParams.get('limit') || '20',
      q: url.searchParams.get('q') || '',
      status: url.searchParams.get('status') || 'Active',
    });
    return listSuppliers(identity, query);
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const body = SupplierInputSchema.parse(await jsonBody(request));
    return createSupplier(identity, body);
  });
}
