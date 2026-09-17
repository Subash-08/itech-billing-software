import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {getMissedDaysSummary} from '@/server/closing-service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const fromCursor = url.searchParams.get('fromCursor') || undefined;

    return getMissedDaysSummary(db, identity, fromCursor);
  });
}
