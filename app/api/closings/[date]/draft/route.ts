import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {saveReconciliationDraft} from '@/server/closing-service';

export const runtime = 'nodejs';

export async function PUT(
  request: Request,
  props: {params: Promise<{date: string}>}
) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const {date} = await props.params;
    const body = await jsonBody(request);

    return saveReconciliationDraft(db, identity, date, body);
  });
}
