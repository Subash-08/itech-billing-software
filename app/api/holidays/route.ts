import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {getHolidays, scheduleHoliday} from '@/server/closing-service';

export const runtime = 'nodejs';

export async function GET() {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    return getHolidays(db, identity);
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const body = await jsonBody(request);

    return scheduleHoliday(db, identity, body);
  });
}
