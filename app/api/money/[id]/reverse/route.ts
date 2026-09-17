import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {reverseMoneyMovement} from '@/server/money-service';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  props: {params: Promise<{id: string}>}
) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const {id} = await props.params;
    const body = await jsonBody(request);

    return reverseMoneyMovement(db, identity, id, body);
  });
}
