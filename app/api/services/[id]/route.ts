import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {getServiceJob, updateServiceJobStatus} from '@/server/service-job-service';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  props: {params: Promise<{id: string}>}
) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const {id} = await props.params;

    return getServiceJob(db, identity, id);
  });
}

export async function PATCH(
  request: Request,
  props: {params: Promise<{id: string}>}
) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const {id} = await props.params;
    const body = await jsonBody(request);

    return updateServiceJobStatus(db, identity, id, body);
  });
}
