import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {getClosingDashboard, closeBusinessDay} from '@/server/closing-service';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  props: {params: Promise<{date: string}>}
) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const {date} = await props.params;

    return getClosingDashboard(db, identity, date);
  });
}

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

    return closeBusinessDay(db, identity, date, body);
  });
}
