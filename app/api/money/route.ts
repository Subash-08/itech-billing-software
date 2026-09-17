import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {
  getAccountRegister,
  recordMoneyIn,
  recordMoneyOut,
  recordTransfer,
} from '@/server/money-service';
import {MoneyListQuerySchema} from '@/server/money-schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const raw = Object.fromEntries(url.searchParams.entries());
    if (!raw.search && raw.q) raw.search = raw.q;
    const query = MoneyListQuerySchema.parse(raw);
    return getAccountRegister(db, identity, query);
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const body = await jsonBody(request);

    if (!body || typeof body !== 'object') {
      throw new AppError(400, 'Invalid request body.');
    }

    const action = (body as any).action;
    if (action === 'in') {
      return recordMoneyIn(db, identity, body);
    } else if (action === 'out') {
      return recordMoneyOut(db, identity, body);
    } else if (action === 'transfer') {
      return recordTransfer(db, identity, body);
    }

    throw new AppError(400, `Invalid action "${action}". Expected "in", "out", or "transfer".`);
  });
}
