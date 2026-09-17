import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {getEnquiry, updateEnquiry} from '@/server/enquiry-service';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const {id} = await params;

    return getEnquiry(db, identity, id);
  });
}

export async function PATCH(
  request: Request,
  {params}: {params: Promise<{id: string}>}
) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const {id} = await params;
    const body = await jsonBody(request);

    return updateEnquiry(db, identity, id, body);
  });
}
