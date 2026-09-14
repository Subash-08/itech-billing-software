import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {listWarranties, createWarrantyCoverage} from '@/server/warranties';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const url = new URL(request.url);
    return listWarranties(await database(), identity, Object.fromEntries(url.searchParams.entries()));
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const body = await jsonBody(request);
    return createWarrantyCoverage(await database(), identity, body);
  });
}
