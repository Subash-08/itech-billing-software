import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {createQuotation, listQuotations} from '@/server/sales-service';
import {CreateQuotationSchema} from '@/server/sales-schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams);
    if (!params.search && params.q) params.search = params.q;
    return listQuotations(db, identity, params);
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const body = CreateQuotationSchema.parse(await jsonBody(request));
    return createQuotation(db, identity, body);
  });
}
