import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {saveProfitEntries} from '@/server/closing-service';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  props: {params: Promise<{date: string}>}
) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const {date} = await props.params;
    const body = await jsonBody(request);

    return saveProfitEntries(db, identity, date, body);
  });
}
