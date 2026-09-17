import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {reverseServicePart} from '@/server/service-job-service';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  props: {params: Promise<{id: string; partId: string}>}
) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const {id, partId} = await props.params;
    const body = await jsonBody(request);

    return reverseServicePart(db, identity, id, partId, body);
  });
}
