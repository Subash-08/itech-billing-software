import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {bulkCloseHolidays} from '@/server/closing-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const body = await jsonBody(request);

    return bulkCloseHolidays(db, identity, body);
  });
}
