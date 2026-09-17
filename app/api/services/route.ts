import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {listServiceJobs, createServiceJob} from '@/server/service-job-service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const raw = Object.fromEntries(url.searchParams.entries());
    if (!raw.search && raw.q) raw.search = raw.q;

    return listServiceJobs(db, identity, raw);
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const body = await jsonBody(request);

    return createServiceJob(db, identity, body);
  });
}
